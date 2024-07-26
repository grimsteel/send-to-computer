import { html } from "lit";
import { live } from "lit/directives/live.js";
import { customElement, property, state } from "lit/decorators.js";

import { StyledElement } from "../css";

@customElement("tag-list")
export default class extends StyledElement {
  @property()
  tags: string[];
  @property()
  canEdit: boolean;
  
  @state()
  private editing = false;

  private onBlur(e: FocusEvent) {
    const value = (e.target as HTMLInputElement).value;
    const tags = [...new Set(value.split(" ").map(el => el.trim()).filter(el => el))];
    this.dispatchEvent(new CustomEvent("tags-changed", { detail: { tags } }));
  }

  render() {
    return html`
      <input class="text-orange-400 bg-transparent border-0 p-0 placeholder-orange-100/50 hover:placeholder-orange-500/75 hover:text-orange-500 transition-colors cursor-pointer focus:outline-0 focus:border-0 focus:ring-0 focus:underline w-full leading-none" ?readonly=${this.editing} type="text" .value=${live(this.tags.join(" "))} placeholder="no tags" @blur=${this.onBlur} ?disabled=${!this.canEdit} />
    `;
    
  }
}
