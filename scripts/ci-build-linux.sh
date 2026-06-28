#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="${DIST_DIR:-$ROOT_DIR/dist}"
PACKAGE_NAME="tactions"
APP_NAME="tactions"

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
  libarchive-tools \
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

# Extract version from Cargo.toml
VERSION="$(sed -n 's/^version = "\(.*\)"/\1/p' "$ROOT_DIR/src-tauri/Cargo.toml" | head -n1)"
if [[ -z "$VERSION" ]]; then
  VERSION="0.1.0"
fi

# Build Arch Linux package (.pkg.tar.zst)
build_arch() {
  local root="$DIST_DIR/arch-root"
  rm -rf "$root"
  mkdir -p "$root/usr/bin" \
    "$root/usr/share/applications" \
    "$root/usr/share/icons/hicolor/256x256/apps" \
    "$root/usr/share/$PACKAGE_NAME"

  install -m 755 "$ROOT_DIR/src-tauri/target/release/$APP_NAME" "$root/usr/bin/$APP_NAME"

  cp -a "$ROOT_DIR/src/." "$root/usr/share/$PACKAGE_NAME/"

  if [[ -f "$ROOT_DIR/src-tauri/icons/128x128.png" ]]; then
    convert "$ROOT_DIR/src-tauri/icons/128x128.png" -resize 256x256 \
      "$root/usr/share/icons/hicolor/256x256/apps/$APP_NAME.png" 2>/dev/null || \
    install -m 644 "$ROOT_DIR/src-tauri/icons/128x128.png" \
      "$root/usr/share/icons/hicolor/256x256/apps/$APP_NAME.png"
  fi

  cat >"$root/usr/share/applications/$APP_NAME.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=tactions
Comment=GitHub Actions Monitor
Exec=$APP_NAME
Icon=$APP_NAME
Terminal=false
Categories=Utility;Development;
StartupWMClass=tactions
EOF

  local installed_size
  installed_size="$(du -sb "$root" | awk '{print $1}')"

  cat >"$root/.PKGINFO" <<EOF
pkgname = $PACKAGE_NAME
pkgbase = $PACKAGE_NAME
pkgver = $VERSION-1
pkgdesc = GitHub Actions Monitor - Track your CI/CD workflows
url = https://github.com/noirlang/tactions
builddate = $(date -u +%s)
packager = noirLang
size = $installed_size
arch = x86_64
license = MIT
depend = gtk3
depend = webkit2gtk-4.1
EOF

  (
    cd "$root"
    bsdtar --format=gnutar --uid 0 --gid 0 --uname root --gname root -cf - .PKGINFO usr \
      | zstd -f -19 -T0 -o "$DIST_DIR/tactions-linux-x64.pkg.tar.zst"
  )

  rm -rf "$root"
}

build_arch

ls -la "$DIST_DIR"
echo "Linux packages written to $DIST_DIR"
