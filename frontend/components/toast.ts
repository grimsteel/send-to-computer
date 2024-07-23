import { html } from "lit";
import { StyledElement } from "../css";

import { customElement, property, state } from "lit/decorators.js";
import { choose } from "lit/directives/choose.js";
import { classMap } from "lit/directives/class-map.js";

const toastContainer = document.getElementById("toast-container")!;

export type ToastType = "success" | "error" | "warning";

@customElement("styled-toast")
export class Toast extends StyledElement {
  @property()
  text: string;

  @property()
  type: ToastType;

  @state()
  private isClosing = false;

  constructor(text: string, type: ToastType = "success") {
    super()
    
    this.text = text;
    this.type = type;
  }

  closeAndDestroy() {
    if (this.isClosing) return;

    this.isClosing = true;
    setTimeout(() => {
      this.remove();
    }, 150);
  }

  render() {
    // the icon that displays at the left of the toast
    const icon = choose(this.type, [
      [
        "success",
        () => html`<svg class="w-5 h-5" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 20 20">
          <path d="M10 .5a9.5 9.5 0 1 0 9.5 9.5A9.51 9.51 0 0 0 10 .5Zm3.707 8.207-4 4a1 1 0 0 1-1.414 0l-2-2a1 1 0 0 1 1.414-1.414L9 10.586l3.293-3.293a1 1 0 0 1 1.414 1.414Z"/>
        </svg>`
      ],
      [
        "warning",
        () => html`<svg class="w-5 h-5" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 20 20">
          <path d="M10 .5a9.5 9.5 0 1 0 9.5 9.5A9.51 9.51 0 0 0 10 .5ZM10 15a1 1 0 1 1 0-2 1 1 0 0 1 0 2Zm1-4a1 1 0 0 1-2 0V6a1 1 0 0 1 2 0v5Z"/>
        </svg>`
      ],
      [
        "error",
        () => html` <svg class="w-5 h-5" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 20 20">
          <path d="M10 .5a9.5 9.5 0 1 0 9.5 9.5A9.51 9.51 0 0 0 10 .5Zm3.707 11.793a1 1 0 1 1-1.414 1.414L10 11.414l-2.293 2.293a1 1 0 0 1-1.414-1.414L8.586 10 6.293 7.707a1 1 0 0 1 1.414-1.414L10 8.586l2.293-2.293a1 1 0 0 1 1.414 1.414L11.414 10l2.293 2.293Z"/>
        </svg>`
      ]
    ]);

    // change the color of the icon
    const iconClass = choose(this.type, [
      ["success", () => "bg-green-800 text-green-200"],
      ["warning", () => "bg-orange-700 text-orange-200"],
      ["error", () => "bg-red-800 text-red-200"]
    ]);
    
    return html`
      <div class="flex items-center w-full max-w-xs p-4 mb-4 rounded-lg shadow text-gray-400 bg-gray-800 transition-opacity ${classMap({ "opacity-100": !this.isClosing, "opacity-0": this.isClosing })}" role="alert">
        <div class="inline-flex items-center justify-center flex-shrink-0 w-8 h-8 rounded-lg ${iconClass}" >
          ${icon}
        </div>
        <div class= "ms-3 text-sm font-normal">${this.text}</div>
        <button type="button" class="ms-auto -mx-1.5 -my-1.5 rounded-lg focus:ring-2 p-1.5 inline-flex items-center justify-center h-8 w-8 text-gray-500 hover:text-white bg-gray-800 hover:bg-gray-700" @click=${this.closeAndDestroy}>
          <svg class="w-3 h-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 14 14">
            <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m1 1 6 6m0 0 6 6M7 7l6-6M7 7l-6 6" />
          </svg>
        </button>
      </div>
    `;
  }

}

export function showToast(text: string, type: ToastType = "success", duration = 5000) {
  const toast = new Toast(text, type);
  toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.closeAndDestroy();
  }, duration);
}
