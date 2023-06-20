import WebSocket, { WebSocketServer } from "ws";
import Datastore from "@seald-io/nedb";

const allowedOrigins = ["https://pumpkinmuffin.local", "http://localhost:8888", "https://192.168.59.251", "https://send.to.computer"];

const messagesWss = new WebSocketServer({
  noServer: true,
  path: "/socket/"
});

const invalidUsernameReg = /[^\w ]/;

function isUsernameUnique(name) {
  return !Array.from(messagesWss.clients).some(el => el.username === name);
}

function isValidUsername(username) {
  return !invalidUsernameReg.test(username);
}

function getLoggedInUsers() {
  return Array.from(messagesWss.clients).filter(el => el.username && el.readyState === WebSocket.OPEN);
}

function sendToCertainUsers(users, message) {
  getLoggedInUsers().filter(el => users.includes(el.username)).forEach(el => el.send(JSON.stringify(message)));
}

function findRemoved(oldArray, newArray) {
  return oldArray.filter(x => !newArray.includes(x));
}

async function getUserIdOrCreate(username) {
  const user = (await db.users.findOneAsync({ username })) || (await db.users.insertAsync({ username }));
  return user._id;
}

function resolveMessageUserIds(allUsers, message) {
  return {
    ...message,
    sender: allUsers.find(({ _id }) => _id === message.sender).username,
    receivingUser: message.receivingUser ? allUsers.find(({ _id }) => _id === message.receivingUser).username : undefined, // undefined fields disappear in JSON.parse
  };
}
async function getUsernameFromId(userId) {
  const user = await db.users.findOneAsync({ _id: userId });
  return user?.username;
}
function resolveGroupUserIds(allUsers, group) {
  return {
    ...group,
    members: group.members.map(id => allUsers.find(({ _id }) => _id === id)?.username)
  };
}

const db = {
  messages: new Datastore({ filename: "data/messages.db", autoload: true }),
  users: new Datastore({ filename: "data/users.db", autoload: true }),
  groups: new Datastore({ filename: "data/groups.db", autoload: true }),
}

messagesWss.on("connection", conn => {
  conn.on("message", async data => {
    let parsedMsg = JSON.parse(data);
    switch (parsedMsg.type) {
      case "username": {
        if (isUsernameUnique(parsedMsg.username) && isValidUsername(parsedMsg.username)) {
          let existingUsers = getLoggedInUsers();
          conn.username = parsedMsg.username;
          const users = await db.users.findAsync();
          const user = users.find(el => el.username === conn.username);
          let groups = [];
          let history = [];
          if (user) { // if this user has already been initialized
            groups = await db.groups.findAsync({ members: { $elemMatch: user._id } });
            history = await db.messages.findAsync({ $or: [
              { sender: user._id },
              { receivingUser: user._id },
              { receivingGroup: { $in: groups.map(el => el._id) } }
            ] }).sort({ createdAt: 1 });
          }
          const contacts = users.map(user => ({ online: false, ...user }));
          existingUsers.forEach(client => {
            const contact = contacts.find(({ username }) => client.username === username);
            if (contact) contact.online = true;
            else contacts.push({ online: true, username: client.username }); 
            client.send(JSON.stringify({
              type: "new-user",
              username: conn.username,
            }));
          });
          conn.send(JSON.stringify({
            type: "logged-in",
            history: history.map(resolveMessageUserIds.bind(null, users)),
            groups: groups.map(resolveGroupUserIds.bind(null, users)),
            username: conn.username,
            users: contacts.filter(el => el.username !== conn.username)
          }));
        } else conn.send(JSON.stringify({
          type: "invalid-username"
        }));
        break;
      } case "send-message": {
        const sender = await getUserIdOrCreate(conn.username)
        const receivingUser = await getUserIdOrCreate(parsedMsg.receipient);
        const message = await db.messages.insertAsync({ sender, receivingUser, message: parsedMsg.message, createdAt: Date.now() });
        sendToCertainUsers([parsedMsg.receipient, conn.username], {
          type: "receive-message",
          message: {
            ...message,
            sender: conn.username,
            receivingUser: parsedMsg.receipient
          }
        });
        break;
      } case "send-group-message": {
        const sender = await getUserIdOrCreate(conn.username)
        const message = await db.messages.insertAsync({ sender, receivingGroup: parsedMsg.id, message: parsedMsg.message, createdAt: Date.now() });
        const { members } = await db.groups.findOneAsync({ _id: parsedMsg.id });
        const usernames = await Promise.all(members.map(getUsernameFromId));
        sendToCertainUsers(usernames, {
          type: "receive-message",
          message: {
            ...message,
            sender: conn.username
          }
        });
        break;
      } case "delete-message": {
        const { receivingUser, receivingGroup, sender } = await db.messages.findOneAsync({ _id: parsedMsg.id });
        const affectedUsernames = [await getUsernameFromId(sender)];
        if (receivingUser) affectedUsernames.push(await getUsernameFromId(receivingUser));
        if (receivingGroup) {
          const { members } = await db.groups.findOneAsync({ _id: receivingGroup });
          const usernames = await Promise.all(members.map(getUsernameFromId));
          affectedUsernames.push(...usernames);
        }
        if (!affectedUsernames.includes(conn.username)) return;
        await db.messages.removeAsync({ _id: parsedMsg.id });
        sendToCertainUsers(affectedUsernames, {
          type: "remove-message",
          id: parsedMsg.id
        });
        break;
      } case "create-group": {
        const members = await Promise.all(parsedMsg.members.map(getUserIdOrCreate)); // converts usernames to user ids
        const newGroup = await db.groups.insertAsync({ name: parsedMsg.name, members });
        sendToCertainUsers(parsedMsg.members, {
          type: "update-group",
          group: {
            ...newGroup,
            members: parsedMsg.members
          }
        });
        break;
      } case "delete-group": {
        const { members } = await db.groups.findOneAsync({ _id: parsedMsg.id });
        const usernames = await Promise.all(members.map(getUsernameFromId));
        sendToCertainUsers(usernames, {type: "removed-from-group", id: parsedMsg.id});
        await db.groups.removeAsync({ _id: parsedMsg.id });
        await db.messages.removeAsync({ receivingGroup: parsedMsg.id }, { _multi: true });
        break;
      } case "edit-group": {
        const members = await Promise.all(parsedMsg.newMembers.map(getUserIdOrCreate));
        const { affectedDocuments: newGroup } = await db.groups.updateAsync({}, { $set: { members, name: parsedMsg.name } }, { returnUpdatedDocs: true });
        const removedUsers = findRemoved(parsedMsg.oldMembers, parsedMsg.newMembers);
        sendToCertainUsers(parsedMsg.newMembers, {
          type: "update-group",
          group: {
            ...newGroup,
            members: parsedMsg.newMembers
          }
        });
        sendToCertainUsers(removedUsers, {
          type: "removed-from-group",
          id: parsedMsg.id
        });
        break;
      }
    }
  });
  conn.on("close", (_code, _reason) => {
    getLoggedInUsers().forEach(client => client.send(JSON.stringify({
      type: "user-disconnect",
      username: conn.username
    })));
  });
});

export default function (server) {
  server.on("upgrade", (req, socket, head) => {
    if (allowedOrigins.includes(req.headers.origin) && req.url === "/socket/")
      messagesWss.handleUpgrade(req, socket, head, websocket => messagesWss.emit("connection", websocket, req));
  });
}
