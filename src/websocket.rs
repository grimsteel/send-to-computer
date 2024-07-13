use serde::{Deserialize, Serialize};

use crate::store::MessageRecipient;

#[derive(Serialize, Deserialize, Debug, Clone)]
enum ClientMessage {
    RequestUsername(String),

    // Messages
    GetMessages(MessageRecipient),
    SendMessage { message: String, recipient: MessageRecipient },
    EditMessage { id: u16, new_message: String },
    EditTags { id: u16, new_tags: Vec<String> },
    DeleteMessage(u16),

    // Groups
    CreateGroup { name: String, members: Vec<u16> },
    EditGroup { id: u16, new_name: String, new_members: Vec<u16> },
    DeleteGroup(u16)
}
