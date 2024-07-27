# Send to Computer

Lightweight messaging application

Basically just a <5MB chat app

## Usage

`$ send-to-computer [bind-addr]`

Where `bind-addr` is either a TCP port (on localhost), TCP host (random port will be chosen), TCP host:port, or a UDS path, prefixed with `uds:`. If not provided, a random port will be chosen on localhost.

**Environment variables:**

`STC_STORE_PATH`: the path on the filesystem of the persistent message/user store. If not provided, an in-memory store will be used

`STC_ALLOWED_ORIGINS`: allowed origins for the websocket connection (separated by commas), as CORS does not apply to websockets

## Container

The [container image](https://github.com/grimsteel/send-to-computer/pkgs/container/send-to-computer/?tag=latest) is 12MB

Example Docker Compose usage:
```yml
  stc:
    restart: unless-stopped
    image: ghcr.io/grimsteel/send-to-computer
    ports: 8080:8080
    volumes:
      - /opt/send-to-computer/data:/data
    environment:
      - STC_STORE_PATH=/data/store
      - STC_ALLOWED_ORIGINS=https://send-to-computer.i.kameswar.com
```

When the container starts, the folder containing `STC_STORE_PATH` (in this case, `/data/` in the container and `/opt/send-to-computer/data/` on the host) will be `chown`'d to the `stc` user in the container (UID 100/GID 101 for some reason). The server will the be run as the stc user.
