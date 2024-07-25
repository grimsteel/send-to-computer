import { StyledElement } from "../css";

import { customElement, property } from "lit/decorators.js";
import { html, nothing } from "lit";

@customElement("hea-der")
export default class extends StyledElement {
  @property()
  loggedIn = false;
  @property()
  username: string;
  @property()
  connected = false;
  
  render() {
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
    `;
  }
}
