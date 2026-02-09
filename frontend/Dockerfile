# Frontend Dockerfile - Multi-stage build
# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build the React app
RUN npm run build

# Stage 2: Serve
FROM node:20-alpine

WORKDIR /app

# Install a simple HTTP server
RUN npm install -g http-server

# Copy built files from builder
COPY --from=builder /app/dist ./dist

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=10s --timeout=5s --start-period=5s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://localhost:3000/ || exit 1

# Serve static files - SPA fallback to /index.html
CMD ["http-server", "dist", "-p", "3000", "-g"]
