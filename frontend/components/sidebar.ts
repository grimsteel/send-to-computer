import { StyledElement } from "../css";

import { customElement, property } from "lit/decorators.js";
import { ServerGroup, ServerUser } from "../socket";
import { html, nothing } from "lit";

const onlineIndicator = html`<span class="flex w-2 h-2 ms-auto bg-emerald-500 rounded-full" title="Online"></span>`;

@customElement("side-bar")
export default class Sidebar extends StyledElement {
  @property()
  users: ServerUser[];
  @property()
  groups: ServerGroup[];

  userClicked(userId: number) {
    const ev = new CustomEvent("user-clicked", { detail: { id: userId } });
    this.dispatchEvent(ev);
  }
  groupClicked(groupId: number) {
    const ev = new CustomEvent("group-clicked", { detail: { id: groupId } });
    this.dispatchEvent(ev);
  }
  
  render() {
    const users = this.users.map(user => html`
      <button
             class="hover:bg-gray-600 cursor-pointer px-3 py-1 flex text-left w-full border-b border-gray-600 last:border-b-0 items-center"
             type="button" @click=${() => this.userClicked(user.id)}
        >
        ${user.name}
        
        ${user.online ? onlineIndicator : nothing}
      </button>
    `);
    const groups = this.groups.map(group => html`
      <button
             class="hover:bg-gray-600 cursor-pointer px-3 py-1 flex text-left w-full border-b border-gray-600 last:border-b-0"
             type="button" @click=${() => this.groupClicked(group.id)}
        >
        ${group.name}
      </button>
    `);
    
    return html`
      <h2 class="text-lg font-semibold mb-2">Users:</h2>
      <div class="border border-gray-600 rounded mb-3">
        ${users}
      </div>
      <h2 class="text-lg font-semibold mb-2">Groups:</h2>
      <div class="border border-gray-600 rounded mb-3">
        ${groups.length > 0 ? groups : html`<p class="px-3 py-1">No groups yet...</p>`}
      </div>
    `;
  }
}
