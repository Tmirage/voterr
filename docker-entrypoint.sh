#!/bin/sh
set -e

PUID=${PUID:-1000}
PGID=${PGID:-1000}

# Check if gid is already in use by another group
EXISTING_GROUP=$(getent group "$PGID" | cut -d: -f1 2>/dev/null || echo "")

if [ -n "$EXISTING_GROUP" ] && [ "$EXISTING_GROUP" != "voterr" ]; then
    # Use existing group (e.g., 'node' group from base image)
    TARGET_GROUP="$EXISTING_GROUP"
else
    # Create voterr group if it doesn't exist
    if ! getent group voterr > /dev/null 2>&1; then
        addgroup -g "$PGID" voterr 2>/dev/null || addgroup voterr
    fi
    TARGET_GROUP="voterr"
fi

# Check if uid is already in use by another user
EXISTING_USER=$(getent passwd "$PUID" | cut -d: -f1 2>/dev/null || echo "")

if [ -n "$EXISTING_USER" ] && [ "$EXISTING_USER" != "voterr" ]; then
    # Use existing user (e.g., 'node' user from base image)
    TARGET_USER="$EXISTING_USER"
else
    # Create voterr user if it doesn't exist
    if ! getent passwd voterr > /dev/null 2>&1; then
        adduser -u "$PUID" -G "$TARGET_GROUP" -s /bin/sh -D voterr 2>/dev/null || adduser -G "$TARGET_GROUP" -s /bin/sh -D voterr
    fi
    TARGET_USER="voterr"
fi

# Ensure data directory exists and has correct ownership
mkdir -p /app/data
chown -R "$TARGET_USER:$TARGET_GROUP" /app/data

echo "Starting Voterr with PUID=$PUID PGID=$PGID (user=$TARGET_USER group=$TARGET_GROUP)"

# Run as target user
exec su-exec "$TARGET_USER" "$@"
