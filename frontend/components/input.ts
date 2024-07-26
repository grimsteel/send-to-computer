import { html } from "lit";
import { StyledElement } from "../css";
import { customElement, property, state } from "lit/decorators.js";

@customElement("form-input")
export default class FormInput extends StyledElement {
  @state()
  private value: string = "";

  @property()
  label: string;
  @property()
  buttonLabel: string;

  private inputId: string;

  constructor() {
    super();
    this.inputId = `_${crypto.randomUUID()}`;
  }

  changeHandler(e: InputEvent) {
    const value = (e.target as HTMLInputElement).value;
    this.value = value;
  }

  onSubmit(e: SubmitEvent) {
    e.preventDefault();
    this.dispatchEvent(new CustomEvent("submit", { composed: true, detail: { value: this.value } }));
    this.value = "";
  }
  
  render() {
    return html`
      <form class="flex items-end gap-3" @submit=${this.onSubmit}>
        <div class="grow">
          <label for="${this.inputId}" class="block mb-2 text-sm font-semibold text-gray-900 text-white">
            ${this.label}
          </label>
          <input
                type="text" id=${this.inputId} .value=${this.value}
                class="border text-sm rounded-lg block w-full p-2.5 bg-gray-700 border-gray-600 text-white focus:ring-orange-500 focus:border-orange-500"
                required="required" @change=${this.changeHandler}
          >
        </div>
        <button type="submit" class="text-white bg-orange-600 hover:bg-orange-700 focus:ring-4 focus:ring-orange-800 font-medium rounded-lg text-sm px-5 py-2.5 focus:outline-none">
          ${this.buttonLabel}
        </button>
      </form>
      
    `;
  }
}
