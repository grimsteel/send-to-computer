import { customElement, property } from "lit/decorators.js";

import { StyledElement } from "../css";
import { Message } from "../socket";
import { html } from "lit";

@customElement("message-list")
export default class extends StyledElement {
  @property()
  title: string;
  
  @property()
  messages: Message[];

  render() {
    const renderedMessages = this.messages.length > 0 ?
                                              "" :
                                              html`
                                                <div class="flex items-center justify-center h-full">
                                                  <p class="text-2xl text-gray-500">No messages yet...</p>
                                                </div>
                                              `;
    
    return html`
      <div class="flex flex-col grow mx-3">
        <h2 class="text-2xl font-bold">${this.title}</h2>
        <div class="grow">${renderedMessages}</div>
      </div>
    `;
  }
}
