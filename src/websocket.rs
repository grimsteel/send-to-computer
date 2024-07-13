use std::{collections::HashMap, path::Path, sync::{Arc, Mutex}};

use axum::extract::ws::{self, WebSocket};
use futures_util::{stream::SplitSink, StreamExt};
use serde::{Deserialize, Serialize};

use crate::store::{self, Message, MessageRecipient, Store};

pub struct WsState {
    store: Store,
    users: Mutex<HashMap<u16, SplitSink<WebSocket, ws::Message>>>
}

impl WsState {
    pub fn new<T: AsRef<Path>>(store_path: Option<T>) -> store::Result<Self> {
        let store = Store::init(store_path)?;
        Ok(Self {
            store,
            users: Mutex::new(HashMap::new())
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
enum ServerMessage<'a> {
    UsernameInUse,
    InvalidUsername, // invalid characters

    Welcome { user_id: u16, users: Vec<ServerUser<'a>>, groups: Vec<ServerGroup<'a>> },

    UserUpdate(ServerUser<'a>),
        
    MessagesForRecipient { recipient: MessageRecipient, messages: Vec<(u16, Message)> },
    MessageSent(u16, Message),
    MessageEdited(u16, &'a str),
    MessageTagsEdited(u16, &'a [&'a str]),
    MessageDeleted(u16),

    GroupAdded(ServerGroup<'a>),
    GroupEdited(ServerGroup<'a>),
    GroupDeleted(u16)
}

#[derive(Serialize, Debug, Clone)]
struct ServerUser<'a> {
    id: u16,
    name: &'a str,
    online: bool
}

#[derive(Serialize, Debug, Clone)]
struct ServerGroup<'a> {
    id: u16,
    name: &'a str,
    members: &'a [&'a str]
}


pub async fn ws_handler(mut socket: WebSocket, state: Arc<WsState>) {
    let (tx, mut rx) = socket.split();

    let mut users = state.users.lock().expect("can lock mutex");
    users.insert(0, tx);
}
