#!/bin/bash
set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}Step 1: Building Docker builder image (Ubuntu 22.04)...${NC}"
sudo docker build -t tactions-builder -f Dockerfile.build .

echo -e "${BLUE}Step 2: Deriving host user details for permissions...${NC}"
HOST_UID=$(id -u)
HOST_GID=$(id -g)

echo -e "${BLUE}Step 3: Compiling application inside container...${NC}"
# Mount current directory to /app in container
# Pass Host UID/GID to fix folder permission issue on Linux host after build
sudo docker run --rm \
  -v "$(pwd)":/app \
  -e CARGO_HOME=/app/.cargo-docker-cache \
  tactions-builder \
  bash -c "npm install && npm run tauri build && chown -R $HOST_UID:$HOST_GID /app/src-tauri/target /app/node_modules /app/.cargo-docker-cache"

echo -e "${GREEN}✓ Build Successful!${NC}"
echo -e "${GREEN}Your AppImage and .deb packages are located in: src-tauri/target/release/bundle/${NC}"
