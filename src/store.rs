use std::{any::type_name, collections::{HashMap, HashSet}, fmt::Display, path::Path};

use chrono::Utc;
use redb::{
    backends::InMemoryBackend,  Database, Key, ReadableTable, TableDefinition,
    TypeName, Value,
};
use serde::{Deserialize, Serialize};

/// adapted from https://github.com/cberner/redb/blob/master/examples/bincode_keys.rs
#[derive(Debug)]
struct MsgPackRedb<T>(T);

impl<T> Value for MsgPackRedb<T>
where
    T: Serialize + for<'a> Deserialize<'a> + std::fmt::Debug {
    type SelfType<'a> = T where Self: 'a;
    type AsBytes<'a> = Vec<u8> where Self: 'a;
    fn fixed_width() -> Option<usize> { None }
    fn from_bytes<'a>(data: &'a [u8]) -> T where Self: 'a {
        rmp_serde::from_slice(data).unwrap()
    }
    fn as_bytes<'a, 'b: 'a>(value: &'a T) -> Vec<u8> { rmp_serde::to_vec(value).unwrap() }
    fn type_name() -> TypeName { TypeName::new(&format!("MsgPackRedb<{}>", type_name::<T>())) }
}

impl<T> Key for MsgPackRedb<T>
where
    T: Ord + std::fmt::Debug + Serialize + for<'a> Deserialize<'a> {
    fn compare(data1: &[u8], data2: &[u8]) -> std::cmp::Ordering {
        Self::from_bytes(data1).cmp(&Self::from_bytes(data2))
    }
}

/// either a group or a user
#[derive(Debug, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord, Copy, Clone)]
pub enum MessageRecipient {
    User(u16),
    Group(u16),
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Eq, Clone)]
pub struct Message {
    pub sender: u16,
    pub recipient: MessageRecipient,
    pub message: String,
    pub time: i64,
    pub tags: Vec<String>
}

const USERS_TABLE: TableDefinition<u16, String> = TableDefinition::new("users");
const USERS_TABLE_REVERSE: TableDefinition<&str, u16> = TableDefinition::new("users_reverse");
const GROUPS_TABLE: TableDefinition<u16, (String, MsgPackRedb<HashSet<u16>>)> = TableDefinition::new("groups");
const MESSAGES_TABLE: TableDefinition<
    u16,
    MsgPackRedb<Message>,
> = TableDefinition::new("messages");
// (recipient, sender, message id)
const MSG_ENDPOINT_TABLE: TableDefinition<(MsgPackRedb<MessageRecipient>, u16, u16), ()> =
    TableDefinition::new("message_senders");

#[derive(Debug)]
pub enum StoreError {
    RedbError(redb::Error),
    InvalidUserIds,
    InvalidGroupId,
    InvalidMessageId,
    UsernameInUse,
    PermissionDenied
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
            StoreError::InvalidUserIds => write!(f, "Invalid user ID(s)"),
            StoreError::InvalidGroupId => write!(f, "Invalid group ID"),
            StoreError::InvalidMessageId => write!(f, "Invalid message ID"),
            StoreError::PermissionDenied => write!(f, "Permission denied"),
            StoreError::UsernameInUse => write!(f, "Username is already in use")
        }
    }
}
impl std::error::Error for StoreError {}

