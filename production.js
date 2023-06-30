#!/usr/bin/env node

import { createServer } from "http";
import { chmodSync } from "fs";
import registerUpgrade from "./websocket.js";
import process from "process";

// Production script. This is automatically run with the correct user (lemon) and group (www-data) by systemctl (stc.service)
// This only handles the websocket. Static files are served by nginx. This communicates with nginx via the stc_socket. 

const server = createServer();
registerUpgrade(server);

const socketPath = `${process.env.RUNTIME_DIRECTORY}/stc_socket`;

server.listen(socketPath, () => {
  chmodSync(socketPath, 0o770);
  console.log(`Listening on ${socketPath}`);
});
