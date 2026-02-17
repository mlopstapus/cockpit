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

# Build arg for API URL
ARG VITE_API_URL=http://localhost:8001

# Build the React app with API_URL
RUN VITE_API_URL=$VITE_API_URL npm run build

# Stage 2: Serve
FROM node:20-alpine

WORKDIR /app

# Install a simple HTTP server
RUN npm install -g http-server

# Copy built files from builder
COPY --from=builder /app/dist ./dist

# Expose port
EXPOSE 3000

# Health check - use node's built-in fetch (available in Node 20+)
# BusyBox wget on Alpine doesn't support --tries flag
HEALTHCHECK --interval=10s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "fetch('http://localhost:3000/').then(r=>{if(!r.ok)throw r;process.exit(0)}).catch(()=>process.exit(1))"

# Serve static files - SPA fallback to /index.html
CMD ["http-server", "dist", "-p", "3000", "-g"]
