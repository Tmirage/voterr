# Build stage - only for compiling, nothing from here goes to production
FROM node:22-alpine AS builder

WORKDIR /app

# Install build dependencies for native modules (better-sqlite3)
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package*.json ./
COPY client/package*.json ./client/

# Install ALL dependencies for building (regenerate lock for platform)
RUN npm ci
RUN cd client && rm -f package-lock.json && npm install

# Copy source code
COPY . .

# Build frontend
RUN cd client && npm run build

# Production stage - clean image with only runtime dependencies
FROM node:22-alpine

WORKDIR /app

# Update Alpine packages to fix CVEs and install minimal runtime dependencies
RUN apk upgrade --no-cache && \
    apk add --no-cache tini libstdc++ su-exec

# Copy only package files first
COPY package*.json ./

# Install production dependencies and remove prebuild-install (only needed for native module builds)
RUN npm ci --omit=dev && \
    rm -rf node_modules/prebuild-install node_modules/tar-fs node_modules/tar-stream \
           node_modules/node-abi node_modules/napi-build-utils node_modules/detect-libc \
           node_modules/expand-template node_modules/github-from-package node_modules/mkdirp-classic \
           node_modules/simple-get node_modules/simple-concat node_modules/decompress-response \
           node_modules/mimic-response node_modules/tunnel-agent && \
    npm cache clean --force

# Copy built frontend from builder
COPY --from=builder /app/client/dist ./client/dist

# Copy server code
COPY --from=builder /app/server ./server

# Copy entrypoint script
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Create data directory
RUN mkdir -p /app/data

ENV NODE_ENV=production
ENV PUID=1000
ENV PGID=1000

EXPOSE 5056

ENTRYPOINT ["/sbin/tini", "--", "/docker-entrypoint.sh"]
CMD ["node", "server/index.js"]
