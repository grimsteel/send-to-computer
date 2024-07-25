import { StyledElement } from "../css";

import { customElement, property, state } from "lit/decorators.js";
import { classMap } from "lit/directives/class-map.js";
import { MessageRecipient, ServerGroup, ServerUser } from "../socket";
import { html, nothing } from "lit";

const onlineIndicator = html`<span class="flex w-2 h-2 ms-auto bg-emerald-500 rounded-full" title="Online"></span>`;

@customElement("side-bar")
export default class Sidebar extends StyledElement {
  @property()
  users: ServerUser[];
  @property()
  groups: ServerGroup[];
  @property()
  currentRecipient: MessageRecipient | null;
  
  @state()
  private sidebarExpanded = false;

  userClicked(userId: number) {
    const ev = new CustomEvent("user-clicked", { detail: { id: userId } });
    this.sidebarExpanded = false;
    this.dispatchEvent(ev);
  }
  groupClicked(groupId: number) {
    const ev = new CustomEvent("group-clicked", { detail: { id: groupId } });
    this.sidebarExpanded = false;
    this.dispatchEvent(ev);
  }
  
  render() {
    const isUserRecipient = this.currentRecipient && "User" in this.currentRecipient;
    const users = this.users.map(user => {
      if (isUserRecipient && user.id === (this.currentRecipient as { User: number }).User) {
        return html`
          <p
                 class="px-3 py-1 flex text-left w-full outline outline-1 outline-orange-600 bg-orange-950 last:border-b-0 items-center first:rounded-t last:rounded-b"
            >
            ${user.name}
        
            ${user.online ? onlineIndicator : nothing}
          </p>
        `;
      } else {
        return html`
          <button
                 class="hover:bg-gray-600 cursor-pointer px-3 py-1 flex text-left w-full border-b border-gray-600 last:border-b-0 items-center"
                 type="button" @click=${() => this.userClicked(user.id)}
            >
            ${user.name}
        
            ${user.online ? onlineIndicator : nothing}
          </button>
        `;
      }
    });
    const isGroupRecipient = this.currentRecipient && "Group" in this.currentRecipient;
    const groups = this.groups.map(group => {
      if (isGroupRecipient && group.id === (this.currentRecipient as { Group: number }).Group) {
            return html`
              <p
                class="px-3 py-1 flex text-left w-full outline outline-1 outline-orange-600 bg-orange-950 last:border-b-0 items-center first:rounded-t last:rounded-b"
            >
                ${group.name}
              </p>
            `;
      } else {
        return html`
          <button
                 class="hover:bg-gray-600 cursor-pointer px-3 py-1 flex text-left w-full border-b border-gray-600 last:border-b-0 items-center"
                 type="button" @click=${() => this.groupClicked(group.id)}
            >
            ${group.name}
          </button>
        `;
      }
    });

    return html`
      <div class="transition-transform absolute top-0 w-[calc(100%_-_1.5rem)] h-[calc(100%_-_0.75rem)] md:translate-x-0 md:w-auto md:static md:block p-3 m-3 mt-0 bg-gray-800 border border-gray-600 rounded ${classMap({ "translate-x-[calc(-100%_-_2rem)]": !this.sidebarExpanded })} min-w-64">
        <h2 class="sr-only">Sidebar</h2>
        
        <h3 class="text-lg font-semibold mb-2">Users:</h2>
        <div class="border border-gray-600 rounded mb-3">
          ${users.length > 0 ? users : html`<p class="px-3 py-1">No users yet...</p>`}
        </div>
        <h3 class="text-lg font-semibold mb-2">Groups:</h2>
        <div class="border border-gray-600 rounded mb-3">
          ${groups.length > 0 ? groups : html`<p class="px-3 py-1">No groups yet...</p>`}
        </div>
      </div>
      
      <button class="md:hidden absolute left-0 top-1/2 border font-medium rounded-e-lg text-sm py-6 bg-gray-800 text-gray-300 border-l-0  border-gray-600 hover:bg-gray-700 hover:border-gray-600" @click=${() => this.sidebarExpanded = !this.sidebarExpanded}>
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6 transition-transform ${classMap({ "rotate-180": this.sidebarExpanded })}">
          <path stroke-linecap="round" stroke-linejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
        </svg>
      </button> 
    `;
    }
}
