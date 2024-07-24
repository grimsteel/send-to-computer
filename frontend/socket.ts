import { encode, decode } from "@msgpack/msgpack";

type MessageRecipient = {
  User: number
} | {
  Group: number
};

// Message from client->server
export type ClientMessage = {
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
export type ServerMessage = {
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
  error: [event: Event],
  open: []
}

const protocol = location.protocol === "https" ? "wss" : "ws";

/** websocket wrapper */
export default class Socket {
  private socket: WebSocket | null = null;
  // seconds to retry connecting in
  private connectionRetry: number = 2;
  private retryPromise: Promise<void> | null = null;
  private retryResolve: () => void | null = null;
  
  private listeners: {
    [Key in keyof SocketEvents]: ((...args: SocketEvents[Key]) => void)[];
  } = {
    close: [],
    message: [],
    error: [],
    open: []
  };

  private initSocket() {    
    this.socket = new WebSocket(`${protocol}://${location.host}/socket`);
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

      // try to reconnect
      setTimeout(() => {
        if (this.socket?.readyState === WebSocket.OPEN) return;
        
        this.connectionRetry *= 2;
        this.initSocket();
      }, this.connectionRetry * 1000);
    });
    this.socket.addEventListener("open", () => {
      // immediately resolve the retry-promise
      this.retryResolve?.();
      this.retryPromise = null;
      
      this.connectionRetry = 2;
      this.listeners.open.forEach(el => el());
    });
  }

  private reconnect() {
    // if it's already connected, no need to do anything
    if (this.socket?.readyState === WebSocket.OPEN) return Promise.resolve();
    // we're already attempting to connect
    if (this.retryPromise) return this.retryPromise;
    
    // force close existing socket
    try { this.socket?.close() } catch {}

    const { resolve, promise } = Promise.withResolvers<void>();
    this.retryPromise = promise;
    this.retryResolve = resolve;

    this.initSocket();
    return this.retryPromise;
  }
  
  async send(message: ClientMessage) {
    await this.reconnect();
    
    const serialized = encode(message);    
    this.socket.send(serialized);
  }
  
  on<T extends keyof SocketEvents>(event: T, cb: (...args: SocketEvents[T]) => void) {
    this.listeners[event].push(cb);
  }
}
