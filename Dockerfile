ARG NODE_VERSION=22.3
ARG RUST_VERSION=1.80

FROM node:${NODE_VERSION}-alpine AS build-node

WORKDIR /app

# bind mount the scripts dir, npm package files, JS build script, and scss file
# cache mount node_modules and npm cache dir
RUN --mount=type=bind,source=frontend,target=frontend \
    --mount=type=bind,source=package.json,target=package.json \
    --mount=type=bind,source=package-lock.json,target=package-lock.json \
    --mount=type=bind,source=build.js,target=build.js \
    --mount=type=bind,source=tailwind.config.js,target=tailwind.config.js \
    --mount=type=bind,source=tsconfig.json,target=tsconfig.json \
    --mount=type=bind,source=static/index.html,target=static/index.html \
    --mount=type=cache,target=/app/node_modules,uid=1000 \
    --mount=type=cache,target=/root/.npm,uid=1000 \
    <<EOF
    set -e
    npm ci
    node build.js
EOF

FROM rust:${RUST_VERSION}-alpine AS build-rs

WORKDIR /app

# bind mount the src dir and cargo package files
# cache mount the target dir and cargo registry cache
RUN --mount=type=bind,source=src,target=src \
    --mount=type=bind,source=Cargo.lock,target=Cargo.lock \
    --mount=type=bind,source=Cargo.toml,target=Cargo.toml \
    --mount=type=cache,target=/app/target \
    --mount=type=cache,target=/usr/local/cargo/registry \
    <<EOF
    set -e
    apk add --no-cache musl-dev
    cargo build --bin send-to-computer --locked --release
    cp ./target/release/send-to-computer ./server
EOF

FROM alpine AS final

WORKDIR /app

COPY static static/
COPY --from=build-node /app/static/main.js ./static/
COPY --from=build-rs /app/server ./server

EXPOSE 8080

RUN <<EOF
    set -e
    addgroup -S stc
    adduser -S stc -G stc
    apk add --no-cache runuser
EOF

COPY docker-entrypoint.sh /app/docker-entrypoint.sh
ENTRYPOINT ["/bin/sh", "/app/docker-entrypoint.sh"]
CMD ["/app/server", "0.0.0.0", "8080"]
