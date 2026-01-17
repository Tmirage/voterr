# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies for native modules (better-sqlite3)
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package*.json ./
COPY client/package*.json ./client/

# Install server dependencies (production only)
RUN npm ci --omit=dev

# Install client dependencies (includes devDeps for build)
RUN cd client && npm ci

# Copy source code
COPY . .

# Build frontend
RUN cd client && npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Install runtime dependencies for native modules
RUN apk add --no-cache wget tini libstdc++

# Create non-root user
RUN addgroup -g 1001 voterr && \
    adduser -u 1001 -G voterr -s /bin/sh -D voterr

# Copy built application
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/client/dist ./client/dist
COPY --from=builder /app/server ./server
COPY --from=builder /app/package.json ./

# Create data directory
RUN mkdir -p /app/data && chown -R voterr:voterr /app

USER voterr

EXPOSE 5056

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server/index.js"]
