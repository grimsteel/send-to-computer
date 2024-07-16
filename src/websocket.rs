use std::{collections::HashMap, fmt::Display, path::Path, sync::{Arc, RwLock}};

use axum::extract::ws::{self, WebSocket};
use futures_util::StreamExt;
use log::{debug, error, warn};
use serde::{Deserialize, Serialize};
use tokio::{select, sync::mpsc::{unbounded_channel, UnboundedReceiver, UnboundedSender}, task::{spawn_blocking, JoinError}};

use crate::store::{self, Message, MessageRecipient, Store, StoreError};

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
    Error(String),

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

/// errors that get sent to the client
#[derive(Debug)]
enum ServerError {
    UsernameInUse,
    InvalidUsername, // invalid characters
    StoreError(StoreError),
    JoinError(JoinError)
}

impl From<StoreError> for ServerError { fn from(v: StoreError) -> Self { Self::StoreError(v) } }
impl From<JoinError> for ServerError { fn from (v: JoinError) -> Self { Self::JoinError(v) } }

impl Display for ServerError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::UsernameInUse => write!(f, "Someone has already logged in with that username"),
            Self::InvalidUsername => write!(f, "Username may only contain alphanumeric characters"),
            Self::JoinError(err) => write!(f, "Join error: {err}"),
            Self::StoreError(err) => write!(f, "Store error: {err}")
        }
    }
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

pub struct WsHandler {
    socket: WebSocket,
    state: Arc<WsState>,
    user_id: Option<u16>,
    channel: (UnboundedSender<ServerMessage>, UnboundedReceiver<ServerMessage>)
}

impl WsHandler {
    pub fn new(socket: WebSocket, state: Arc<WsState>) -> Self {
        // setup the channel (but don't update the users map just yet)
        let channel = unbounded_channel::<ServerMessage>();
        
        WsHandler { socket, state, channel, user_id: None }
    }

    /// send a ServerMessage to our client
    async fn send_message(&mut self, message: &ServerMessage) {
        match rmp_serde::to_vec(message) {
            Ok(data) => {
                if let Err(err) = self.socket.send(ws::Message::Binary(data)).await {
                    warn!("Could not sent message: {err}");
                }
            },
            Err(err) => {
                warn!("Could not encode message: {err}");
            }
        }
    }

    /// send a broadcast message to all clients in the map
    fn send_broadcast(&self, message: ServerMessage) {
        for client in self.state.users.read().unwrap().values() {
            let _ = client.send(message.clone());
        }
    }

    async fn handle_client_message<'a>(&mut self, message: ClientMessage<'a>) -> Result<(), ServerError> {
        match message {
            ClientMessage::RequestUsername(requested_username) => {
                // they can't do this if they're already initialized
                if self.user_id.is_some() {
                    warn!("User tried to re-initialize");
                    return Ok(());
                }

                // make sure all characters are valid
                if !requested_username.chars()
                    .all(|c| c.is_ascii_alphanumeric() || c == '_')
                {
                    return Err(ServerError::InvalidUsername);
                }

                let state_2 = self.state.clone();
                let username: String = requested_username.into();
                let (user_id, broadcast_message) = spawn_blocking(move || {
                    let existing_user_id = state_2.store.get_id_for_username(&username)?;
                    if let Some(id) = existing_user_id {
                        {
                            // see if a user with that ID already exists
                            // TODO: ip-based kicking to help with "ghosts" users that never properly disconnected
                            let users = state_2.users.read().unwrap();
                            if users.contains_key(&id) {
                                return Err(ServerError::UsernameInUse);
                            }
                        }

                        Ok((id, ServerMessage::UserOnline(id)))
                    } else {
                        // create user
                        let id = state_2.store.create_user(username.clone())?;

                        let user = ServerUser { id, name: username, online: true };

                        Ok((id, ServerMessage::UserAdded(user)))
                    }
                }).await??;

                self.send_broadcast(broadcast_message);

                self.state.users.write().unwrap().insert(user_id, self.channel.0.clone());

                // get existing users
                let state_2 = self.state.clone();
                let (users, groups) = spawn_blocking(move || -> Result<_, ServerError> {
                    let online_users = state_2.users.read().unwrap();
                    let users = state_2.store.list_users()?;
                    // list all  groups they belong to
                    let groups = state_2.store.get_groups_for_user(user_id)?.into_iter()
                        .map(|(id, (name, members))| {
                            ServerGroup {
                                id,
                                name,
                                // resolve the member usernames
                                members: members
                                    .into_iter()
                                    .filter_map(|id| users.get(&id).map(Into::into))
                                    .collect()
                            }
                        })
                        .collect();
                    // turn these into ServerUsers
                    let users = users.into_iter()
                        .map(|(id, username)|
                             ServerUser {
                                 id,
                                 name: username,
                                 online: online_users.contains_key(&id)
                             }
                        )
                        .collect();
                    Ok((users, groups))
                }).await??;

                let welcome = ServerMessage::Welcome { user_id, users, groups };
                self.send_message(&welcome).await;
            },
            other => {
                warn!("unimplemented: {other:?}");
            }
        }
        Ok(())
    }

    pub async fn handle(&mut self) {
        loop {
            select! {
                message = self.channel.1.recv() => {
                    // somebody wants us to send a message to this client
                    if let Some(message) = message { self.send_message(&message).await } else { break; }
                },
                message = self.socket.next() => {
                    // message from the client
                    match message {
                        None => break,
                        Some(Ok(message)) => {
                            match message {
                                ws::Message::Binary(data) => {
                                    // decode it
                                    match rmp_serde::from_slice(&data) {
                                        Ok(message) => {
                                            if let Err(err) = self.handle_client_message(message).await {
                                                warn!("Error while processing message: {err}");
                                                // also send this error to the client
                                                let message = ServerMessage::Error(format!("{err}"));
                                                self.send_message(&message).await;
                                            }
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
    }
}

impl Drop for WsHandler {
    fn drop(&mut self) {
        // if this user had signed in successfully, we need to tell other clients they left
        debug!("dropping {}", self.user_id.is_some());
        if let Some(id) = self.user_id {
            // remove this user
            {
                let mut users = self.state.users.write().unwrap();
                users.remove(&id);
            }

            let message = ServerMessage::UserOffline(id);
            self.send_broadcast(message);
        }
    }
}
