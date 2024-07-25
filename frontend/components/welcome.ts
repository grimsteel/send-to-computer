import { customElement, property } from "lit/decorators.js";

import { StyledElement } from "../css";
import { html } from "lit";

@customElement("welcome-message")
export default class extends StyledElement {
  @property()
  username: string;
  
  render() {
    return html`
      <div class="h-full flex items-center justify-center grow mx-3">
        <div class="border bg-gray-800 p-3 rounded border-gray-600 text-center">
          <h2 class="text-2xl font-semibold mb-1">
            Welcome to <strong class="font-bold bg-gradient-to-r from-orange-200 to-rose-300 text-transparent bg-clip-text">Send to Computer</strong>!
          </h2>
          <p class="text-lg mb-2 text-gray-200">You are logged in as: <strong class="font-semibold">${this.username}</strong></p>
          <p class="text-gray-300">Select a user or group using the <br> sidebar on the left to send a message.</p>
        </div>
      </div>
    `;
  }
}
