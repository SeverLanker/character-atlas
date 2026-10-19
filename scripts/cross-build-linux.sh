#!/usr/bin/env bash
set -euo pipefail
cd /io
node --version
cargo --version
if ! command -v makensis >/dev/null || ! command -v lld-link >/dev/null; then
  apt-get update
  apt-get install -y --no-install-recommends gcc g++ clang llvm lld nsis wine64 wine pkg-config ca-certificates
fi
rustup target add x86_64-pc-windows-msvc
npm run desktop:build -- --runner cargo-xwin --target x86_64-pc-windows-msvc --bundles nsis
cd /io/src-tauri
export WINEPREFIX=/tmp/atlas-wine
export WINEARCH=win64
cargo xwin test --release --target x86_64-pc-windows-msvc --lib --locked
