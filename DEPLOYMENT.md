# Claude Cockpit - Production Deployment Guide

## Overview

This guide covers deploying Claude Cockpit to production on your Intel NUC using Tailscale for secure remote access and HTTPS.

## Architecture

```
iPhone (Safari) → HTTPS + WebSocket over Tailscale → NUC (Docker Stack)
```

## Prerequisites

- Intel NUC running Ubuntu 20.04+ or similar Linux distribution
- Tailscale account (free tier works)
- Docker & Docker Compose installed
- Claude CLI installed on the NUC
- Your Claude subscription(s) configured locally

## Step 1: Tailscale Setup

### 1.1 Install Tailscale on the NUC

```bash
# Install Tailscale
curl -fsSL https://tailscale.com/install.sh | sh

# Start Tailscale daemon
sudo tailscale up
```

Follow the prompt to authenticate with your Tailscale account.

### 1.2 Verify Tailscale Network

```bash
# Check your assigned IP
tailscale ip

# Example output:
# 100.64.x.x (IPv4)
# fd7a:115c:a1e0:ab12:4843:cd0:6b84:d742 (IPv6)
```

### 1.3 Get Your Machine's Tailnet Name

```bash
# View Tailscale status
tailscale status

# Your NUC will appear as: your-nuc-name.YOUR-TAILNET.ts.net
```

## Step 2: Generate Tailscale HTTPS Certificates

```bash
# Generate self-signed cert for your Tailscale hostname
# Replace YOUR-TAILNET with your actual tailnet name
tailscale cert nuc.YOUR-TAILNET.ts.net

# This creates:
# ~/.local/share/tailscale/nuc.YOUR-TAILNET.ts.net.crt
# ~/.local/share/tailscale/nuc.YOUR-TAILNET.ts.net.key
```

### Alternative: Use `tailscale cert` directly for mounted path

```bash
# Create a directory in home for certs
mkdir -p ~/tailscale-certs

# Generate cert with custom output path
sudo tailscale cert --cert-file ~/tailscale-certs/nuc.cert --key-file ~/tailscale-certs/nuc.key nuc.YOUR-TAILNET.ts.net

# Fix permissions
sudo chown $USER:$USER ~/tailscale-certs/*
chmod 644 ~/tailscale-certs/nuc.cert
chmod 600 ~/tailscale-certs/nuc.key
```

## Step 3: Update Nginx Configuration

Edit `infra/nginx.conf` and uncomment/update the HTTPS section:

```nginx
# Production with Tailscale HTTPS
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name nuc.YOUR-TAILNET.ts.net;

    ssl_certificate /certs/nuc.YOUR-TAILNET.ts.net.crt;
    ssl_certificate_key /certs/nuc.YOUR-TAILNET.ts.net.key;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # API routes
    location /api/ {
        proxy_pass http://api;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;
        proxy_request_buffering off;
    }

    # WebSocket connections
    location /ws/ {
        proxy_pass http://api;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;
        proxy_buffering off;
        proxy_request_buffering off;
    }

    # Frontend static assets with caching
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        proxy_pass http://frontend;
        proxy_cache static_cache;
        proxy_cache_valid 200 60m;
        proxy_cache_valid 404 1m;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        add_header X-Cache-Status $upstream_cache_status;
    }

    # Everything else to frontend (SPA routing)
    location / {
        proxy_pass http://frontend;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;
    }
}

# Redirect HTTP to HTTPS
server {
    listen 80;
    listen [::]:80;
    server_name nuc.YOUR-TAILNET.ts.net;
    return 301 https://$server_name$request_uri;
}
```

## Step 4: Configure Docker Compose for Production

### 4.1 Update docker-compose.yml for Tailscale mount

Add certificate mounting to the nginx service:

