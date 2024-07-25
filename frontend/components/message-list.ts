import { html } from "lit";
import { repeat } from "lit/directives/repeat.js";
import { createRef, Ref, ref } from "lit/directives/ref.js";
import { customElement, property } from "lit/decorators.js";

import { StyledElement } from "../css";
import { Message, ServerUser } from "../socket";
import "./input";

@customElement("message-list")
export default class MessageList extends StyledElement {
  @property()
  title: string;
  @property()
  users: ServerUser[];s
  
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

  render() {
    const renderedMessages = this.messages.length > 0 ?
      repeat(this.messages, m => m.id, message => {
        const username = this.users.find(el => el.id === message.sender).name;
        const date = new Date(message.time * 1000).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
        return html`
          <p style="overflow-wrap: break-word;"><strong class="font-semibold">${username}:</strong> ${message.message}</p>
          <p class="mb-3 text-gray-300 text-sm">${date}</p>
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
        <div class="grow overflow-y-auto" ${ref(this.messagesContainer)}>${renderedMessages}</div>
        <form-input class="mb-3" label="Send a message:" buttonLabel="Send" @submit=${this.onSend}></form-input>
      </div>
    `;
  }
}
