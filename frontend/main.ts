import { html } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { classMap } from "lit/directives/class-map.js";
import "./components/input";
import { showToast } from "./components/toast";

import { stylesheet, StyledElement } from "./css";
import Socket, { ServerMessage } from "./socket";

document.adoptedStyleSheets.push(stylesheet.styleSheet);

@customElement("stc-app")
export class StcApp extends StyledElement {
  @state()
  private loggedIn = false;
  @state()
  private connected = false;

  @state()
  private username: string | null = null;

  private socket: Socket;
  private userId: number | null = null;

  constructor() {
    super();

    this.socket = new Socket();
    // add socket listeners
    this.socket.on("close", (reason, code) => {
      console.error("Socket closed", reason, code);
      showToast(`Disconnected: ${reason}`, "warning");

      // if we have a username, queue the message
      if (this.username) {
        this.socket.send({ type: "RequestUsername", username: this.username });
      }

      this.connected = false;
    });
    this.socket.on("message", msg => this.onMessage(msg));
    this.socket.on("open", () => {
      this.connected = true;
    });
  }

  loginSubmit(e: SubmitEvent) {
    e.preventDefault();

    this.socket.send({ type: "RequestUsername", username: this.username });
  }

  onMessage(msg: ServerMessage) {
    console.log("message", msg);
    switch (msg.type) {
      case "Error":
        showToast(msg.err, "error");
        break;
      case "Welcome":
        this.loggedIn = true;
        this.userId = msg.user_id;
        break;
    }
  }
  
  render() {
    const contents = this.loggedIn ?
                     html`` :
                     html`
                       <fh2 class="text-lg mb-2">Please log in:</h2>
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
    
    const greeting = this.loggedIn ? html`<span>Hello, ${this.username}</span>` : "";
    
    return html`
      <h1 class="bg-gray-700 text-gray-100 p-3 border-b-2 border-gray-500 text-xl flex justify-between items-center">
        Send to Computer
        ${greeting}
    </h1>
    <div class="${classMap({ "flex": this.loggedIn, "flex-col": this.loggedIn })} bg-gray-900 p-3 grow text-white">
      ${contents}
    </div>
  `;
}
}

