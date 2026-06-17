#!/usr/bin/env bash
set -euo pipefail

SRC_DIR="${1:-/workspace/.syncthing-identity}"
DEST_DIR="${2:-/root/.config/syncthing-xcp}"

required_files=(cert.pem key.pem config.xml)
optional_files=(https-cert.pem https-key.pem)

for file in "${required_files[@]}"; do
  if [ ! -f "$SRC_DIR/$file" ]; then
    printf 'Missing required file: %s\n' "$SRC_DIR/$file" >&2
    exit 1
  fi
done

mkdir -p "$DEST_DIR"

for file in "${required_files[@]}" "${optional_files[@]}"; do
  if [ -f "$SRC_DIR/$file" ]; then
    cp "$SRC_DIR/$file" "$DEST_DIR/$file"
  fi
done

chmod 600 "$DEST_DIR"/cert.pem "$DEST_DIR"/key.pem "$DEST_DIR"/config.xml

if [ -f "$DEST_DIR/https-cert.pem" ]; then
  chmod 600 "$DEST_DIR/https-cert.pem"
fi

if [ -f "$DEST_DIR/https-key.pem" ]; then
  chmod 600 "$DEST_DIR/https-key.pem"
fi

printf 'Restored Syncthing identity into %s\n' "$DEST_DIR"
printf 'Restart Syncthing after restore so the original device ID is reused.\n'
