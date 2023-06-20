#!/usr/bin/env node

import koa from "koa";
import registerUpgrade from "./websocket.js";
import serve from "koa-static";

const app = new koa();


app.use(serve("static"));

app.use((_req, res, _next) => {
  res.status(404).send("The page you are looking for does not exist");
});

const server = app.listen(8888, () => console.log("Listenining on port 8888!"));
registerUpgrade(server);
