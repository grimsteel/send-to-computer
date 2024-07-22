import { html } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { classMap } from "lit/directives/class-map.js";
import "./components/input";

import { stylesheet, StyledElement } from "./css";

document.adoptedStyleSheets.push(stylesheet.styleSheet);

@customElement("stc-app")
export class StcApp extends StyledElement {
  @state()
  private loggedIn = false;

  @state()
  private username: string | null = null;

  loginSubmit(e: SubmitEvent) {
    e.preventDefault();

    this.loggedIn = true;
  }
  
  render() {
    const contents = this.loggedIn ?
                     html`` :
                     html`
                       <h2 class="text-lg mb-2">Please log in:</h2>
                       <form class="flex items-end gap-3" @submit="{this.loginSubmit}">
                         <form-input
                              label="Username" value=${this.username ?? ""} required class="grow">
                         </form-input>
                         <button type="submit" class="text-white bg-orange-600 hover:bg-orange-700 focus:ring-4 focus:ring-orange-800 font-medium rounded-lg text-sm px-5 py-2.5 focus:outline-none">
                           Log in
                         </button>
                       </form>
                     `;
    
    const greeting = this.loggedIn ? html`<span>Hello, ${this.username}</span>` : "";
    
    return html`
      <h1 class="bg-gray-700 text-gray-100 p-3 border-b-2 border-gray-500 text-xl flex justify-between items-center">
        Send to Computer
        ${greeting}
    </h1>
    <div class="${classMap({ "flex": this.loggedIn, "flex-col": this.loggedIn })} bg-gray-900 p-3 grow text-white">
      ${contents}
    </div>
  `;
}
}

