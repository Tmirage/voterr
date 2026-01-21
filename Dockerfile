# Build stage - compiles native modules and frontend
FROM node:22-alpine AS builder

WORKDIR /app

# Install build dependencies for native modules (better-sqlite3)
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package*.json ./
COPY client/package*.json ./client/

# Install dependencies
RUN npm ci
RUN cd client && npm ci

# Copy source code
COPY . .

# Build frontend
RUN cd client && npm run build

# Production stage - minimal runtime image
FROM node:22-alpine

WORKDIR /app

# Install minimal runtime dependencies and clean up in one layer
RUN apk upgrade --no-cache && \
    apk add --no-cache tini libstdc++ su-exec && \
    rm -rf /var/cache/apk/*

# Copy package files and install production deps
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts && \
    rm -rf node_modules/better-sqlite3 ~/.npm

# Copy prebuilt better-sqlite3 from builder (includes native binary)
COPY --from=builder /app/node_modules/better-sqlite3 ./node_modules/better-sqlite3

# Copy built frontend and server code
COPY --from=builder /app/client/dist ./client/dist
COPY --from=builder /app/server ./server

# Copy entrypoint script and setup
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh && mkdir -p /app/data

# Cleanup npm (not needed at runtime)
RUN rm -rf /usr/local/lib/node_modules/npm

ENV NODE_ENV=production
ENV PUID=1000
ENV PGID=1000

EXPOSE 5056

ENTRYPOINT ["/sbin/tini", "--", "/docker-entrypoint.sh"]
CMD ["node", "server/index.js"]
