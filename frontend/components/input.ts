import { html } from "lit";
import { StyledElement } from "../css";
import { customElement, property } from "lit/decorators.js";

@customElement("form-input")
export default class FormInput extends StyledElement {
  @property()
  value: string;

  @property()
  label: string;

  @property()
  type: string = "text";

  @property()
  required: boolean = false;

  private inputId: string;

  constructor() {
    super();
    this.inputId = `_${crypto.randomUUID()}`;
  }

  render() {
    return html`
      <div class="mb-6">
        <label for="${this.inputId}" class="block mb-2 text-sm font-medium text-gray-900 dark:text-white">
          ${this.label}
        </label>
        <input
              type=${this.type} id=${this.inputId} .value=${this.value}
              class="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500"
              ?required=${this.required}
        >
      </div>
    `;
  }
}
