#!/bin/bash
# Claude Cockpit — Docker Compose Setup Script
# Run this on your Intel NUC

set -e

echo "🚀 Claude Cockpit Setup (Docker Compose)"
echo "=========================================="

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# 1. Check prerequisites
echo -e "\n${YELLOW}Checking prerequisites...${NC}"

command -v docker >/dev/null 2>&1 || { echo "❌ Docker required. Install: curl -fsSL https://get.docker.com/ | sh && sudo usermod -aG docker \$USER"; exit 1; }
command -v docker-compose >/dev/null 2>&1 || { echo "❌ Docker Compose required. Install: sudo apt install docker-compose"; exit 1; }
command -v claude >/dev/null 2>&1 || { echo "❌ Claude Code CLI required. Install: npm install -g @anthropic-ai/claude-code"; exit 1; }

echo -e "${GREEN}✅ All prerequisites found${NC}"

# 2. Set up project directory
PROJECT_DIR="${1:-.}"
echo -e "\n${YELLOW}Setting up project in ${PROJECT_DIR}...${NC}"

if [ ! -f "$PROJECT_DIR/docker-compose.yml" ]; then
    echo "❌ docker-compose.yml not found in $PROJECT_DIR"
    exit 1
fi

# 3. Create Claude profiles directory
echo -e "\n${YELLOW}Setting up Claude profiles...${NC}"
mkdir -p "$HOME/.claude-profiles/primary"
mkdir -p "$HOME/.claude-profiles/secondary"
echo -e "${GREEN}✅ Profile directories created${NC}"
echo ""
echo "⚠️  You need to log in to each profile:"
echo "   CLAUDE_CONFIG_DIR=~/.claude-profiles/primary claude login"
echo "   CLAUDE_CONFIG_DIR=~/.claude-profiles/secondary claude login"

# 4. Set up environment file
echo -e "\n${YELLOW}Creating .env file...${NC}"
if [ ! -f "$PROJECT_DIR/.env" ]; then
    cat > "$PROJECT_DIR/.env" << 'EOF'
# Database
DB_PASSWORD=cockpit-dev-password

# Debug mode
DEBUG=false

# Repos path (where your local repos are)
REPOS_PATH=$HOME/repos
EOF
    echo -e "${GREEN}✅ .env created (update if needed)${NC}"
else
    echo -e "${GREEN}✅ .env already exists${NC}"
fi

# 5. Tailscale check
echo ""
if command -v tailscale >/dev/null 2>&1; then
    TAILSCALE_IP=$(tailscale ip -4 2>/dev/null || echo "not connected")
    echo -e "${GREEN}✅ Tailscale installed (IP: ${TAILSCALE_IP})${NC}"
else
    echo -e "${YELLOW}⚠️  Tailscale not installed. For production Tailscale access:${NC}"
    echo "   curl -fsSL https://tailscale.com/install.sh | sh"
    echo "   sudo tailscale up"
fi

# 6. Print next steps
echo ""
echo "=========================================="
echo -e "${GREEN}🎉 Setup complete!${NC}"
echo ""
echo "Next steps:"
echo "  1. Log in to Claude profiles (if not done above):"
echo "     CLAUDE_CONFIG_DIR=~/.claude-profiles/primary claude login"
echo "     CLAUDE_CONFIG_DIR=~/.claude-profiles/secondary claude login"
echo ""
echo "  2. Start the services:"
echo "     cd $PROJECT_DIR"
echo "     docker-compose up -d"
echo ""
echo "  3. Check health:"
echo "     curl http://localhost:8000/api/health"
echo ""
echo "  4. View logs:"
echo "     docker-compose logs -f api frontend"
echo ""
echo "  5. Open in browser:"
echo "     Development: http://localhost:80 (via Caddy)"
echo "     Direct backend: http://localhost:8000"
echo "     Direct frontend: http://localhost:3000 (Vite dev)"
echo ""
echo "  6. For production with Tailscale:"
echo "     - Uncomment the Tailscale section in infra/Caddyfile"
echo "     - Run: tailscale cert nuc-name.tailnet.ts.net"
echo "     - Update docker-compose.yml with cert paths"
echo "     - Restart: docker-compose up -d caddy"
echo ""
echo "Useful commands:"
echo "  docker-compose down                     # Stop all services"
echo "  docker-compose logs -f api              # Watch API logs"
echo "  docker-compose ps                       # Show running services"
echo "  docker-compose exec api bash            # Shell into API container"
echo ""
