import { customElement, property, state } from "lit/decorators.js";
import { StyledElement } from "../css";
import { html, nothing } from "lit";
import { live } from "lit/directives/live.js";
import { createRef, ref, Ref } from "lit/directives/ref.js";

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
  tags: string[];

  private messageInput: Ref<HTMLTextAreaElement> = createRef();

  @state()
  private editing: boolean = false;

  private startEditing() {
    this.editing = true;
    queueMicrotask(() => {
      this.messageInput.value?.focus();
    });
  }

  private saveEdit() {
    this.dispatchEvent(new CustomEvent("message-changed", { detail: { message: this.messageInput.value?.value } }));
    this.editing = false;
  }

  render() {
    const editButton = this.canEdit ? (this.editing ?
      html`
        <button
          class="p-0 text-emerald-500 hover:text-emerald-600 cursor-pointer me-2"
          type="button" @click=${this.saveEdit}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-4 h-4 mt-px">
            <path fill-rule="evenodd" d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z" clip-rule="evenodd" />
          </svg>
        </button>
      ` :
      html`
        <button
          class="p-0 text-amber-500 hover:text-amber-600 cursor-pointer me-2"
          type="button" @click=${this.startEditing}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-4 h-4">
            <path d="M13.488 2.513a1.75 1.75 0 0 0-2.475 0L6.75 6.774a2.75 2.75 0 0 0-.596.892l-.848 2.047a.75.75 0 0 0 .98.98l2.047-.848a2.75 2.75 0 0 0 .892-.596l4.261-4.262a1.75 1.75 0 0 0 0-2.474Z" />
            <path d="M4.75 3.5c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h6.5c.69 0 1.25-.56 1.25-1.25V9A.75.75 0 0 1 14 9v2.25A2.75 2.75 0 0 1 11.25 14h-6.5A2.75 2.75 0 0 1 2 11.25v-6.5A2.75 2.75 0 0 1 4.75 2H7a.75.75 0 0 1 0 1.5H4.75Z" />
          </svg>
        </button>
      `) : nothing;

    return html`
      <p style="overflow-wrap: break-word;" class="flex items-center">
        <strong class="font-semibold me-1">${this.sender}:</strong>
        <!-- editable message -->
        <textarea
          style="overflow-wrap: break-word; field-sizing: content;" ${ref(this.messageInput)}
          class="bg-transparent border-0 p-0 focus:text-orange-200 transition-colors focus:outline-0 focus:border-0 focus:ring-0 enabled:underline leading-none cursor-text min-w-0 grow me-auto" rows="1"
          ?disabled=${!this.editing} .value=${live(this.message)} wrap="soft"></textarea>

        ${editButton}

        <!-- copy -->
        <button class="p-0 text-teal-500 hover:text-teal-600 cursor-pointer me-2" type="button" @click=${() => navigator.clipboard.writeText(this.message)}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-4 h-4 mb-px">
            <path fill-rule="evenodd" d="M11.986 3H12a2 2 0 0 1 2 2v6a2 2 0 0 1-1.5 1.937V7A2.5 2.5 0 0 0 10 4.5H4.063A2 2 0 0 1 6 3h.014A2.25 2.25 0 0 1 8.25 1h1.5a2.25 2.25 0 0 1 2.236 2ZM10.5 4v-.75a.75.75 0 0 0-.75-.75h-1.5a.75.75 0 0 0-.75.75V4h3Z" clip-rule="evenodd" />
            <path fill-rule="evenodd" d="M3 6a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1H3Zm1.75 2.5a.75.75 0 0 0 0 1.5h3.5a.75.75 0 0 0 0-1.5h-3.5ZM4 11.75a.75.75 0 0 1 .75-.75h3.5a.75.75 0 0 1 0 1.5h-3.5a.75.75 0 0 1-.75-.75Z" clip-rule="evenodd" />
          </svg>
        </button>

        <!-- delete -->
        <button
          class="p-0 text-rose-500 hover:text-rose-600 cursor-pointer me-2"
          type="button" @click=${() => this.dispatchEvent(new Event("delete"))}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-4 h-4">
            <path fill-rule="evenodd" d="M5 3.25V4H2.75a.75.75 0 0 0 0 1.5h.3l.815 8.15A1.5 1.5 0 0 0 5.357 15h5.285a1.5 1.5 0 0 0 1.493-1.35l.815-8.15h.3a.75.75 0 0 0 0-1.5H11v-.75A2.25 2.25 0 0 0 8.75 1h-1.5A2.25 2.25 0 0 0 5 3.25Zm2.25-.75a.75.75 0 0 0-.75.75V4h3v-.75a.75.75 0 0 0-.75-.75h-1.5ZM6.05 6a.75.75 0 0 1 .787.713l.275 5.5a.75.75 0 0 1-1.498.075l-.275-5.5A.75.75 0 0 1 6.05 6Zm3.9 0a.75.75 0 0 1 .712.787l-.275 5.5a.75.75 0 0 1-1.498-.075l.275-5.5a.75.75 0 0 1 .786-.711Z" clip-rule="evenodd" />
          </svg>
        </button>
      </p>

      <!-- date/tags -->
      <p class="mb-3 text-gray-300 text-sm flex items-center flex-wrap">
        <span class="me-1">${this.date}</span><span class="me-1">•</span>
        <tag-list .tags=${this.tags} .canEdit=${this.canEdit} class="grow"
          ></tag-list>
      </p>
    `;
    }
}
