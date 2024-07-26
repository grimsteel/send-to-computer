import { customElement, state } from "lit/decorators.js";
import { StyledElement } from "../css";
import { html } from "lit";

@customElement("create-group-modal")
export default class CreateGroupModal extends StyledElement {
  @state()
  private groupName: string;
  @state()
  private groupMembers: Set<string>;
  
  @state()
  private open = false;

  show(name?: string, members?: Set<string>) {
    this.groupName = name ?? "";
    this.groupMembers = members ?? new Set();
    this.open = true;
  }

  render() {
    return html`
      <div ?hidden=${!this.open} class="fixed inset-0 w-screen h-screen bg-gray-900/25 backdrop-blur z-40"></div>
      <div ?hidden=${!this.open} tabindex="-1" class="overflow-y-auto overflow-x-hidden fixed z-50 justify-center items-center w-screen inset-0 h-screen flex">
        <div class="relative p-4 w-full max-w-md max-h-full">
          <div class="relative rounded-xl shadow bg-gray-800 border border-gray-700">
            <div class="flex items-center justify-between px-3 py-1 border-b rounded-t border-gray-600 bg-gray-700">
              <h3 class="text-lg font-semibold text-white">Create Group</h3>
              <!-- close button -->
              <button type="button" class="text-gray-400 bg-transparent rounded-lg text-sm w-8 h-8 ms-auto inline-flex justify-center items-center hover:bg-gray-600 hover:text-white">
                <svg class="w-3 h-3" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 14 14">
                  <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m1 1 6 6m0 0 6 6M7 7l6-6M7 7l-6 6"/>
                </svg>
                <span class="sr-only">Close modal</span>
              </button>
            </div>
            <!-- Modal body -->
            <form class="p-3">
              <div class="mb-3">
                <label for="input-name" class="block mb-2 text-sm font-semibold text-gray-900 text-white">Group Name</label>
                <input
                  type="text" id="input-name" .value=${this.groupName}
                  class="border text-sm rounded-lg block w-full p-2.5 bg-gray-700 border-gray-600 text-white focus:ring-orange-500 focus:border-orange-500" required="required">
              </div>
              <button type="submit" class="text-white bg-orange-600 hover:bg-orange-700 focus:ring-4 focus:ring-orange-800 font-medium rounded-lg text-sm px-5 py-2.5 focus:outline-none">
                Create Group
              </button>
            </form>
          </div>
        </div>
      </div> 
    `;
    }
}
