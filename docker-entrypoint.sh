#!/bin/sh
set -e

PUID=${PUID:-1000}
PGID=${PGID:-1000}

# Create group if it doesn't exist
if ! getent group voterr > /dev/null 2>&1; then
    addgroup -g "$PGID" voterr
fi

# Create user if it doesn't exist
if ! getent passwd voterr > /dev/null 2>&1; then
    adduser -u "$PUID" -G voterr -s /bin/sh -D voterr
fi

# Modify existing user/group if PUID/PGID differ
CURRENT_UID=$(id -u voterr 2>/dev/null || echo "")
CURRENT_GID=$(getent group voterr | cut -d: -f3 2>/dev/null || echo "")

if [ -n "$CURRENT_GID" ] && [ "$CURRENT_GID" != "$PGID" ]; then
    delgroup voterr 2>/dev/null || true
    addgroup -g "$PGID" voterr
fi

if [ -n "$CURRENT_UID" ] && [ "$CURRENT_UID" != "$PUID" ]; then
    deluser voterr 2>/dev/null || true
    adduser -u "$PUID" -G voterr -s /bin/sh -D voterr
fi

# Ensure data directory exists and has correct ownership
mkdir -p /app/data
chown -R voterr:voterr /app/data

echo "Starting Voterr with PUID=$PUID PGID=$PGID"

# Run as voterr user
exec su-exec voterr "$@"
