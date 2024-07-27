#![allow(dead_code)]

use std::{collections::{HashMap, HashSet}, env, fs::{remove_file, File}, io::{BufRead, BufReader}, path::PathBuf, process::exit};

use serde::Deserialize;
use store::{MessageRecipient, Store};

#[path = "../store.rs"]
mod store;

#[derive(Deserialize, Debug, Clone)]
struct User {
    username: String,
    _id: String
}

#[derive(Deserialize, Debug, Clone)]
struct Group {
    name: String,
    _id: String,
    members: Vec<String>
}

#[derive(Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
enum Recipient {
    ReceivingUser(String),
    ReceivingGroup(String)
}

#[derive(Deserialize, Debug, Clone)]
#[serde(deny_unknown_fields)]
struct Message {
    sender: String,
    #[serde(flatten)]
    recipient: Recipient,
    message: String,
    #[serde(default, rename = "createdAt")]
    created_at: u64,
    _id: String,
    tags: Option<String>
}


fn main() {
    let mut args = env::args().skip(1);
    if args.len() != 2 {
        eprintln!("Usage: convert_db <INPUT-DIR> <OUTPUT-FILE>");
        exit(1);
    }

    let input_dir = PathBuf::from(args.next().unwrap());
    let output_file = args.next().unwrap();

    remove_file(&output_file).unwrap();
    let store = Store::init(Some(output_file)).unwrap();

    let users_file = File::open(input_dir.join("users.db")).unwrap();
    let groups_file = File::open(input_dir.join("groups.db")).unwrap();
    let message_file = File::open(input_dir.join("messages.db")).unwrap();

    let mut user_id_mappings = HashMap::new();
    let mut group_id_mappings = HashMap::new();

    for user_line in BufReader::new(users_file).lines().filter_map(|a| a.ok()) {
        let user: User = serde_json::from_str(&user_line).unwrap();
        user_id_mappings.insert(user._id, store.create_user(user.username).unwrap());
    }

    println!("Successfully imported {} users", user_id_mappings.len());

    for group_line in BufReader::new(groups_file).lines().filter_map(|a| a.ok()) {
        let group: Group = serde_json::from_str(&group_line).unwrap();

        // resolve the user IDs
        let user_ids: HashSet<_> = group.members.into_iter()
            .filter_map(|m| user_id_mappings.get(&m).copied())
            .collect();

        // the user id of one user in the group 
        let user_id = *user_ids.iter().next().unwrap();
        
        group_id_mappings.insert(
            group._id,
            store.create_update_group(group.name, user_ids, None, user_id).unwrap()
        );
    }

    println!("Successfully imported {} groups", group_id_mappings.len());

    let mut message_count = 0;

    let mut messages = BufReader::new(message_file).lines().filter_map(|a| a.ok())
        .map(|s| serde_json::from_str(&s).unwrap())
        .collect::<Vec<Message>>();

    messages.sort_unstable_by_key(|m| m.created_at);

    for message in messages {
        let tags: Vec<_> = message.tags
            .map(|t| t.split([' ', ',']).map(|t| t.trim().to_lowercase()).filter(|t| !t.is_empty()).collect())
            .unwrap_or_default();

        let time = message.created_at / 1000;

        let sender = if let Some(&id) = user_id_mappings.get(&message.sender) { id } else { continue; };
        let recipient = match message.recipient {
            Recipient::ReceivingUser(user_id) => MessageRecipient::User(*user_id_mappings.get(&user_id).unwrap()),
            Recipient::ReceivingGroup(group_id) => MessageRecipient::Group(if let Some(&id) = group_id_mappings.get(&group_id) { id } else { continue; })
        };

        let msg = store::Message {
            sender,
            recipient,
            message: message.message,
            time: time as i64,
            tags
        };

        store.create_message(msg).unwrap();
        
        message_count += 1;
    }

    println!("Successfully imported {message_count} messages");
}
