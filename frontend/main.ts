import { html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { classMap } from "lit/directives/class-map.js";
import "./components/input";
import "./components/sidebar";
import "./components/header";
import { showToast } from "./components/toast";

import { stylesheet, StyledElement } from "./css";
import Socket, { MessageRecipient, type ServerGroup, type ServerMessage, type ServerUser } from "./socket";

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

  loginSubmit(e: SubmitEvent) {
    e.preventDefault();

    localStorage.setItem("username", this.username);
    this.login();
  }

  showRecepientMessages(recipient: MessageRecipient) {
    this.socket.send({ type: "GetMessages", recipient });
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
        break;
    }
  }
  
  render() {
      const contents = this.loggedIn ?
                       html`
                         <side-bar class="contents"
                           .groups=${this.groups} .users=${this.users} .currentRecipient=${this.currentRecipient}
                           @user-clicked=${(e: CustomEvent<{ id: number }>) => this.showRecepientMessages({ User: e.detail.id })}
                           @group-clicked=${(e: CustomEvent<{ id: number }>) => this.showRecepientMessages({ Group: e.detail.id })}
                           >
                         </side-bar>
                       ` :
                       html`
                         <h2 class="text-xl font-bold">Please log in:</h2>
                         <form class="flex items-end gap-3" @submit=${this.loginSubmit}>
                           <form-input
                                label="Username" value=${this.username ?? ""} required class="grow"
                             @value-change=${(e: CustomEvent<{ value: string }>) => this.username = e.detail.value}
                         >
                           </form-input>
                           <button type="submit" class="text-white bg-orange-600 hover:bg-orange-700 focus:ring-4 focus:ring-orange-800 font-medium rounded-lg text-sm px-5 py-2.5 focus:outline-none">
                             Log in
                           </button>
                       </form>
                       `;
    
    return html`
      <hea-der .loggedIn=${this.loggedIn} .connected=${this.connected} .username=${this.username} ></hea-der>
      
      <div class="${classMap({ "flex": this.loggedIn, "p-3": !this.loggedIn })} grow relative">
        ${contents}
      </div>
    `;
  }
}