pub type Result<T> = std::result::Result<T, StoreError>;

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

    pub fn get_username_for_id(&self, id: u16) -> Result<Option<String>> {
        let tx = self.db.begin_read()?;
        match tx.open_table(USERS_TABLE) {
            Ok(users) => Ok(users.get(id)?.map(|v| v.value())),
            // if the table doesn't exist just return None
            Err(redb::TableError::TableDoesNotExist(_)) => Ok(None),
            Err(e) => Err(e.into()),
        }
    }

    pub fn get_id_for_username(&self, username: &str) -> Result<Option<u16>> {
        let tx = self.db.begin_read()?;
        match tx.open_table(USERS_TABLE_REVERSE) {
            Ok(users) => Ok(users.get(username)?.map(|v| v.value())),
            // if the table doesn't exist just return None
            Err(redb::TableError::TableDoesNotExist(_)) => Ok(None),
            Err(e) => Err(e.into()),
        }
    }

    pub fn create_user(&self, username: String) -> Result<u16> {
        let tx = self.db.begin_write()?;
        let user_id;
        {
            let mut users = tx.open_table(USERS_TABLE)?;
            let mut users_reverse = tx.open_table(USERS_TABLE_REVERSE)?;

            // make sure this username isn't already used
            if users_reverse.get(&*username)?.is_some() {
                return Err(StoreError::UsernameInUse);
            }
            
            // add one to last key
            user_id = users.last()?.map(|v| v.0.value() + 1).unwrap_or_default();
            users_reverse.insert(&*username, user_id)?;
            users.insert(user_id, username)?;
        }
        tx.commit()?;
        Ok(user_id)
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
        users: HashSet<u16>,
        group_id: Option<u16>,
        user_id: u16
    ) -> Result<()> {
        let tx = self.db.begin_write()?;
        {
            let mut groups = tx.open_table(GROUPS_TABLE)?;
            let group_id = if let Some(id) = group_id {
                // make sure this group exists and has the user in it
                if let Some(group) = groups.get(id)? {
                    if !group.value().1.contains(&user_id) {
                        return Err(StoreError::PermissionDenied);
                    }
                } else {
                    return Err(StoreError::InvalidGroupId);
                }
                id
            } else {
                // add one to last key
                groups.last()?.map(|v| v.0.value() + 1).unwrap_or_default()
            };
            
            let users_table = tx.open_table(USERS_TABLE)?;
            // make sure all of the users exist
            if !users
                .iter()
                .all(|user_id| users_table.get(user_id).is_ok_and(|v| v.is_some()))
            {
                return Err(StoreError::InvalidUserIds);
            }

            groups.insert(group_id, (name, users))?;
        }
        tx.commit()?;
        Ok(())
    }

    pub fn delete_group(&self, group_id: u16, user_id: u16) -> Result<()> {
        let tx = self.db.begin_write()?;
        {
            let mut groups = tx.open_table(GROUPS_TABLE)?;
            if let Some(group) = groups.remove(group_id)? {
                // make sure they are a member of this group
                if !group.value().1.contains(&user_id) {
                    return Err(StoreError::PermissionDenied);
                }
            } else {
                return Err(StoreError::InvalidGroupId);
            }

            let group = MessageRecipient::Group(group_id);

            // delete all messages ever received by this group
            let mut msg_endpoints = tx.open_table(MSG_ENDPOINT_TABLE)?;
            let mut messages = tx.open_table(MESSAGES_TABLE)?;

            // iterate through all messages received by this group
            let messages_sent_to_group = msg_endpoints.extract_from_if((group, u16::MIN, u16::MIN)..=(group, u16::MAX, u16::MAX), |_, _| true)?;
            for message in messages_sent_to_group {
                let (message, _) = message?;
                let (_, _, message_id) = message.value();
                // delete the message
                messages.remove(message_id)?;
            }
        }
        tx.commit()?;
        Ok(())
    }

    pub fn get_groups_for_user(&self, user_id: u16) -> Result<HashMap<u16, (String, HashSet<u16>)>> {
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
                if !group.1.contains(&user_id) { return None };
                Some((v.0.value(), (group.0.into(), group.1)))
            })
            .collect())
    }

    pub fn send_message(&self, message: String, sender: u16, recipient: MessageRecipient) -> Result<Message> {
        let tx = self.db.begin_write()?;

        let users = tx.open_table(USERS_TABLE)?;

        // make sure the sender exists
        if users.get(sender)?.is_none() {
            return Err(StoreError::InvalidUserIds);
        }

        // make sure the recepient exists
        match recipient {
            MessageRecipient::Group(group_id) => {                
                let groups = tx.open_table(GROUPS_TABLE)?;
                if let Some(group) = groups.get(group_id)? {
                    // make sure they're a member of this group
                    let users = group.value().1;
                    if !users.contains(&sender) {
                        return Err(StoreError::PermissionDenied);
                    }
                } else {
                    return Err(StoreError::InvalidGroupId);
                };
            },
            MessageRecipient::User(user_id) => {
                if users.get(user_id)?.is_none() {
                    return Err(StoreError::InvalidUserIds);
                };
            }
        }

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

            // add it to the endpoints table
            let mut msg_endpoints = tx.open_table(MSG_ENDPOINT_TABLE)?;
            msg_endpoints.insert((recipient, sender, id), ())?;
        }

        drop(users);

        tx.commit()?;
        Ok(message)
    }

    pub fn delete_message(&self, message_id: u16, user_id: u16) -> Result<()> {
        let tx = self.db.begin_write()?;

        {
            let mut messages = tx.open_table(MESSAGES_TABLE)?;
            let mut msg_endpoints = tx.open_table(MSG_ENDPOINT_TABLE)?;
            
            // make sure they're allowed to delete this message
            let message = messages.get(message_id)?.map(|a| a.value());
            if let Some(Message { sender, recipient, .. }) = message {
                if sender != user_id {
                    // check if they're the recipient
                    if !match recipient {
                        MessageRecipient::User(recipient_user_id) => recipient_user_id == user_id,
                        MessageRecipient::Group(group_id) => {
                            let groups = tx.open_table(GROUPS_TABLE)?;
                            let group = groups.get(group_id)?;
                            if let Some(group) = group {
                                // make sure they're a member of this group
                                let users = group.value().1;
                                users.contains(&user_id)
                            } else {
                                // group doesn't exist
                                false
                            }
                        }
                    } {
                        // they're not the recipient
                        return Err(StoreError::PermissionDenied);
                    }
                }
                // actually delete the message
                messages.remove(message_id)?;
                msg_endpoints.remove((recipient, sender, message_id))?;
            } else {
                return Err(StoreError::InvalidMessageId);
            }
        }

        tx.commit()?;
        Ok(())
    }

    /// get all messages received by this group
    fn get_group_messages(&self, user_id: u16, group_id: u16) -> Result<Vec<(u16, Message)>> {
        let tx = self.db.begin_read()?;
        let messages = tx.open_table(MESSAGES_TABLE)?;
        let msg_endpoints = tx.open_table(MSG_ENDPOINT_TABLE)?;
        let groups = tx.open_table(GROUPS_TABLE)?;

        if let Some(group) = groups.get(group_id)? {
            // make sure they're a member
            if !group.value().1.contains(&user_id) {
                return Err(StoreError::PermissionDenied);
            }
        } else {
            return Err(StoreError::InvalidGroupId);
        }     
        
        let recipient = MessageRecipient::Group(group_id);
        let mut messages = msg_endpoints
            .range((recipient, u16::MIN, u16::MIN)..=(recipient, u16::MAX, u16::MAX))?
            .into_iter()
            // get the message data
            .map(|message| -> Result<Option<(u16, Message)>> {
                let message_id = message?.0.value().2;
                let message = messages.get(message_id)?;
                Ok(message.map(|a| (message_id, a.value())))
            })
            // I want to keep errors (so I can surface them)
            // but I don't care about non existent messages
            .filter_map(|item| item.transpose())
            .collect::<Result<Vec<_>>>()?;

        messages.sort_unstable_by_key(|a| a.0);

        Ok(messages)
    }

    /// get all messages sent from user a to user b and vice versa
    fn get_user_messages(&self, user_a: u16, user_b: u16) -> Result<Vec<(u16, Message)>> {
        let tx = self.db.begin_read()?;
        let messages = tx.open_table(MESSAGES_TABLE)?;
        let msg_endpoints = tx.open_table(MSG_ENDPOINT_TABLE)?;

        let user_a_recipient = MessageRecipient::User(user_a);
        let user_b_recipient = MessageRecipient::User(user_b);
        
        let mut messages = msg_endpoints
            // messages from b -> a
            .range((user_a_recipient, user_b, u16::MIN)..=(user_a_recipient, user_b, u16::MAX))?
            .into_iter()
            .chain(
                // messages from a -> b
                msg_endpoints
                    .range((user_b_recipient, user_a, u16::MIN)..=(user_b_recipient, user_a, u16::MAX))?
                    .into_iter()
            )
            .map(|message| {
                let message_id = message?.0.value().2;
                Ok(messages.get(message_id)?.map(|m| (message_id, m.value())))
            })
            .filter_map(|message| message.transpose())
            .collect::<Result<Vec<_>>>()?;

        messages.sort_unstable_by_key(|a| a.0);

        Ok(messages)
    }

    /// get all messages between the given user and recipient
    pub fn get_messages(&self, user_id: u16, recipient: MessageRecipient) -> Result<Vec<(u16, Message)>> {
        match recipient {
            MessageRecipient::User(recipient_id) => self.get_user_messages(user_id, recipient_id),
            MessageRecipient::Group(group_id) => self.get_group_messages(user_id, group_id)
        }
    }
}

