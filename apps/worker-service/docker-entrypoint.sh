#!/bin/sh
set -eu

DATA_ROOT="${WORKER_SERVICE_DATA_ROOT:-/data}"
mkdir -p "${DATA_ROOT}"
chown -R node:node "${DATA_ROOT}"

cd /app
exec runuser -u node -- "$@"
