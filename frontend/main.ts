import { html } from "lit";
import { customElement, state } from "lit/decorators.js";
import { classMap } from "lit/directives/class-map.js";
import "./components/input";
import "./components/sidebar";
import "./components/header";
import "./components/message-list";
import "./components/welcome";
import { showToast } from "./components/toast";

import { stylesheet, StyledElement } from "./css";
import Socket, { type Message, type MessageRecipient, type ServerGroup, type ServerMessage, type ServerUser } from "./socket";

document.adoptedStyleSheets.push(stylesheet.styleSheet);

@customElement("stc-app")
export class StcApp extends StyledElement {
  @state()
  private loggedIn = false;
  @state()
  private connected = false;
  @state()
  private username: string | null = null;

  @state()
  private users: ServerUser[] = [];
  @state()
  private groups: ServerGroup[] = [];
  @state()
  private currentRecipient: MessageRecipient | null = null;
  @state()
  private messages: Message[] = [];

  private socket: Socket;
  private userId: number | null = null;
  private loginQueued = false;

  constructor() {
    super();

    this.socket = new Socket();
    // add socket listeners
    this.socket.on("close", (reason, code) => {
      console.error("Socket closed", reason, code);
      showToast(`Disconnected: ${reason}`, "warning");

      // if we have a username, queue the message
      if (this.username) {
        this.login();
      }

      this.connected = false;
    });
    this.socket.on("message", msg => this.onMessage(msg));
    this.socket.on("open", () => {
      this.connected = true;
    });

    const storedUsername = localStorage.getItem("username");
    if (storedUsername) {
      this.username = storedUsername;
      this.login();
    }
  }

  login() {
    if (this.loginQueued) return;
    this.loginQueued = true;
    this.socket.send({ type: "RequestUsername", username: this.username });
  }

  loginSubmit(e: CustomEvent<{ value: string }>) {
    this.username = e.detail.value;
    localStorage.setItem("username", this.username);
    this.login();
  }

  showRecepientMessages(recipient: MessageRecipient) {
    this.socket.send({ type: "GetMessages", recipient });
  }

  sendMessage(e: CustomEvent<{ message: string }>) {
    if (!this.currentRecipient) return;

    this.socket.send({ type: "SendMessage", message: e.detail.message, recipient: this.currentRecipient });
  }

  isForRecipient(msg: Message) {
    const r = msg.recipient;
    const cr = this.currentRecipient
    return ("User" in r && "User" in cr && r.User === cr.User) || ("Group" in r && "Group" in cr && r.Group === cr.Group) || ("User" in cr && cr.User === msg.sender);
  }

  onMessage(msg: ServerMessage) {
    switch (msg.type) {
      case "Error":
        showToast(msg.err, "error");
        this.loginQueued = false;
        break;
      case "Welcome":
        this.loggedIn = true;
        this.loginQueued = false;
        this.userId = msg.user_id;
        this.users = msg.users;
        this.groups = msg.groups;
        break;
      case "UserAdded":
        this.users = [...this.users, msg.user];
        break;
      case "UserOnline":
      case "UserOffline": {
        const idx = this.users.findIndex(el => el.id === msg.id);
        if (idx >= 0) {
          const item = this.users[idx];
          item.online = msg.type === "UserOnline";
          this.users = this.users.with(idx, item);
        }
        break;
      }
      case "GroupAdded":
        this.groups = [...this.groups, msg.group];
        break;
      case "GroupEdited": {
        const idx = this.groups.findIndex(el => el.id === msg.group.id);
        if (idx >= 0) {
          this.groups = this.groups.with(idx, msg.group);
        } else {
          // just add it
          this.groups = [...this.groups, msg.group];
        }
        break;
      }
      case "GroupDeleted": {
        const idx = this.groups.findIndex(el => el.id === msg.id);
        if (idx >= 0) {
          this.groups = this.groups.toSpliced(idx, 1);
        }
        break;
      }
      case "MessagesForRecipient":
        this.currentRecipient = msg.recipient;
        this.messages = msg.messages;
        break;
      case "MessageSent":
        // if it's for the current recipient, add it to the list
        // otherwise, TODO: show unread message
        if (this.currentRecipient && this.isForRecipient(msg.message)) {
          this.messages = [...this.messages, msg.message];
        }
        break;
    }
  }
  
  render() {
    const messageContents = this.currentRecipient ?
                            html`
                              <message-list
                                class="contents" .messages=${this.messages} .users=${[...this.users, { name: this.username, id: this.userId }]}
                                @send-message=${this.sendMessage}
                              ></message-list>
                            ` : html`
                              <welcome-message class="contents" .username=${this.username}></welcome-message>
                            `;
      const contents = this.loggedIn ?
                       html`
                       <side-bar
                         class="contents"
                         .groups=${this.groups} .users=${this.users} .currentRecipient=${this.currentRecipient}
                         @user-clicked=${(e: CustomEvent<{ id: number }>) => this.showRecepientMessages({ User: e.detail.id })}
                         @group-clicked=${(e: CustomEvent<{ id: number }>) => this.showRecepientMessages({ Group: e.detail.id })}
                       ></side-bar>
                       ${messageContents}
                       ` :
                       html`
                         <h2 class="text-xl font-bold">Please log in:</h2>
                         <form-input class="contents" label="Username" buttonLabel="Log in" @submit=${this.loginSubmit}></form-input>
                       `;

      return html`
      <hea-der .loggedIn=${this.loggedIn} .connected=${this.connected} .username=${this.username} ></hea-der>
      
      <div class="${classMap({ "flex": this.loggedIn, "p-3": !this.loggedIn })} grow relative min-h-0">
        ${contents}
      </div>
    `;
  }
}

