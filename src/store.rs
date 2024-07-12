use std::{borrow::Cow, collections::HashMap, fmt::Display, path::Path};

use chrono::Utc;
use redb::{
    backends::InMemoryBackend, AccessGuard, Database, Key, ReadableTable, TableDefinition,
    TypeName, Value,
};
use serde::{Deserialize, Serialize};

// either a group or a user
#[derive(Debug, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord, Copy, Clone)]
pub enum MessageRecipient {
    User(u16),
    Group(u16),
}

impl Value for MessageRecipient {
    type SelfType<'a> = Self;
    type AsBytes<'a> = Vec<u8>;
    fn fixed_width() -> Option<usize> { None }
    fn from_bytes<'a>(data: &'a [u8]) -> Self where Self: 'a { bincode::deserialize(data).unwrap() }
    fn as_bytes<'a, 'b: 'a>(value: &'a Self) -> Vec<u8> { bincode::serialize(value).unwrap() }
    fn type_name() -> TypeName { TypeName::new("MessageSenderRecipient") }
}

impl Key for MessageRecipient {
    fn compare(data1: &[u8], data2: &[u8]) -> std::cmp::Ordering {
        Self::from_bytes(data1).cmp(&Self::from_bytes(data2))
    }
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Eq, Clone)]
pub struct Message {
    pub sender: u16,
    pub recipient: MessageRecipient,
    pub message: String,
    pub time: i64,
    pub tags: Vec<String>
}

impl Value for Message {
    type SelfType<'a> = Self;
    type AsBytes<'a> = Vec<u8>;
    fn fixed_width() -> Option<usize> { None }
    fn from_bytes<'a>(data: &'a [u8]) -> Self where Self: 'a { bincode::deserialize(data).unwrap() }
    fn as_bytes<'a, 'b: 'a>(value: &'a Self) -> Vec<u8> { bincode::serialize(value).unwrap() }
    fn type_name() -> TypeName { TypeName::new("Message") }
}

const USERS_TABLE: TableDefinition<u16, String> = TableDefinition::new("users");
const GROUPS_TABLE: TableDefinition<u16, (String, Vec<u16>)> = TableDefinition::new("groups");
const MESSAGES_TABLE: TableDefinition<
    u16,
    Message,
> = TableDefinition::new("messages");
// (sender, message id)
const MSG_SENDER_TABLE: TableDefinition<(u16, u16), ()> =
    TableDefinition::new("message_senders");
// (recipient, message id)
const MSG_RECIPIENT_TABLE: TableDefinition<(MessageRecipient, u16), ()> =
    TableDefinition::new("message_recipients");

#[derive(Debug)]
pub enum StoreError {
    RedbError(redb::Error),
    InvalidUserIds,
}

impl<T> From<T> for StoreError
where
    T: Into<redb::Error>,
{
    fn from(value: T) -> Self {
        Self::RedbError(value.into())
    }
}
impl Display for StoreError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            StoreError::RedbError(err) => write!(f, "Redb Error: {err}"),
            StoreError::InvalidUserIds => write!(f, "Invalid user IDs"),
        }
    }
}
impl std::error::Error for StoreError {}

type Result<T> = std::result::Result<T, StoreError>;

pub struct Store {
    db: Database,
}

impl Store {
    /// initialize the store on the given path, or in memory if `path` is None
    pub fn init<P: AsRef<Path>>(path: Option<P>) -> Result<Self> {
        let db = if let Some(path) = path {
            Database::create(path)?
        } else {
            Database::builder().create_with_backend(InMemoryBackend::new())?
        };
        Ok(Self { db })
    }

    pub fn get_username(&self, id: u16) -> Result<Option<String>> {
        let tx = self.db.begin_read()?;
        match tx.open_table(USERS_TABLE) {
            Ok(users) => Ok(users.get(id)?.map(|v| v.value())),
            // if the table doesn't exist just return None
            Err(redb::TableError::TableDoesNotExist(_)) => Ok(None),
            Err(e) => Err(e.into()),
        }
    }

    pub fn create_user(&self, username: String) -> Result<()> {
        let tx = self.db.begin_write()?;
        {
            let mut users = tx.open_table(USERS_TABLE)?;
            // add one to last key
            let user_id = users.last()?.map(|v| v.0.value() + 1).unwrap_or_default();
            users.insert(user_id, username)?;
        }
        tx.commit()?;
        Ok(())
    }

