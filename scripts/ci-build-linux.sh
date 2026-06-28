#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="${DIST_DIR:-$ROOT_DIR/dist}"

restore_output_owner() {
  if [[ -n "${HOST_UID:-}" && -n "${HOST_GID:-}" ]]; then
    chown -R "$HOST_UID:$HOST_GID" "$ROOT_DIR/dist" "$ROOT_DIR/src-tauri/target" 2>/dev/null || true
  fi
}
trap restore_output_owner EXIT

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y --no-install-recommends \
  build-essential \
  ca-certificates \
  curl \
  file \
  git \
  libgtk-3-dev \
  libwebkit2gtk-4.1-dev \
  librsvg2-dev \
  libssl-dev \
  pkg-config \
  patchelf \
  perl \
  rpm \
  imagemagick \
  zstd \
  xdg-utils \
  python3

curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y --no-install-recommends nodejs

curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \
  | sh -s -- -y --profile minimal --default-toolchain stable
export PATH="$HOME/.cargo/bin:$PATH"

cd "$ROOT_DIR"

npm install

npx tauri build --bundles "appimage,deb,rpm"

mkdir -p "$DIST_DIR"

BUNDLE_DIR="$ROOT_DIR/src-tauri/target/release/bundle"
if [[ -d "$BUNDLE_DIR/appimage" ]]; then
  cp "$BUNDLE_DIR/appimage"/*.AppImage "$DIST_DIR/tactions-linux-x64.AppImage" 2>/dev/null || true
fi
if [[ -d "$BUNDLE_DIR/deb" ]]; then
  cp "$BUNDLE_DIR/deb"/*.deb "$DIST_DIR/tactions-linux-x64.deb" 2>/dev/null || true
fi
if [[ -d "$BUNDLE_DIR/rpm" ]]; then
  cp "$BUNDLE_DIR/rpm"/*.rpm "$DIST_DIR/tactions-linux-x64.rpm" 2>/dev/null || true
fi

ls -la "$DIST_DIR"
echo "Linux packages written to $DIST_DIR"
