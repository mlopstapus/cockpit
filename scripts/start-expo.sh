#!/bin/bash
# Starts the Seamless Expo dev server with the Tailscale IP advertised
# so Expo Go on the phone can connect over Tailscale.
#
# Run via: systemctl --user start seamless-expo

set -e

# Source nvm if available (most common non-root Node install)
export NVM_DIR="$HOME/.nvm"
if [ -s "$NVM_DIR/nvm.sh" ]; then
  source "$NVM_DIR/nvm.sh"
fi

# Also try volta
if [ -d "$HOME/.volta/bin" ]; then
  export PATH="$HOME/.volta/bin:$PATH"
fi

# Resolve the host IP: prefer Tailscale so Expo Go works over Tailscale
HOST=$(tailscale ip -4 2>/dev/null || hostname -I | awk '{print $1}')
echo "Starting Expo with REACT_NATIVE_PACKAGER_HOSTNAME=$HOST"

cd "$HOME/repos/seamless/mobile"
exec env REACT_NATIVE_PACKAGER_HOSTNAME="$HOST" npx expo start --lan