```yaml
nginx:
  # ... existing config ...
  volumes:
    - ./infra/nginx.conf:/etc/nginx/nginx.conf:ro
    - ~/tailscale-certs:/certs:ro  # Add this line
    - nginx_cache:/var/cache/nginx
  environment:
    # Set Tailscale hostname for your environment
    TAILNET_DOMAIN: nuc.YOUR-TAILNET.ts.net
```

### 4.2 Update ports for production

For production deployment, you likely want to disable port forwarding and use Tailscale directly:

```yaml
nginx:
  # ... existing config ...
  ports:
    # Remove these for production (no port forwarding needed)
    # - "8080:80"
    # - "8443:443"
    # Keep for development/debugging if needed
    - "127.0.0.1:8080:80"
    - "127.0.0.1:8443:443"
```

## Step 5: Configure Frontend API URL for Production

Create `.env.production`:

```env
# Production configuration
VITE_API_URL=https://nuc.YOUR-TAILNET.ts.net
```

Build the frontend with production environment:

```bash
cd frontend
npm run build -- --mode production
```

## Step 6: Launch Production Stack

```bash
# Navigate to cockpit root directory
cd /path/to/cockpit

# Set environment variables
export DB_PASSWORD="your-secure-postgres-password"
export REPOS_PATH="$HOME/repos"  # Adjust to your repos location

# Pull latest images and start services
docker-compose pull
docker-compose up -d

# Verify all services are healthy
docker-compose ps

# Check health endpoints
curl http://localhost:8000/api/health
curl https://nuc.YOUR-TAILNET.ts.net/api/health  # From Tailscale network
```

## Step 7: Configure Frontend for Tailscale

Update API URL in the frontend before building for production:

### Environment Variable (Recommended)

```bash
# In your shell when building frontend
export VITE_API_URL="https://nuc.YOUR-TAILNET.ts.net"
npm run build
```

### Or Update app configuration

The API client in `frontend/src/lib/api.ts` will use `VITE_API_URL` if set, otherwise defaults to empty string (same origin).

## Step 8: Install on iPhone Home Screen

### On iPhone (via Safari):

1. Open Safari
2. Navigate to: `https://nuc.YOUR-TAILNET.ts.net`
3. Tap the Share button (⬆️)
4. Scroll down and select "Add to Home Screen"
5. Enter name (e.g., "Claude Cockpit")
6. Tap "Add"

The app will now appear on your home screen and open in full-screen mode when tapped (no browser chrome).

## Step 9: Verify and Test

### Connectivity Check

```bash
# On your iPhone, on the Tailscale network:
# Open Safari and visit: https://nuc.YOUR-TAILNET.ts.net

# You should see:
# - The Claude Cockpit PWA interface
# - No SSL certificate warnings (browser trusts Tailscale certs)
# - Real-time WebSocket streaming when you interact
```

### Mobile Testing Checklist

- [ ] App loads without errors
- [ ] All tabs work (Sessions, Chat, Accounts, Settings)
- [ ] Can create new sessions
- [ ] WebSocket messages stream in real-time
- [ ] Can send messages to Claude
- [ ] Quick commands work
- [ ] Account authentication modal works
- [ ] Notifications trigger on task completion
- [ ] App works offline (cached content)
- [ ] Home screen icon displays correctly

## Troubleshooting

### Issue: SSL Certificate Error in Safari

**Cause:** Tailscale certs might not be properly mounted or generated.

**Solution:**
```bash
# Verify certs exist and are readable
ls -la ~/tailscale-certs/

# Check Nginx logs
docker-compose logs nginx | grep -i ssl

# Regenerate certs if needed
tailscale cert nuc.YOUR-TAILNET.ts.net
```

### Issue: CORS Errors in Console

**Cause:** API URL mismatch between frontend and backend.

**Solution:**
```bash
# Verify the API URL in browser console:
# Open DevTools (F12) → Console → Type: window.location.href
# Should match your Tailscale domain

# Check environment variable was set correctly:
grep VITE_API_URL frontend/.env.production
```

### Issue: WebSocket Connection Fails

**Cause:** Nginx WebSocket proxy configuration.

