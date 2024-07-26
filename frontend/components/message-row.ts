import { customElement, property } from "lit/decorators.js";
import { StyledElement } from "../css";
import { html } from "lit";

@customElement("message-row")
export default class extends StyledElement {
  @property()
  date: Date
  @property()
  canEdit: boolean;
  @property()
  message: string;
  @property()
  sender: string;
  @property()
  tags: string[]

  render() {
    return html`
      <p style="overflow-wrap: break-word;" class="flex items-center">
        <strong class="font-semibold me-1">${this.sender}:</strong>
        <span style="overflow-wrap: break-word" class="min-w-0">${this.message}</span>

        <!-- copy -->
        <button class="p-0 text-emerald-500 hover:text-emerald-600 cursor-pointer ms-auto" type="button" @click=${() => navigator.clipboard.writeText(this.message)}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-4 h-4">
            <path fill-rule="evenodd" d="M11.986 3H12a2 2 0 0 1 2 2v6a2 2 0 0 1-1.5 1.937V7A2.5 2.5 0 0 0 10 4.5H4.063A2 2 0 0 1 6 3h.014A2.25 2.25 0 0 1 8.25 1h1.5a2.25 2.25 0 0 1 2.236 2ZM10.5 4v-.75a.75.75 0 0 0-.75-.75h-1.5a.75.75 0 0 0-.75.75V4h3Z" clip-rule="evenodd" />
            <path fill-rule="evenodd" d="M3 6a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1H3Zm1.75 2.5a.75.75 0 0 0 0 1.5h3.5a.75.75 0 0 0 0-1.5h-3.5ZM4 11.75a.75.75 0 0 1 .75-.75h3.5a.75.75 0 0 1 0 1.5h-3.5a.75.75 0 0 1-.75-.75Z" clip-rule="evenodd" />
          </svg>
        </button>

        <!-- delete -->
        <button
          class="p-0 text-rose-500 hover:text-rose-600 cursor-pointer ms-2"
          type="button" @click=${() => this.dispatchEvent(new Event("delete"))}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-4 h-4">
            <path fill-rule="evenodd" d="M5 3.25V4H2.75a.75.75 0 0 0 0 1.5h.3l.815 8.15A1.5 1.5 0 0 0 5.357 15h5.285a1.5 1.5 0 0 0 1.493-1.35l.815-8.15h.3a.75.75 0 0 0 0-1.5H11v-.75A2.25 2.25 0 0 0 8.75 1h-1.5A2.25 2.25 0 0 0 5 3.25Zm2.25-.75a.75.75 0 0 0-.75.75V4h3v-.75a.75.75 0 0 0-.75-.75h-1.5ZM6.05 6a.75.75 0 0 1 .787.713l.275 5.5a.75.75 0 0 1-1.498.075l-.275-5.5A.75.75 0 0 1 6.05 6Zm3.9 0a.75.75 0 0 1 .712.787l-.275 5.5a.75.75 0 0 1-1.498-.075l.275-5.5a.75.75 0 0 1 .786-.711Z" clip-rule="evenodd" />
          </svg>
        </button>
      </p>

      <!-- date/tags -->
      <p class="mb-3 text-gray-300 text-sm flex items-center">
        <span class="me-1">${this.date} •</span>
        <tag-list .tags=${this.tags} .canEdit=${this.canEdit} class="grow"
          ></tag-list>
      </p>
    `;
  }
}
