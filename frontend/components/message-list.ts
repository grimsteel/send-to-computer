import { html } from "lit";
import { repeat } from "lit/directives/repeat.js";
import { createRef, Ref, ref } from "lit/directives/ref.js";
import { customElement, property } from "lit/decorators.js";

import { StyledElement } from "../css";
import { Message, ServerUser } from "../socket";
import "./input";
import "./tag-list";
import "./message-row";

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

  render() {
    const renderedMessages = this.messages.length > 0 ?
      repeat(this.messages, m => m.id, message => {
        const username = this.users.find(el => el.id === message.sender).name;
        const date = new Date(message.time * 1000).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
        const canEdit = message.sender === this.userId;
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
    
    return html`
      <div class="flex flex-col grow mx-3 min-w-0">
        <h2 class="text-2xl font-bold">${this.title}</h2>
        <div class="grow overflow-y-auto pe-6" ${ref(this.messagesContainer)}>${renderedMessages}</div>
        <form-input class="mb-3" label="Send a message:" buttonLabel="Send" @submit=${this.onSend}></form-input>
      </div>
    `;
  }
}
