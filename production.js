import { createServer } from "http";
import { unlinkSync } from "fs";
import registerUpgrade from "./websocket.js";

const server = createServer();
registerUpgrade(server);

try {
  unlinkSync("/var/run/stc_socket");
} catch {}

server.listen("/var/run/stc_socket", () => console.log("Listening on /var/run/stc_socket"));
