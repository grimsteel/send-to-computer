use std::{collections::HashMap, fmt::Display, path::Path, sync::{Arc, RwLock}};

use axum::extract::ws::{self, WebSocket};
use futures_util::StreamExt;
use log::{debug, error, warn};
use rmp_serde::Serializer;
use serde::{Deserialize, Serialize};
use tokio::{select, sync::mpsc::{unbounded_channel, UnboundedReceiver, UnboundedSender, error::SendError}, task::{spawn_blocking, JoinError}};

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
#[serde(tag = "type")]
enum ClientMessage<'a> {
    RequestUsername { username: &'a str },

    // Messages
    GetMessages { recipient: MessageRecipient },
    SendMessage { message: &'a str, recipient: MessageRecipient },
    EditMessage { id: u16, new_message: &'a str },
    EditTags { id: u16, new_tags: Vec<String> },
    DeleteMessage { id: u16 },

    // Groups
    CreateGroup { name: &'a str, members: Vec<u16> },
    EditGroup { id: u16, new_name: &'a str, new_members: Vec<u16> },
    DeleteGroup { id: u16 }
}

#[derive(Serialize, Debug, Clone)]
#[serde(tag = "type" )]
enum ServerMessage {
    Error { err: String },

    Welcome { user_id: u16, users: Vec<ServerUser>, groups: Vec<ServerGroup> },

    // a completely new user was added
    UserAdded { user: ServerUser },
    // an existing user joined
    UserOnline { id: u16 },
    UserOffline { id: u16 },
        
    MessagesForRecipient { recipient: MessageRecipient, messages: Vec<MessageWithId> },
    MessageSent { message: MessageWithId },
    MessageEdited { id: u16, message: String },
    MessageTagsEdited { id: u16, tags: Vec<String> },
    MessageDeleted { id: u16 },

    GroupAdded { group: ServerGroup },
    GroupEdited { group: ServerGroup },
    GroupDeleted { id: u16 }
}

/// errors that get sent to the client
#[derive(Debug)]
enum ServerError {
    UsernameInUse,
    InvalidUsername, // invalid characters
    SelfMessage,
    StoreError(StoreError),
    JoinError(JoinError),
    SendError(SendError<ServerMessage>)
}

impl From<StoreError> for ServerError { fn from(v: StoreError) -> Self { Self::StoreError(v) } }
impl From<JoinError> for ServerError { fn from (v: JoinError) -> Self { Self::JoinError(v) } }
impl From<SendError<ServerMessage>> for ServerError { fn from (v: SendError<ServerMessage>) -> Self { Self::SendError(v) } }

impl Display for ServerError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::UsernameInUse => write!(f, "Someone has already logged in with that username"),
            Self::InvalidUsername => write!(f, "Username may only contain alphanumeric characters"),
            Self::SelfMessage => write!(f, "You cannot send messages to yourself"),
            Self::JoinError(err) => write!(f, "Error while joining threads: {err}"),
            Self::StoreError(err) => write!(f, "Store error: {err}"),
            Self::SendError(err) => write!(f, "Error while sending message: {err}")
        }
    }
}

#[derive(Serialize, Debug, Clone)]
struct MessageWithId {
    id: u16,
    #[serde(flatten)]
    message: Message
}

/// IDs in the DB are stored separately
impl From<(u16, Message)> for MessageWithId {
    fn from((id, message): (u16, Message)) -> Self {
        Self { id, message }
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
        let mut data = Vec::new();
        let mut serializer = Serializer::new(&mut data)
            .with_struct_map();
        match message.serialize(&mut serializer) {
            Ok(_) => {
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

    /// send a broadcast message to all clients in the map that match the recipient
    async fn send_to_recipient(&mut self, message: ServerMessage, recipient: MessageRecipient) -> Result<(), ServerError> {
        match recipient {
            MessageRecipient::User(user_id) => {
                // send it to our user too
                self.send_message(&message).await;
                
                // if this user is in the map, send to them
                if let Some(client) = self.state.users.read().unwrap().get(&user_id) {
                    client.send(message)?;
                }
            },
            MessageRecipient::Group(group_id) => {
                let state = self.state.clone();
                if let Some(members) = spawn_blocking(move || state.store.get_group_members(group_id)).await?? {
                    // send the message to each user in the group
                    let users = self.state.users.read().unwrap();
                    for member in members {
                        if let Some(client) = users.get(&member) {
                            client.send(message.clone())?;
                        }
                    }
                }
            }
        }
        Ok(())
    }

    async fn handle_client_message<'a>(&mut self, message: ClientMessage<'a>) -> Result<(), ServerError> {
        match message {
            ClientMessage::RequestUsername { username: requested_username} => {
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

                let state = self.state.clone();
                let username: String = requested_username.into();

                // get a user id for this username
                // (depends on whether this user already existed or not)
                let (user_id, broadcast_message) = spawn_blocking(move || {
                    let existing_user_id = state.store.get_id_for_username(&username)?;
                    if let Some(id) = existing_user_id {
                        {
                            // see if a user with that ID already exists
                            // TODO: ip-based kicking to help with "ghosts" users that never properly disconnected
                            let users = state.users.read().unwrap();
                            if users.contains_key(&id) {
                                return Err(ServerError::UsernameInUse);
                            }
                        }

                        Ok((id, ServerMessage::UserOnline { id }))
                    } else {
                        // create user
                        let id = state.store.create_user(username.clone())?;

                        let user = ServerUser { id, name: username, online: true };

                        Ok((id, ServerMessage::UserAdded { user }))
                    }
                }).await??;

                self.send_broadcast(broadcast_message);

                self.state.users.write().unwrap().insert(user_id, self.channel.0.clone());
                self.user_id = Some(user_id);

                // get existing users
                let state = self.state.clone();
                let (users, groups) = spawn_blocking(move || -> Result<_, ServerError> {
                    let online_users = state.users.read().unwrap();
                    let users = state.store.list_users()?;
                    // list all  groups they belong to
                    let groups = state.store.get_groups_for_user(user_id)?.into_iter()
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
                        .filter(|(id, _)| *id != user_id)
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
            ClientMessage::GetMessages { recipient } => {
                // they can't do this if they haven't initialized
                if let Some(id) = self.user_id {
                    let state = self.state.clone();
                    // retrieve the messages from the store
                    let messages = spawn_blocking(move || state.store.get_messages(id, recipient)).await??
                        .into_iter()
                        .map(|m| m.into())
                        .collect();
                    let messages = ServerMessage::MessagesForRecipient { recipient, messages };
                    self.send_message(&messages).await;
                } else {
                    warn!("Uninitialized user");
                }
            },
            ClientMessage::SendMessage { message, recipient } => {
                // they can't do this if they haven't initialized
                if let Some(id) = self.user_id {
                    if recipient == MessageRecipient::User(id) {
                        return Err(ServerError::SelfMessage);
                    }
                    
                    let state = self.state.clone();
                    let message = message.into();
                    let message = spawn_blocking(move || state.store.send_message(message, id, recipient)).await??
                        .into(); 
                    let server_message = ServerMessage::MessageSent { message };
                    self.send_to_recipient(server_message, recipient).await?;
                } else {
                    warn!("Uninitialized user");
                }
            },
            ClientMessage::DeleteMessage { id } => {
                // they can't do this if they haven't initialized
                if let Some(user_id) = self.user_id {
                    let state = self.state.clone();
                    if let Some(message) = spawn_blocking(move || state.store.delete_message(id, user_id)).await?? {
                        // notify all recipients that it was deleted
                        let server_message = ServerMessage::MessageDeleted { id };
                        self.send_to_recipient(server_message, message.recipient).await?;
                    }
                } else {
                    warn!("Uninitialized user");
                }
            },
            ClientMessage::EditMessage { id, new_message } => {
                // they can't do this if they haven't initialized
                if let Some(user_id) = self.user_id {
                    let state = self.state.clone();
                    let new_message = new_message.into();
                    if let Some(message) = spawn_blocking(move || state.store.edit_message(id, new_message, user_id)).await?? {
                        // notify all recipients that it was edited
                        let server_message = ServerMessage::MessageEdited { id, message: message.message };
                        self.send_to_recipient(server_message, message.recipient).await?;
                    }
                } else {
                    warn!("Uninitialized user");
                }
            },
            ClientMessage::EditTags { id, new_tags } => {
                // they can't do this if they haven't initialized
                if let Some(user_id) = self.user_id {
                    let state = self.state.clone();
                    let new_tags = new_tags.into();
                    if let Some(message) = spawn_blocking(move || state.store.edit_message_tags(id, new_tags, user_id)).await?? {
                        // notify all recipients that it was edited
                        let server_message = ServerMessage::MessageTagsEdited { id, tags: message.tags };
                        self.send_to_recipient(server_message, message.recipient).await?;
                    }
                } else {
                    warn!("Uninitialized user");
                }
            }
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
                                                let message = ServerMessage::Error { err: format!("{err}") };
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

            let message = ServerMessage::UserOffline { id };
            self.send_broadcast(message);
        }
    }
}
