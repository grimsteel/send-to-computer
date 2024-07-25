import { StyledElement } from "../css";

import { customElement, property } from "lit/decorators.js";
import { ServerGroup, ServerUser } from "../socket";
import { html } from "lit";

@customElement("side-bar")
export default class Sidebar extends StyledElement {
  @property()
  users: ServerUser[];

  @property()
  groups: ServerGroup[];

  render() {
    const users = this.users.map(user => html`
      <button
             class="hover:bg-gray-600 cursor-pointer px-3 py-1 flex text-left w-full border-b border-gray-600 last:border-b-0"
             type="button"
        >
        ${user.name}
      </button>
    `);
    const groups = this.groups.map(group => html`
      <button
             class="hover:bg-gray-600 cursor-pointer px-3 py-1 flex text-left w-full border-b border-gray-600 last:border-b-0"
             type="button"
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
        ${groups.length > 0 ? }
      </div>
    `;
    }
}