    pub fn list_users(&self) -> Result<HashMap<u16, String>> {
        let tx = self.db.begin_read()?;
        match tx.open_table(USERS_TABLE) {
            Ok(users) => Ok(users
                .iter()?
                .filter_map(|v| {
                    let v = v.ok()?;
                    Some((v.0.value(), v.1.value().into()))
                })
                .collect()),

            // if the table doesn't exist just return an empty vec
            Err(redb::TableError::TableDoesNotExist(_)) => Ok(HashMap::new()),
            Err(e) => Err(e.into()),
        }
    }

    pub fn create_update_group(
        &self,
        name: String,
        mut users: Vec<u16>,
        id: Option<u16>,
    ) -> Result<()> {
        let tx = self.db.begin_write()?;
        {
            let users_table = tx.open_table(USERS_TABLE)?;
            // make sure all of the users exist
            if !users
                .iter()
                .all(|id| users_table.get(id).is_ok_and(|v| v.is_some()))
            {
                return Err(StoreError::InvalidUserIds);
            }

            // sort the users so we can do binary search
            users.sort_unstable();

            let mut groups = tx.open_table(GROUPS_TABLE)?;
            let group_id = if let Some(id) = id {
                id
            } else {
                // add one to last key
                groups.last()?.map(|v| v.0.value() + 1).unwrap_or_default()
            };
            groups.insert(group_id, (name, users))?;
        }
        tx.commit()?;
        Ok(())
    }

    pub fn delete_group(&self, id: u16) -> Result<()> {
        let tx = self.db.begin_write()?;
        {
            let mut groups = tx.open_table(GROUPS_TABLE)?;
            groups.remove(id)?;

            let group = MessageRecipient::Group(id);

            // delete all messages ever received by this group
            let mut msg_recipients = tx.open_table(MSG_RECIPIENT_TABLE)?;
            let mut msg_senders = tx.open_table(MSG_SENDER_TABLE)?;
            let mut messages = tx.open_table(MESSAGES_TABLE)?;

            let start = (group, u16::MIN);
            let end = (group, u16::MAX);
            let messages_received = msg_recipients.extract_from_if(start..=end, |_, _| true)?;
            for message in messages_received {
                let (message, _) = message?;
                let (_, message_id) = message.value();
                // delete the message
                if let Some(message) = messages.remove(message_id)? {
                    let sender = message.value().sender;
                    // delete it from the senders table
                    msg_senders.remove((sender, message_id))?;
                }
            }
        }
        tx.commit()?;
        Ok(())
    }

    pub fn get_groups_for_user(&self, user_id: u16) -> Result<HashMap<u16, (String, Vec<u16>)>> {
        let tx = self.db.begin_read()?;

        // make sure the user exists
        let users = tx.open_table(USERS_TABLE)?;
        if users.get(user_id).is_err() {
            return Err(StoreError::InvalidUserIds);
        }

        let groups = tx.open_table(GROUPS_TABLE)?;

        Ok(groups
            .iter()?
            .filter_map(|v| {
                let v = v.ok()?;
                let group = v.1.value();
                // make sure they're a part of this group
                group.1.binary_search(&user_id).ok()?;
                Some((v.0.value(), (group.0.into(), group.1)))
            })
            .collect())
    }

    pub fn send_message(&self, message: String, sender: u16, recipient: MessageRecipient) -> Result<Message> {
        let tx = self.db.begin_write()?;

        let time = Utc::now().timestamp();
        let message = Message {
            message,
            sender,
            recipient,
            time,
            tags: vec![]
        };

        {                
            let mut messages = tx.open_table(MESSAGES_TABLE)?;
            // add one to last key
            let id = messages.last()?.map(|v| v.0.value() + 1).unwrap_or_default();
            messages.insert(id, message.clone())?;

            // add it to the recipients table
            let mut msg_recipients = tx.open_table(MSG_RECIPIENT_TABLE)?;
            msg_recipients.insert((recipient, id), ())?;

            // add it to the senders table
            let mut msg_senders = tx.open_table(MSG_SENDER_TABLE)?;
            msg_senders.insert((sender, id), ())?;
        }

        tx.commit()?;
        Ok(message)
    }

