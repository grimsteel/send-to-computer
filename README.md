# Send to Computer

Lightweight messaging application

Basically just a <5MB chat app

## Usage

`$ send-to-computer [bind-addr]`

Where `bind-addr` is either a TCP port (on localhost), TCP host (random port will be chosen), TCP host:port, or a UDS path, prefixed with `uds:`. If not provided, a random port will be chosen on localhost.

**Environment variables:**

`STC_STORE_PATH`: the path on the filesystem of the persistent message/user store. If not provided, an in-memory store will be used

`STC_ALLOWED_ORIGINS`: allowed origins for the websocket connection (separated by commas), as CORS does not apply to websockets
