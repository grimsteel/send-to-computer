use std::{collections::HashMap, path::Path, sync::{Arc, RwLock}};

use axum::extract::ws::{self, WebSocket};
use futures_util::{stream::SplitSink, SinkExt, StreamExt};
use log::{error, warn};
use serde::{Deserialize, Serialize};
use tokio::{select, sync::mpsc::{unbounded_channel, UnboundedSender}};

use crate::store::{self, Message, MessageRecipient, Store};

pub struct WsState {
    store: Store,
    users: RwLock<HashMap<u16, UnboundedSender<ServerMessage>>>
}

impl WsState {
    pub fn new<T: AsRef<Path>>(store_path: Option<T>) -> store::Result<Self> {
        let store = Store::init(store_path)?;
        Ok(Self {
            store,
            users: RwLock::new(HashMap::new())
        })
    }
}

#[derive(Deserialize, Debug, Clone)]
enum ClientMessage<'a> {
    RequestUsername(&'a str),

    // Messages
    GetMessages(MessageRecipient),
    SendMessage { message: &'a str, recipient: MessageRecipient },
    EditMessage { id: u16, new_message: &'a str },
    EditTags { id: u16, new_tags: Vec<&'a str> },
    DeleteMessage(u16),

    // Groups
    CreateGroup { name: &'a str, members: Vec<u16> },
    EditGroup { id: u16, new_name: &'a str, new_members: Vec<u16> },
    DeleteGroup(u16)
}

#[derive(Serialize, Debug, Clone)]
enum ServerMessage {
    UsernameInUse,
    InvalidUsername, // invalid characters

    Welcome { user_id: u16, users: Vec<ServerUser>, groups: Vec<ServerGroup> },

    // a completely new user was added
    UserAdded(ServerUser),
    // an existing user joined
    UserOnline(u16),
    UserOffline(u16),
        
    MessagesForRecipient { recipient: MessageRecipient, messages: Vec<(u16, Message)> },
    MessageSent(u16, Message),
    MessageEdited(u16, String),
    MessageTagsEdited(u16, Vec<String>),
    MessageDeleted(u16),

    GroupAdded(ServerGroup),
    GroupEdited(ServerGroup),
    GroupDeleted(u16)
}

#[derive(Serialize, Debug, Clone)]
struct ServerUser {
    id: u16,
    name: String,
    online: bool
}

#[derive(Serialize, Debug, Clone)]
struct ServerGroup {
    id: u16,
    name: String,
    members: Vec<String>
}


pub async fn ws_handler(mut socket: WebSocket, state: Arc<WsState>) {
    let (mut socket_tx, mut socket_rx) = socket.split();

    // setup the channel (but don't update the users map just yet)
    let (channel_tx, mut channel_rx) = unbounded_channel::<ServerMessage>();

    let mut user_id = None;

    loop {
        select! {
            message = channel_rx.recv() => {
                // somebody wants us to send a message to this client
                if let Some(message) = message {
                    match rmp_serde::to_vec(&message) {
                        Ok(data) => {
                            if let Err(err) = socket_tx.send(ws::Message::Binary(data)).await {
                                warn!("Could not sent message: {err}");
                            }
                        },
                        Err(err) => {
                            warn!("Could not encode message: {err}");
                        }
                    }
                } else { break; }
            },
            message = socket_rx.next() => {
                // message from the client
                match message {
                    None => break,
                    Some(Ok(message)) => {
                        match message {
                            ws::Message::Binary(data) => {
                                // decode it
                                match rmp_serde::from_slice::<ClientMessage>(&data) {
                                    Ok(message) => {
                                        
                                    },
                                    Err(err) => {
                                        // this isn't a fatal error, but print the message
                                        warn!("Could not decode message: {err}");
                                    }
                                }
                            },
                            // websocket closed
                            ws::Message::Close(_) => break,
                            _ => {}
                        }
                    },
                    Some(Err(err)) => {
                        error!("Error while receiving message: {err}");
                        break;
                    }
                }
            }
            
        }
    }

    // if this user had signed in successfully, we need to tell other clients they left
    if let Some(id) = user_id {
        // remove this user
        {
            let mut users = state.users.write().unwrap();
            users.remove(&id);
        }

        let message = ServerMessage::UserOffline(id);

        // send to each other user
        let users = state.users.read().unwrap();
        for user in users.values() {
            let _ = user.send(message.clone());
        }
    }

    //let mut users = state.users.write().unwrap();
    //users.insert(0, channel_tx);
}
