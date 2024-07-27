use std::{env, fs::File, io::{BufRead, BufReader}, path::PathBuf, process::exit};

use serde::Deserialize;

#[derive(Deserialize, Debug, Clone)]
struct User<'a> {
    username: &'a str,
    _id: &'a str
}

#[derive(Deserialize, Debug, Clone)]
struct Group<'a> {
    name: &'a str,
    _id: &'a str,
    members: Vec<&'a str>
}


fn main() {
    let mut args = env::args().skip(1);
    if args.len() != 2 {
        eprintln!("Usage: convert_db <INPUT-DIR> <OUTPUT-FILE>");
        exit(1);
    }

    let input_dir = PathBuf::from(args.next().unwrap());
    let output_file = args.next().unwrap();

    let users_file = File::open(input_dir.join("users.db")).unwrap();
    let groups_file = File::open(input_dir.join("groups.db")).unwrap();

    for user_line in BufReader::new(users_file).lines().filter_map(|a| a.ok()) {
        let user: User = serde_json::from_str(&user_line).unwrap();
        println!("{:?}", user);
    }
}
