import { html } from "lit";
import { repeat } from "lit/directives/repeat.js";
import { createRef, Ref, ref } from "lit/directives/ref.js";
import { customElement, property } from "lit/decorators.js";

import { StyledElement } from "../css";
import { Message, ServerUser } from "../socket";
import "./input";
import "./tag-list";

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

  private messagesContainer: Ref<HTMLDivElement> = createRef();

  private onSend(e: CustomEvent<{ value: string }>) {
    this.dispatchEvent(new CustomEvent("send-message", { detail: { message: e.detail.value } }));
  }

  private scrollContainer() {
    this.messagesContainer.value?.lastElementChild?.scrollIntoView({ behavior: "instant" });
  }

  updated(changedProperties: Map<string, any>) {
    if (changedProperties.has("messages")) {
      queueMicrotask(() => this.scrollContainer());
    }
  }

  private tagsChanged(messageId: number, e: CustomEvent<{ tags: string[] }>) {
    this.dispatchEvent(new CustomEvent("tags-changed", { detail: { messageId, tags: e.detail.tags } }));
  }

  private deleteMessage(messageId: number) {
    this.dispatchEvent(new CustomEvent("delete-message", { detail: { messageId } }));
  }

  render() {
    const renderedMessages = this.messages.length > 0 ?
      repeat(this.messages, m => m.id, message => {
        const username = this.users.find(el => el.id === message.sender).name;
        const date = new Date(message.time * 1000).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
        const canEdit = message.sender === this.userId;
          return html`
          <p style="overflow-wrap: break-word;" class="flex items-center">
            <strong class="font-semibold me-1">${username}:</strong>
            <span style="overflow-wrap: break-word" class="min-w-0">${message.message}</span>
            <button class="p-0 ms-auto text-rose-500 hover:text-rose-600 cursor-pointer" type="button" @click=${() => this.deleteMessage(message.id)}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-3.5 h-3.5">
                <path fill-rule="evenodd" d="M5 3.25V4H2.75a.75.75 0 0 0 0 1.5h.3l.815 8.15A1.5 1.5 0 0 0 5.357 15h5.285a1.5 1.5 0 0 0 1.493-1.35l.815-8.15h.3a.75.75 0 0 0 0-1.5H11v-.75A2.25 2.25 0 0 0 8.75 1h-1.5A2.25 2.25 0 0 0 5 3.25Zm2.25-.75a.75.75 0 0 0-.75.75V4h3v-.75a.75.75 0 0 0-.75-.75h-1.5ZM6.05 6a.75.75 0 0 1 .787.713l.275 5.5a.75.75 0 0 1-1.498.075l-.275-5.5A.75.75 0 0 1 6.05 6Zm3.9 0a.75.75 0 0 1 .712.787l-.275 5.5a.75.75 0 0 1-1.498-.075l.275-5.5a.75.75 0 0 1 .786-.711Z" clip-rule="evenodd" />
              </svg>
            </button>
          </p>
          <p class="mb-3 text-gray-300 text-sm">
            ${date} •
            <tag-list .tags=${message.tags} .canEdit=${canEdit}
              @tags-changed=${(e: CustomEvent<{ tags: string[]; }>) => this.tagsChanged(message.id, e)}
            ></tag-list>
          </p>
        `;
      }) :
          html`
        <div class="flex items-center justify-center h-full">
          <p class="text-2xl text-gray-500">No messages yet...</p>
        </div>
      `;
    
    return html`
      <div class="flex flex-col grow mx-3 min-w-0">
        <h2 class="text-2xl font-bold">${this.title}</h2>
        <div class="grow overflow-y-auto pe-6" ${ref(this.messagesContainer)}>${renderedMessages}</div>
        <form-input class="mb-3" label="Send a message:" buttonLabel="Send" @submit=${this.onSend}></form-input>
      </div>
    `;
  }
}
