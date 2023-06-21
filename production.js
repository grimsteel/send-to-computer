#!/usr/bin/env node

import { createServer } from "http";
import registerUpgrade from "./websocket.js";

const server = createServer();
registerUpgrade(server);

server.listen("/run/stc/stc_socket", () => console.log("Listening on /run/stc/stc_socket"));
