import { LitElement, adoptStyles, css, html, unsafeCSS } from "lit";
import { customElement, property } from "lit/decorators.js";
import styles from "css";

const stylesheet = unsafeCSS(styles);

@customElement("stc-app")
export class StcApp extends LitElement {
  render() {
    return html`
        <h1 class="bg-gray-700 text-gray-100 p-3 border-b-2 border-gray-500">Send to Computer</h1>
        <div class="bg-gray-900 p-3 grow"></div>
    `;
  }
  override connectedCallback() {
    super.connectedCallback();

    adoptStyles(this.renderRoot as ShadowRoot, [stylesheet]);
  }
}

