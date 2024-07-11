use std::{collections::HashMap, fmt::Display, path::Path};

use redb::{backends::InMemoryBackend, AccessGuard, Database, ReadableTable, TableDefinition};

const USERS_TABLE: TableDefinition<u16, &str> = TableDefinition::new("users");
const GROUPS_TABLE: TableDefinition<u16, (&str, Vec<u16>)> = TableDefinition::new("groups");

#[derive(Debug)]
pub enum StoreError {
    RedbError(redb::Error),
    InvalidUserIds
}

impl<T> From<T> for StoreError where T: Into<redb::Error> { fn from(value: T) -> Self { Self::RedbError(value.into()) } }
impl Display for StoreError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            StoreError::RedbError(err) => write!(f, "Redb Error: {err}"),
            StoreError::InvalidUserIds => write!(f, "Invalid user IDs")
        }
    }
}
impl std::error::Error for StoreError {}

type Result<T> = std::result::Result<T, StoreError>;

pub struct Store {
    db: Database
}

impl Store {
    /// initialize the store on the given path, or in memory if `path` is None
    pub fn init<P: AsRef<Path>>(path: Option<P>) -> Result<Self> {
        let db = if let Some(path) = path { Database::create(path)? } else { Database::builder().create_with_backend(InMemoryBackend::new())? };
        Ok(Self {
            db
        })
    }

    pub fn get_username(&self, id: u16) -> Result<Option<AccessGuard<&'static str>>> {
        let tx = self.db.begin_read()?;
        match tx.open_table(USERS_TABLE) {
            Ok(users) => Ok(users.get(id)?),
            // if the table doesn't exist just return None
            Err(redb::TableError::TableDoesNotExist(_)) => Ok(None),
            Err(e) => Err(e.into())
        }
    }

    pub fn create_user(&self, username: &str) -> Result<()> {
        let tx = self.db.begin_write()?;
        {
            let mut users = tx.open_table(USERS_TABLE)?;
            // add one to last key
            let user_id = users
                .last()?.map(|v| v.0.value() + 1)
                .unwrap_or_default();
            users.insert(user_id, username)?;
        }
        tx.commit()?;
        Ok(())
    }

    pub fn list_users(&self) -> Result<HashMap<u16, String>> {
        let tx = self.db.begin_read()?;
        match tx.open_table(USERS_TABLE) {
            Ok(users) => {
                Ok(users.iter()?.filter_map(|v| {
                    let v = v.ok()?;
                    Some((v.0.value(), v.1.value().into()))
                }).collect())
            },

            // if the table doesn't exist just return an empty vec
            Err(redb::TableError::TableDoesNotExist(_)) => Ok(HashMap::new()),
            Err(e) => Err(e.into())
        }
    }

    pub fn create_update_group(&self, name: &str, mut users: Vec<u16>, id: Option<u16>) -> Result<()> {
        let tx = self.db.begin_write()?;
        {
            let users_table = tx.open_table(USERS_TABLE)?;
            // make sure all of the users exist
            if !users.iter().all(|id| users_table.get(id).is_ok_and(|v| v.is_some())) {
                return Err(StoreError::InvalidUserIds);
            }

            // sort the users so we can do binary search
            users.sort_unstable();
            
            let mut groups = tx.open_table(GROUPS_TABLE)?;
            let group_id = if let Some(id) = id { id } else {
                // add one to last key
                groups.last()?
                    .map(|v| v.0.value() + 1)
                    .unwrap_or_default()
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
            // TODO: delete messages for group
        }
        tx.commit()?;
        Ok(())
    }

    pub fn get_groups_for_user(&self, user_id: u16) -> Result<HashMap<u16, (String, Vec<u16>)>> {
        let tx = self.db.begin_read()?;

        // make sure the user exists
        let users = tx.open_table(USERS_TABLE)?;
        if !users.get(user_id).is_ok() {
            return Err(StoreError::InvalidUserIds);
        }

        let groups = tx.open_table(GROUPS_TABLE)?;

        Ok(groups.iter()?.filter_map(|v| {
            let v = v.ok()?;
            let group = v.1.value();
            // make sure they're a part of this group
            group.1.binary_search(&user_id).ok()?;
            Some((v.0.value(), (group.0.into(), group.1)))
        }).collect())
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
        store.create_user("foobar")?;

        // make sure they exist
        assert_eq!(store.get_username(0)?.as_ref().map(|v| v.value()), Some("foobar"));

        // add another user
        store.create_user("foo")?;

        // make sure they exist
        assert_eq!(store.get_username(1)?.as_ref().map(|v| v.value()), Some("foo"));

        assert_eq!(store.list_users()?, HashMap::from([(0, "foobar".into()), (1, "foo".into())]));

        Ok(())
    }

    #[test]
    fn add_groups() -> Result {
        let store = Store::init::<PathBuf>(None)?;

        store.create_user("foobar")?;

        // try creating the group with invalid users
        assert!(matches!(store.create_update_group("foo", vec![0, 1], None), Err(StoreError::InvalidUserIds)));

        store.create_user("foo")?;

        store.create_update_group("foo", vec![0, 1], None)?;
        store.create_update_group("foobar", vec![1], None)?;

        let group_0 = (0, ("foo".into(), vec![0, 1]));
        let group_1 = (1, ("foobar".into(), vec![1]));

        // make sure we can read the groups for each user
        assert_eq!(store.get_groups_for_user(0)?, HashMap::from([group_0.clone()]));
        assert_eq!(store.get_groups_for_user(1)?, HashMap::from([group_0, group_1]));

        // delete a group
        store.delete_group(0)?;

        assert_eq!(store.get_groups_for_user(0)?, HashMap::new());
        
        Ok(())
    }
}
