#!/bin/sh
# Volume mounts arrive root-owned. The app writes its SQLite file at import time,
# so an unwritable /data is a boot crash rather than a clear error. Fix ownership
# once on the mounted directory, then drop privileges for the server itself.
set -e

DATA_DIR="${DB_PATH_DIR:-/data}"
RUN_AS="${RUN_AS_USER:-node}"

if [ "$(id -u)" = "0" ]; then
  if [ ! -d "$DATA_DIR" ]; then
    mkdir -p "$DATA_DIR"
  fi

  target_uid="$(id -u "$RUN_AS")"
  current_uid="$(stat -c %u "$DATA_DIR")"

  if [ "$current_uid" != "$target_uid" ]; then
    echo "entrypoint: taking ownership of $DATA_DIR for $RUN_AS" >&2
    chown -R "$RUN_AS:$RUN_AS" "$DATA_DIR"
  fi

  exec gosu "$RUN_AS" "$@"
fi

exec "$@"
