use std::{collections::HashMap, fmt::Display, path::Path};

use redb::{backends::InMemoryBackend, AccessGuard, Database, ReadableTable, TableDefinition};

type USERS<'a> = TableDefinition<'a, u16, &'a str>;
const USERS_TABLE: USERS = TableDefinition::new("users");

#[derive(Debug)]
pub enum StoreError {
    RedbError(redb::Error),
}

impl<T> From<T> for StoreError where T: Into<redb::Error> { fn from(value: T) -> Self { Self::RedbError(value.into()) } }
impl Display for StoreError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            StoreError::RedbError(err) => write!(f, "Redb Error: {err}")
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

    pub fn add_user(&self, username: &str) -> Result<()> {
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
}

#[cfg(test)]
mod tests {
    use std::{collections::HashMap, path::PathBuf};

    use super::Store;

    type Result = std::result::Result<(), Box<dyn std::error::Error>>;

    #[test]
    fn add_users() -> Result {
        let store = Store::init::<PathBuf>(None)?;

        assert!(store.get_username(0)?.is_none());

        // add a user
        store.add_user("foobar")?;

        // make sure they exist
        assert_eq!(store.get_username(0)?.as_ref().map(|v| v.value()), Some("foobar"));

        // add another user
        store.add_user("foo")?;

        // make sure they exist
        assert_eq!(store.get_username(1)?.as_ref().map(|v| v.value()), Some("foo"));

        assert_eq!(store.list_users()?, HashMap::from([(0, "foobar".into()), (1, "foo".into())]));

        Ok(())
    }
}
