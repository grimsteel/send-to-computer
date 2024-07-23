import { encode, decode } from "@msgpack/msgpack";

type MessageRecipient = {
  User: number
} | {
  Group: number
};

// Message from client->server
type ClientMessage = {
  type: "RequestUsername",
  username: string
} | {
  type: "GetMessages",
  recipient: MessageRecipient
} | {
  type: "SendMessage",
  message: string,
  recipient: MessageRecipient
} | {
  type: "EditMessage",
  id: number,
  new_message: string
} | {
  type: "EditTags",
  id: number,
  new_tags: string[]
} | {
  type: "DeleteMessage",
  id: number
} | {
  type: "CreateGroup",
  name: string,
  members: number[]
} | {
  type: "EditGroup",
  id: number,
  new_name: string,
  new_members: number[]
} | {
  type: "DeleteGroup",
  id: number
};

interface ServerUser {
  id: number,
  name: string,
  online: boolean
}

interface ServerGroup {
  id: number,
  name: string,
  members: string[]
}

interface Message {
  sender: number,
  recipient: MessageRecipient,
  message: string,
  time: number,
  tags: string[]
}

// message from server->client
type ServerMessage = {
  type: "Error",
  err: string
} | {
  type: "Welcome",
  user_id: number,
  users: ServerUser[]
  groups: ServerGroup[]
} | {
  type: "UserAdded",
  user: ServerUser,
} | {
  type: "UserOnline",
  id: number
} | {
  type: "UserOffline",
  id: number
} | {
  type: "MessageForRecipient",
  recipient: MessageRecipient,
  messages: [number, Message][]
} | {
  type: "MessageSent",
  id: number,
  message: Message
} | {
  type: "MessageTagsEdited",
  id: number,
  tags: string[]
} | {
  type: "MessageDeleted",
  id: number
} | {
  type: "GroupAdded",
  group: ServerGroup
} | {
  type: "GroupEdited",
  group: ServerGroup
} | {
  type: "GroupDeleted",
  id: number
};

interface SocketEvents {
  close: [reason: string, code: number],
  message: [message: ServerMessage],
  error: [event: Event]
}

/** websocket wrapper */
export default class Socket {
  private socket: WebSocket;
  private listeners: {
    [Key in keyof SocketEvents]: ((...args: SocketEvents[Key]) => void)[];
  } = {
    close: [],
    message: [],
    error: []
  };

  constructor() {
    const protocol = location.protocol === "https" ? "wss" : "ws";
    this.socket = new WebSocket(`${protocol}://${location.hostname}/socket`);
    this.socket.binaryType = "arraybuffer";
    // add event listeners
    this.socket.addEventListener("message", e => {
      if (e.data instanceof ArrayBuffer) {
        const deserialized = decode(e.data) as ServerMessage;
        this.listeners.message.forEach(el => el(deserialized));
      }
    });
    this.socket.addEventListener("error", e => {
      this.listeners.error.forEach(el => el(e));
    });
    this.socket.addEventListener("close", e => {
      this.listeners.close.forEach(el => el(e.reason, e.code));
    });
  }

  send(message: ClientMessage) {
    const serialized = encode(message);
    this.socket.send(serialized);
  }

  on<T extends keyof SocketEvents>(event: T, cb: (...args: SocketEvents[T]) => void) {
    this.listeners[event].push(cb);
  }
}
