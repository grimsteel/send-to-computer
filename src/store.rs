use std::path::Path;

use redb::{AccessGuard, Database, ReadableTable, StorageError, TableDefinition};

type USERS<'a> = TableDefinition<'a, u16, &'a str>;
const USERS_TABLE: USERS = TableDefinition::new("users");

pub enum StoreError {
    RedbError(redb::Error),
    NotFound
}

impl<T> From<T> for StoreError where T: Into<redb::Error> { fn from(value: T) -> Self { Self::RedbError(value.into()) } }

type Result<T> = std::result::Result<T, StoreError>;

pub struct Store {
    db: Database
}

impl Store {
    fn init<P: AsRef<Path>>(path: P) -> Result<Self> {
        let db = Database::create(path)?;
        Ok(Self {
            db
        })
    }

    pub fn get_username(&self, id: u16) -> Result<AccessGuard<&str>> {
        let tx = self.db.begin_read()?;
        let users = tx.open_table(USERS_TABLE)?;
        users.get(id)?.ok_or(StoreError::NotFound)
    }

    pub fn add_user(&self, username: &str) -> Result<()> {
        let tx = self.db.begin_write()?;
        let mut users = tx.open_table(USERS_TABLE)?;
        // add one to last key
        let user_id = users
            .last()?.map(|v| v.0.value() + 1)
            .unwrap_or_default();
        users.insert(user_id, username)?;
        Ok(())
    }
}
