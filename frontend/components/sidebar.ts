import { StyledElement } from "../css";

import { customElement, property, state } from "lit/decorators.js";
import { classMap } from "lit/directives/class-map.js";
import { MessageRecipient, ServerGroup, ServerUser } from "../socket";
import { html, nothing } from "lit";

import "./create-group-modal";
import { createRef, Ref, ref } from "lit/directives/ref.js";
import CreateGroupModal from "./create-group-modal";

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

  private editingGroup: number | null = null;
  private createGroupModal: Ref<CreateGroupModal> = createRef();

  private userClicked(userId: number) {
    const ev = new CustomEvent("user-clicked", { detail: { id: userId } });
    this.sidebarExpanded = false;
    this.dispatchEvent(ev);
  }
  private groupClicked(groupId: number) {
    const ev = new CustomEvent("group-clicked", { detail: { id: groupId } });
    this.sidebarExpanded = false;
    this.dispatchEvent(ev);
  }
  private createGroup() {
    // create new group
    this.editingGroup = null;
    this.createGroupModal.value?.show();
  }
  private editGroup(group: ServerGroup) {
    this.editingGroup = group.id;
    this.createGroupModal.value?.show(group.name, group.members);
  }
  private createModalSubmit(e: CustomEvent<{ name: string, members: string[] }>) {
    if (this.editingGroup !== null) {
      this.dispatchEvent(new CustomEvent("edit-group", { detail: { id: this.editingGroup, ...e.detail } }));
    } else {
      this.dispatchEvent(new CustomEvent("create-group", { detail: e.detail }));
    }
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
                 class="hover:bg-gray-600 cursor-pointer px-3 py-1 flex text-left w-full border-b border-gray-600 last:border-b-0 items-center transition-colors"
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
      const groupActions = html`
        <!-- edit -->
        <button
          class="p-0 text-amber-500 hover:text-amber-600 cursor-pointer ms-auto"
          type="button" @click=${() => this.editGroup(group)}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-3 h-3">
            <path d="M13.488 2.513a1.75 1.75 0 0 0-2.475 0L6.75 6.774a2.75 2.75 0 0 0-.596.892l-.848 2.047a.75.75 0 0 0 .98.98l2.047-.848a2.75 2.75 0 0 0 .892-.596l4.261-4.262a1.75 1.75 0 0 0 0-2.474Z" />
            <path d="M4.75 3.5c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h6.5c.69 0 1.25-.56 1.25-1.25V9A.75.75 0 0 1 14 9v2.25A2.75 2.75 0 0 1 11.25 14h-6.5A2.75 2.75 0 0 1 2 11.25v-6.5A2.75 2.75 0 0 1 4.75 2H7a.75.75 0 0 1 0 1.5H4.75Z" />
          </svg>
        </button>

        <!-- delete -->
        <button
          class="p-0 text-rose-500 hover:text-rose-600 cursor-pointer ms-2"
          type="button" @click=${() => this.dispatchEvent(new CustomEvent("delete-group", { detail: { id: group.id } } ))}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-3 h-3">
            <path fill-rule="evenodd" d="M5 3.25V4H2.75a.75.75 0 0 0 0 1.5h.3l.815 8.15A1.5 1.5 0 0 0 5.357 15h5.285a1.5 1.5 0 0 0 1.493-1.35l.815-8.15h.3a.75.75 0 0 0 0-1.5H11v-.75A2.25 2.25 0 0 0 8.75 1h-1.5A2.25 2.25 0 0 0 5 3.25Zm2.25-.75a.75.75 0 0 0-.75.75V4h3v-.75a.75.75 0 0 0-.75-.75h-1.5ZM6.05 6a.75.75 0 0 1 .787.713l.275 5.5a.75.75 0 0 1-1.498.075l-.275-5.5A.75.75 0 0 1 6.05 6Zm3.9 0a.75.75 0 0 1 .712.787l-.275 5.5a.75.75 0 0 1-1.498-.075l.275-5.5a.75.75 0 0 1 .786-.711Z" clip-rule="evenodd" />
          </svg>
        </button>
      `;

      if (isGroupRecipient && group.id === (this.currentRecipient as { Group: number }).Group) {
        return html`
          <p
            class="px-3 py-1 flex text-left w-full outline outline-1 outline-orange-600 bg-orange-950 last:border-b-0 items-center first:rounded-t last:rounded-b"
            >
            ${group.name}
            ${groupActions}
          </p>
        `;
      } else {
        return html`
          <button
                 class="hover:bg-gray-600 cursor-pointer px-3 py-1 flex text-left w-full border-b border-gray-600 last:border-b-0 items-center transition-colors"
                 type="button" @click=${() => this.groupClicked(group.id)}
            >
            ${group.name}
            ${groupActions}
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
          ${groups}
          <button
                 class="hover:bg-orange-950 hover:outline-orange-600/75 transition-colors cursor-pointer px-3 py-1 flex text-left w-full bg-orange-950/50 last:border-b-0 items-center first:rounded-t last:rounded-b outline-orange-700/50 outline outline-1"
                 type="button" @click=${this.createGroup}
            >
            Create group...
          </button>
        </div>
      </div>
      
      <button class="md:hidden absolute left-0 top-1/2 border font-medium rounded-e-lg text-sm py-6 bg-gray-800 text-gray-300 border-l-0  border-gray-600 hover:bg-gray-700 hover:border-gray-600" @click=${() => this.sidebarExpanded = !this.sidebarExpanded}>
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6 transition-transform ${classMap({ "rotate-180": this.sidebarExpanded })}">
          <path stroke-linecap="round" stroke-linejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
        </svg>
      </button>

      <create-group-modal ${ref(this.createGroupModal)} @modal-submit=${this.createModalSubmit}></create-group-modal>
    `;
    }
}