#[cfg(test)]
mod tests {
    use std::{collections::{HashMap, HashSet}, path::PathBuf};

    use redb::ReadableTableMetadata;

    use crate::store::{Message, MessageRecipient, StoreError};

    use super::{Store, MESSAGES_TABLE, MSG_ENDPOINT_TABLE};

    type Result<T=()> = std::result::Result<T, Box<dyn std::error::Error>>;

    #[test]
    fn add_users() -> Result {
        let store = Store::init::<PathBuf>(None)?;

        assert!(store.get_username_for_id(0)?.is_none());

        // add a user
        store.create_user("foobar".into())?;

        // make sure they exist
        assert_eq!(
            store.get_username_for_id(0)?.as_ref().map(|a| a.as_str()),
            Some("foobar")
        );
        assert_eq!(
            store.get_id_for_username("foobar")?,
            Some(0)
        );

        // add another user
        store.create_user("foo".into())?;

        // make sure they exist
        assert_eq!(
            store.get_username_for_id(1)?.as_ref().map(|a| a.as_str()),
            Some("foo")
        );
        assert_eq!(
            store.get_id_for_username("foo")?,
            Some(1)
        );

        // make sure you can't create a user with an existing username
        assert!(matches!(
            store.create_user("foo".into()),
            Err(StoreError::UsernameInUse)
        ));

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
            store.create_update_group("foo".into(), HashSet::from([0, 1]), None, 0),
            Err(StoreError::InvalidUserIds)
        ));

        store.create_user("foo".into())?;

        store.create_update_group("foo".into(), HashSet::from([1, 0]), None, 0)?;
        store.create_update_group("foobar".into(), HashSet::from([1]), None, 1)?;

        let group_0 = (0, ("foo".into(), HashSet::from([0, 1])));
        let group_1 = (1, ("foobar".into(), HashSet::from([1])));

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
        assert!(matches!(
            // user 0 cannot delete group 1
            store.delete_group(1, 0),
            Err(StoreError::PermissionDenied)
        ));
        store.delete_group(0, 1)?;

        assert_eq!(store.get_groups_for_user(0)?, HashMap::new());

        // edit group 1
        assert!(matches!(
            // user 0 cannot delete edit 1
            store.create_update_group("bar".into(), HashSet::from([0]), Some(1), 0),
            Err(StoreError::PermissionDenied)
        ));
        store.create_update_group("bar".into(), HashSet::from([0]), Some(1), 1)?;

        assert_eq!(
            store.get_groups_for_user(0)?,
            HashMap::from([(1, ("bar".into(), HashSet::from([0])))])
        );
        assert_eq!(store.get_groups_for_user(1)?, HashMap::new());

        Ok(())
    }

    fn setup_messages_groups() -> Result<Store> {
        let store = Store::init::<PathBuf>(None)?;

        store.create_user("a".into())?;
        store.create_user("b".into())?;
        store.create_user("c".into())?;
        store.create_user("d".into())?;

        store.create_update_group("1".into(), HashSet::from([1, 3]), None, 1)?;
        store.create_update_group("1".into(), HashSet::from([3, 2]), None, 3)?;

        // make sure the sender/recipients are validated
        assert!(matches!(
            store.send_message("foo".into(), 4, MessageRecipient::User(1)),
            Err(StoreError::InvalidUserIds)
        ));
        assert!(matches!(
            store.send_message("foo".into(), 3, MessageRecipient::Group(2)),
            Err(StoreError::InvalidGroupId)
        ));
        assert!(matches!(
            store.send_message("foo".into(), 3, MessageRecipient::User(4)),
            Err(StoreError::InvalidUserIds)
        ));
        assert!(matches!(
            store.send_message("foo".into(), 0, MessageRecipient::Group(1)),
            Err(StoreError::PermissionDenied)
        ));

        assert!(matches!(
            store.send_message("hello".into(), 0, MessageRecipient::User(1))?,
            Message { sender: 0, recipient: MessageRecipient::User(1), message, .. } if &*message == "hello"
        ));

        store.send_message("hi".into(), 1, MessageRecipient::User(0))?;
        store.send_message("aaa".into(), 1, MessageRecipient::User(3))?;
        store.send_message("bbb".into(), 2, MessageRecipient::Group(1))?;
        store.send_message("ccc".into(), 3, MessageRecipient::Group(1))?;

        Ok(store)
    }

    #[test]
    fn read_messages() -> Result {
        let store = setup_messages_groups()?;

        // messages sent from a to b should be equal to messages sent from b to a
        let messages_a_b = store.get_user_messages(0, 1)?;
        let messages_b_a = store.get_user_messages(1, 0)?;
        assert_eq!(messages_a_b, messages_b_a);

        // these messages should be different
        let messages_d_b = store.get_user_messages(3, 1)?;
        assert_ne!(messages_a_b, messages_d_b);

        assert!(matches!(
            &messages_d_b[..],
            [(2, Message { sender: 1, recipient: MessageRecipient::User(3), message, .. })] if &*message == "aaa"
        ));

        // users not in a group can't read the group messages
        assert!(matches!(
            store.get_group_messages(1, 1),
            Err(StoreError::PermissionDenied)
        ));
        // group does not exist
        assert!(matches!(
            store.get_group_messages(1, 2),
            Err(StoreError::InvalidGroupId)
        ));

        assert_eq!(
            store.get_group_messages(1, 0)?,
            vec![]
        );
        
        let group_messages_c = store.get_group_messages(2, 1)?;
        let group_messages_d = store.get_group_messages(3, 1)?;
        assert_eq!(group_messages_c, group_messages_d);
        
        Ok(())
    }

    fn assert_message_count(store: &Store, count: u16) -> Result {
        let tx = store.db.begin_read()?;
        let messages = tx.open_table(MESSAGES_TABLE)?;
        let message_endpoints = tx.open_table(MSG_ENDPOINT_TABLE)?;

        let message_count = messages.len()?;
        let message_endpoint_count = message_endpoints.len()?;
        // make sure they're in sync
        assert_eq!(message_count, message_endpoint_count);
        assert_eq!(message_count as u16, count);

        Ok(())
    }

    #[test]
    fn delete_group_messages() -> Result {
        let store = setup_messages_groups()?;

        assert_message_count(&store, 5)?;

        // users that aren't in a group can't delete it
        assert!(matches!(
            store.delete_group(0, 2),
            Err(StoreError::PermissionDenied)
        ));
        store.delete_group(0, 1)?;

        assert_message_count(&store, 5)?;

        // delete the group with two messages
        store.delete_group(1, 2)?;
        assert_message_count(&store, 3)?;

        Ok(())
    }

    #[test]
    fn delete_messages() -> Result {
        let store = setup_messages_groups()?;

        assert_message_count(&store, 5)?;
        assert!(matches!(
            store.delete_message(5, 0),
            Err(StoreError::InvalidMessageId)
        ));
        assert!(matches!(
            store.delete_message(4, 0),
            Err(StoreError::PermissionDenied)
        ));

        store.delete_message(4, 2)?;
        store.delete_message(1, 0)?;
        store.delete_message(2, 1)?;

        assert_message_count(&store, 2)?;

        Ok(())
    }
}
