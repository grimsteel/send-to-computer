#!/bin/sh

if [[ -n "$STC_STORE_PATH" ]]; then
    chown -R stc:stc $(dirname "$STC_STORE_PATH")
fi

exec runuser -g stc -u stc "$@"
