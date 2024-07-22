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
  
  render() {
    const contents = this.loggedIn ?
                     html`` :
                     html`
                       <h2 class="text-lg mb-2">Please log in:</h2>
                       <form-input label="Username" value="" required></form-input>
                     `;
    
    return html`
      <h1 class="bg-gray-700 text-gray-100 p-3 border-b-2 border-gray-500 text-xl">Send to Computer</h1>
      <div class="${classMap({ "flex": this.loggedIn, "flex-col": this.loggedIn  })} bg-gray-900 p-3 grow text-white">
        ${contents}
      </div>
    `;
  }
}

