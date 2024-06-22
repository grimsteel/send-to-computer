ARG NODE_VERSION=22.3

FROM node:${NODE_VERSION}-alpine AS build-node

USER node
WORKDIR /app

# bind mount the scripts dir, npm package files, JS build script, and scss file
# cache mount node_modules and npm cache dir
RUN --mount=type=bind,source=src,target=src \
    --mount=type=bind,source=package.json,target=package.json \
    --mount=type=bind,source=package-lock.json,target=package-lock.json \
    --mount=type=cache,target=/app/node_modules,uid=1000 \
    --mount=type=cache,target=/home/node/.npm,uid=1000 \
    <<EOF
set -e
npm ci
npm run build-server
EOF

ENV RUNTIME_DIRECTORY="/sock"

CMD ["node", "/app/server.cjs"]