**Solution:**
```bash
# Verify nginx.conf has proper WebSocket headers
grep -A 5 "location /ws/" infra/nginx.conf

# Check Nginx logs
docker-compose logs nginx | grep -i websocket
```

### Issue: Database Connection Error

**Cause:** PostgreSQL not ready or wrong credentials.

**Solution:**
```bash
# Check PostgreSQL health
docker-compose exec postgres pg_isready -U cockpit

# Verify credentials in docker-compose.yml
grep POSTGRES_PASSWORD docker-compose.yml

# Check password matches DATABASE_URL env var in api service
```

## Monitoring and Maintenance

### Health Checks

```bash
# Check all services are running
docker-compose ps

# View logs for specific service
docker-compose logs api
docker-compose logs nginx
docker-compose logs postgres

# Follow logs in real-time
docker-compose logs -f
```

### Database Backups

```bash
# Backup PostgreSQL data
docker-compose exec postgres pg_dump -U cockpit cockpit > cockpit-backup.sql

# Restore from backup
docker-compose exec postgres psql -U cockpit cockpit < cockpit-backup.sql
```

### Update Tailscale Certificates (Annual)

Tailscale certs expire after 1 year. Regenerate annually:

```bash
# Regenerate certificate
tailscale cert nuc.YOUR-TAILNET.ts.net

# Copy to mounted volume
cp ~/.local/share/tailscale/nuc.YOUR-TAILNET.ts.net.* ~/tailscale-certs/

# Restart Nginx to pick up new certs
docker-compose restart nginx
```

## Performance Tuning

### Nginx Caching Configuration

The default nginx.conf includes:
- **Static asset caching:** 60 minutes for .js, .css, images
- **Gzip compression:** Enabled for text/json/javascript
- **Connection pooling:** 32 keepalive connections per upstream

Adjust cache times in `infra/nginx.conf`:
```nginx
proxy_cache_valid 200 60m;  # Change 60m to desired duration
```

### PostgreSQL Performance

For production workloads, consider:
```yaml
postgres:
  environment:
    # ... existing ...
    POSTGRES_INITDB_ARGS: "-c shared_buffers=256MB -c effective_cache_size=1GB"
```

### FastAPI Worker Tuning

Adjust Uvicorn workers in `backend/main.py`:
```python
# For NUC with limited CPU cores, keep workers low (1-2)
# For more powerful hardware, increase workers
```

## Security Considerations

1. **Tailscale ACLs:** Configure in Tailscale Admin Console to restrict access
   ```
   Access Controls → ACLs → Restrict to specific users/groups
   ```

2. **Database Credentials:** Use strong password, don't commit to git
   ```bash
   export DB_PASSWORD="$(openssl rand -base64 32)"
   ```

3. **Regular Updates:** Keep Tailscale, Docker, and services updated
   ```bash
   sudo tailscale update
   docker pull postgres:16-alpine
   docker-compose pull && docker-compose up -d
   ```

4. **Firewall:** Use Tailscale's firewall rules for additional protection

## Scaling Notes

- **Multiple Sessions:** Current setup handles 10-20 concurrent sessions
- **Database:** PostgreSQL on NUC is suitable for personal/team use
- **Storage:** Monitor `/var/lib/postgresql/data` storage usage

## Next Steps

After successful deployment:

1. Test all features on your iPhone
2. Configure Tailscale ACLs for security
3. Set up monitoring/alerting if needed
4. Document your Tailscale device name and tailnet
5. Keep backup of PostgreSQL data regularly

---

## Support & Troubleshooting

For issues:

1. Check `docker-compose logs` for errors
2. Verify Tailscale connectivity: `tailscale status`
3. Test API directly: `curl -v https://nuc.YOUR-TAILNET.ts.net/api/health`
4. Review nginx configuration in `infra/nginx.conf`
5. Consult GitHub issues or Tailscale documentation

Good luck deploying Claude Cockpit! 🚀
