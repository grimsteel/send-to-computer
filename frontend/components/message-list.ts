import { html, nothing } from "lit";
import { repeat } from "lit/directives/repeat.js";
import { createRef, Ref, ref } from "lit/directives/ref.js";
import { customElement, property, state } from "lit/decorators.js";

import { StyledElement } from "../css";
import { Message, ServerUser } from "../socket";
import "./input";
import "./tag-list";
import "./message-row";
import { live } from "lit/directives/live.js";

@customElement("message-list")
export default class MessageList extends StyledElement {
  @property()
  title: string;
  @property()
  users: ServerUser[];
  @property()
  userId: number;
  
  @property()
  messages: Message[];

  @state()
  private isSearching = false;
  @state()
  private searchFilter: Set<string> = new Set();

  private messagesContainer: Ref<HTMLDivElement> = createRef();

  private onSend(e: CustomEvent<{ value: string }>) {
    this.dispatchEvent(new CustomEvent("send-message", { detail: { message: e.detail.value } }));
  }

  /** scroll the message container if the user was at the bottom */
  private scrollContainer() {
    const messageContainer = this.messagesContainer.value;
    if (messageContainer) {
      const scrollBottom = messageContainer.scrollTop + messageContainer.clientHeight;
      // this happens before the DOM update -- if they _were_ scrolled to the bottom (or near the bottom)
      if (scrollBottom + 16 >= messageContainer.scrollHeight) {
        // after the DOM update, scroll it
        queueMicrotask(() => {
          // the container may have changed
          const messageContainer = this.messagesContainer.value;
          if (messageContainer) {
            messageContainer.scrollBy({ top: messageContainer.scrollHeight - messageContainer.scrollTop - messageContainer.clientHeight, behavior: "instant" });
          }
        });
      }
    }
  }

  updated(changedProperties: Map<string, any>) {
    if (changedProperties.has("messages")) {
      this.scrollContainer()
    }
  }

  private tagsChanged(messageId: number, e: CustomEvent<{ tags: string[] }>) {
    this.dispatchEvent(new CustomEvent("tags-changed", { detail: { messageId, tags: e.detail.tags } }));
  }

  private deleteMessage(messageId: number) {
    this.dispatchEvent(new CustomEvent("delete-message", { detail: { messageId } }));
  }

  private messageChanged(messageId: number, e: CustomEvent<{ message: string }>) {
    this.dispatchEvent(new CustomEvent("message-changed", { detail: { messageId, message: e.detail.message } }));
  }

  private onFilterChange(e: InputEvent) {
    const value = (e.target as HTMLInputElement).value;
    const tags = new Set(value.trim().split(/[\s,]+/).map(el => el.toLowerCase()).filter(el => el));
    this.searchFilter = tags;
  }

  render() {
    const renderedMessages = this.messages.length > 0 ?
      repeat(this.messages, m => m.id, message => {
        const username = this.users.find(el => el.id === message.sender).name;
        const date = new Date(message.time * 1000).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
        const canEdit = message.sender === this.userId;
        if (this.isSearching && this.searchFilter.size > 0) {
          // if none of the tags match, don't render
          if (!message.tags.some(el => this.searchFilter.has(el))) return nothing;
        }
        return html`
          <message-row
            .date=${date} .canEdit=${canEdit} .message=${message.message} .sender=${username}
            .tags=${message.tags} @delete=${() => this.deleteMessage(message.id)}
            @tags-changed-1=${(e: CustomEvent<{ tags: string[]; }>) => this.tagsChanged(message.id, e)}
            @message-changed=${(e: CustomEvent<{ message: string; }>) => this.messageChanged(message.id, e)}
          ></message-row>
        `;
      }) :
      html`
        <div class="flex items-center justify-center h-full">
          <p class="text-2xl text-gray-500">No messages yet...</p>
        </div>
      `;

    // show an X if we're already searching
    const searchIcon = this.isSearching ?
                       html`
                         <svg class="w-3 h-3" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 14 14">
                           <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m1 1 6 6m0 0 6 6M7 7l6-6M7 7l-6 6"/>
                         </svg>
                       ` :
                       html`
                         <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="size-4">
                           <path fill-rule="evenodd" d="M9.965 11.026a5 5 0 1 1 1.06-1.06l2.755 2.754a.75.75 0 1 1-1.06 1.06l-2.755-2.754ZM10.5 7a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0Z" clip-rule="evenodd" />
                         </svg>
                       `;

    const searchInput = this.isSearching ?
                        html`
                          <input
                            type="text" .value=${[...this.searchFilter].join(" ")}
                            placeholder="Separate tags with spaces"
                            class="border text-xs rounded-lg block w-full p-2 bg-gray-800 border-gray-700 text-white focus:ring-orange-500 focus:border-orange-500 mb-2"
                            @input=${this.onFilterChange}
                          />
                        ` : nothing;
    
    return html`
      <div class="flex flex-col grow mx-3 min-w-0">
        <h2 class="text-2xl font-bold items-center flex mb-2">
          ${this.title}
          <button type="button" class="text-gray-400 bg-transparent rounded-lg text-sm w-8 h-8 ms-auto inline-flex justify-center items-center hover:bg-gray-600 hover:text-white" @click=${() => this.isSearching = !this.isSearching}>
            ${searchIcon}
          </button>
        </h2>
        ${searchInput}
        <div class="grow overflow-y-auto pe-6" ${ref(this.messagesContainer)}>${renderedMessages}</div>
        <form-input class="mb-3" label="Send a message:" buttonLabel="Send" @submit=${this.onSend}></form-input>
      </div>
    `;
    }
}