    pub fn delete_message(&self, id: u16) -> Result<()> {
        let tx = self.db.begin_write()?;

        {
            let mut messages = tx.open_table(MESSAGES_TABLE)?;
            // add one to last key
            if let Some(message) = messages.remove(id)? {
                let Message { sender, recipient, .. } = message.value();
                // remove from the recipients table
                let mut msg_recipients = tx.open_table(MSG_RECIPIENT_TABLE)?;
                msg_recipients.remove((recipient, id))?;
                // remove from the sendesr table
                let mut msg_senders = tx.open_table(MSG_SENDER_TABLE)?;
                msg_senders.remove((sender, id))?;
            };
        }

        tx.commit()?;
        Ok(())
    }

    /// get all messages received by these groups
    /// returns a map of group ID to messages
    pub fn get_group_message(&self, groups: &[u16]) -> Result<HashMap<u16, Vec<Message>>> {
        let tx = self.db.begin_read()?;
        let messages = tx.open_table(MESSAGES_TABLE)?;
        let msg_recipients = tx.open_table(MSG_RECIPIENT_TABLE)?;
        
        groups.into_iter()
            .map(|&group_id| {
                let recipient = MessageRecipient::Group(group_id);
                let messages: Result<Vec<Message>> = msg_recipients
                    .range((recipient, u16::MIN)..=(recipient, u16::MAX))?
                    .into_iter()
                    // get the message data
                    .map(|message| -> Result<Option<Message>> {
                        let message_id = message?.0.value().1;
                        let message = messages.get(message_id)?;
                        Ok(message.map(|a| a.value()))
                    })
                    // I want to keep errors (so I can surface them)
                    // but I don't care about non existent messages
                    .filter_map(|item| item.transpose())
                    .collect();

                Ok((group_id, messages?))
            })
            .collect()
    }

    /// get all user->user messages sent/received by this user
    /// does not return group messages
    pub fn get_messages_for_user(&self, user_id: u16) -> Result<Vec<Message>> {
        let tx = self.db.begin_read()?;
        
        let mut messages = vec![];


        Ok(messages)
    }
}

#[cfg(test)]
mod tests {
    use std::{collections::HashMap, path::PathBuf};

    use crate::store::StoreError;

    use super::Store;

    type Result = std::result::Result<(), Box<dyn std::error::Error>>;

    #[test]
    fn add_users() -> Result {
        let store = Store::init::<PathBuf>(None)?;

        assert!(store.get_username(0)?.is_none());

        // add a user
        store.create_user("foobar".into())?;

        // make sure they exist
        assert_eq!(
            store.get_username(0)?.as_ref().map(|a| a.as_str()),
            Some("foobar")
        );

        // add another user
        store.create_user("foo".into())?;

        // make sure they exist
        assert_eq!(
            store.get_username(1)?.as_ref().map(|a| a.as_str()),
            Some("foo")
        );

        assert_eq!(
            store.list_users()?,
            HashMap::from([(0, "foobar".into()), (1, "foo".into())])
        );

        Ok(())
    }

    #[test]
    fn add_groups() -> Result {
        let store = Store::init::<PathBuf>(None)?;

        store.create_user("foobar".into())?;

        // try creating the group with invalid users
        assert!(matches!(
            store.create_update_group("foo".into(), vec![0, 1], None),
            Err(StoreError::InvalidUserIds)
        ));

        store.create_user("foo".into())?;

        store.create_update_group("foo".into(), vec![0, 1], None)?;
        store.create_update_group("foobar".into(), vec![1], None)?;

        let group_0 = (0, ("foo".into(), vec![0, 1]));
        let group_1 = (1, ("foobar".into(), vec![1]));

        // make sure we can read the groups for each user
        assert_eq!(
            store.get_groups_for_user(0)?,
            HashMap::from([group_0.clone()])
        );
        assert_eq!(
            store.get_groups_for_user(1)?,
            HashMap::from([group_0, group_1])
        );

        // delete a group
        store.delete_group(0)?;

        assert_eq!(store.get_groups_for_user(0)?, HashMap::new());

        // edit group 1
        store.create_update_group("bar".into(), vec![0], Some(1))?;

        assert_eq!(
            store.get_groups_for_user(0)?,
            HashMap::from([(1, ("bar".into(), vec![0]))])
        );
        assert_eq!(store.get_groups_for_user(1)?, HashMap::new());

        Ok(())
    }
}
