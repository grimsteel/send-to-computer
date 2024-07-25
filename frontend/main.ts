import { html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { classMap } from "lit/directives/class-map.js";
import "./components/input";
import "./components/sidebar";
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
  private sidebarExpanded = false;
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
      case "MessageForRecipient":
        this.currentRecipient = msg.recipient;
    }
  }
  
  render() {
      const contents = this.loggedIn ?
                       html`
                         <div class="transition-transform relative top-0 w-full md:translate-x-0 md:w-auto md:static md:block p-3 m-3 mt-0 bg-gray-800 border border-gray-600 rounded ${classMap({ "translate-x-[calc(-100%_-_2rem)]": !this.sidebarExpanded })}">
                           <side-bar
                                class="min-w-64 block" .groups=${this.groups} .users=${this.users} .currentRecipient=${this.currentRecipient}
                             @user-clicked=${(e: CustomEvent<{ id: number }>) => this.showRecepientMessages({ User: e.detail.id })}
                             @group-clicked=${(e: CustomEvent<{ id: number }>) => this.showRecepientMessages({ Group: e.detail.id })}
                             >
                           </side-bar>
                         </div>
                         
                         <button class="md:hidden absolute left-0 top-1/2 border font-medium rounded-e-lg text-sm py-6 bg-gray-800 text-gray-300 border-l-0  border-gray-600 hover:bg-gray-700 hover:border-gray-600" @click=${() => this.sidebarExpanded = !this.sidebarExpanded}>
                           <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6 transition-transform ${classMap({ "rotate-180": this.sidebarExpanded })}">
                             <path stroke-linecap="round" stroke-linejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                           </svg>
                         </button> 
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

      const greeting = this.loggedIn ? html`
      <span class="text-sm font-medium inline-flex items-center px-2.5 py-0.5 rounded bg-orange-950/75 text-orange-400 border border-orange-400 me-1.5">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-3 h-3 me-1.5">
          <path d="M8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM12.735 14c.618 0 1.093-.561.872-1.139a6.002 6.002 0 0 0-11.215 0c-.22.578.254 1.139.872 1.139h9.47Z" />
        </svg>
        ${this.username}
      </span>
    ` : nothing;

    const connectionIndicator = this.connected ? html`
      <span class="text-sm font-medium inline-flex items-center px-2.5 py-0.5 rounded bg-emerald-950/75 text-emerald-400 border border-emerald-400">
        <span class="relative flex h-2 w-2 me-1.5">
          <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-current opacity-75"></span>
          <span class="relative inline-flex rounded-full h-2 w-2 bg-current"></span>
        </span>
        Online
      </span>
    ` : html`
      <span class="text-sm font-medium inline-flex items-center px-2.5 py-0.5 rounded bg-rose-950/75 text-rose-400 border border-rose-400">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3 me-1.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-cloud-off"><path d="m2 2 20 20"/><path d="M5.782 5.782A7 7 0 0 0 9 19h8.5a4.5 4.5 0 0 0 1.307-.193"/><path d="M21.532 16.5A4.5 4.5 0 0 0 17.5 10h-1.79A7.008 7.008 0 0 0 10 5.07"/></svg>
        Offline
      </span>
    `;

      return html`
      <div class="flex items-center bg-gradient-to-r from-gray-700 to-slate-800 text-gray-100 p-3 m-3 border border-gray-600 rounded">
        <h1 class="text-2xl font-bold me-auto">
          Send to Computer
        </h1>
        ${greeting}
        ${connectionIndicator}
      </div>
      <div class="${classMap({ "flex": this.loggedIn, "p-3": !this.loggedIn })} grow relative">
        ${contents}
      </div>
    `;
    }
}

