import styles from "css";
import { adoptStyles, LitElement, unsafeCSS } from "lit";

export class StyledElement extends LitElement {
  override connectedCallback() {
    super.connectedCallback();

    adoptStyles(this.shadowRoot, [stylesheet]);
  }
}

export const stylesheet = unsafeCSS(styles);
