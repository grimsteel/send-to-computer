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

  changeHandler(e: InputEvent) {
    const value = (e.target as HTMLInputElement).value;
    this.dispatchEvent(new CustomEvent("value-change", { composed: true, detail: { value } }));
  }

  render() {
    return html`
      <label for="${this.inputId}" class="block mb-2 text-sm font-medium text-gray-900 dark:text-white">
        ${this.label}
      </label>
      <input
            type=${this.type} id=${this.inputId} .value=${this.value}
            class="border text-sm rounded-lg block w-full p-2.5 bg-gray-700 border-gray-600 text-white focus:ring-orange-500 focus:border-orange-500"
            ?required=${this.required} @change=${this.changeHandler}
      >
    `;
  }
}
