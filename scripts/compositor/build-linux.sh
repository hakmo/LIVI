#!/usr/bin/env bash
set -euo pipefail

# Builds the nested wlroots compositor (livi-compositor) and bundles it with its
# non-system shared libs into OUT, so electron-builder can drop it into the
# AppImage. The pinned 0.20 wlroots subproject is always built (it carries a LIVI
# patch), never the system one.

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SRC_DIR="$REPO_ROOT/native/livi-compositor"
BUILD_DIR="$SRC_DIR/build"
OUT="${1:-$REPO_ROOT/out/compositor}"
BIN="$BUILD_DIR/livi-compositor"

if [[ "$(uname -s)" != "Linux" ]]; then
  echo "livi-compositor builds on Linux only; skipping on $(uname -s)" >&2
  exit 0
fi

for tool in meson ninja pkg-config; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "missing build tool: $tool" >&2
    exit 1
  fi
done

# LIVI carries a wlroots patch (subprojects/packagefiles/wlroots-livi.patch) that exposes
# host-output control for app-kiosk + our own decorations. force-fallback-for builds the
# pinned 0.20 subproject even when a system wlroots-0.20 exists, so the patch always applies.
echo "→ Forcing pinned wlroots-0.20 subproject (carries the LIVI output-control patch)"
MESON_ARGS=(--buildtype=release --wrap-mode=default)
fallback="wlroots-0.20"

if ! pkg-config --exists 'wlroots-0.20'; then
  # No system wlroots: the whole stack is built from wraps. Force wayland from the wrap too, so the
  # bundled wayland-scanner matches the (newer) wayland-protocols.
  fallback="$fallback,wayland,wayland-protocols"
  MESON_ARGS+=(
    -Dwayland:documentation=false
    -Dwayland:tests=false
    -Dwayland:dtd_validation=false
    -Dlibxkbcommon:enable-docs=false
    -Dlibxkbcommon:enable-tools=false
    -Dlibxkbcommon:enable-xkbregistry=false
  )
fi

MESON_ARGS+=(--force-fallback-for="$fallback")

echo "→ Configuring livi-compositor"
if [[ -d "$BUILD_DIR" ]]; then
  meson setup --reconfigure "$BUILD_DIR" "$SRC_DIR" "${MESON_ARGS[@]}"
else
  meson setup "$BUILD_DIR" "$SRC_DIR" "${MESON_ARGS[@]}"
fi

echo "→ Compiling"
ninja -C "$BUILD_DIR"

if [[ ! -x "$BIN" ]]; then
  echo "build did not produce $BIN" >&2
  exit 1
fi

real_path() {
  python3 - <<'PY' "$1"
import os, sys
print(os.path.realpath(sys.argv[1]))
PY
}

# Host-provided libs (GPU driver + base graphics + libc): never bundled
is_system_excluded() {
  case "$1" in
    /lib64/ld-linux-*|/lib/ld-linux-*|/lib/x86_64-linux-gnu/ld-linux-*|/lib/aarch64-linux-gnu/ld-linux-*|\
        */libc.so.*|*/libm.so.*|*/libmvec.so.*|*/libpthread.so.*|*/libdl.so.*|*/librt.so.*|\
    */libgcc_s.so.*|*/libstdc++.so.*|\
    */libglib-2.0.so.*|*/libgobject-2.0.so.*|*/libgio-2.0.so.*|*/libgmodule-2.0.so.*|\
    */libdbus-1.so.*|*/libsystemd.so.*|\
    */libX*.so.*|*/libxcb*.so.*|*/libwayland-*.so.*|\
    */libdrm.so.*|*/libgbm.so.*|*/libGL.so.*|*/libEGL.so.*|*/libGLESv2.so.*|\
    */libGLdispatch.so.*|*/libOpenGL.so.*|*/libglapi.so.*|*/libgallium*.so.*|\
    */libvulkan.so.*|*/libudev.so.*|*/libgudev-1.0.so.*)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

declare -A SEEN_LIBS=()
declare -a PENDING_LIBS=()

scan_deps() {
  ldd "$1" 2>/dev/null \
    | awk '/=> \// { print $3 } /^\// { print $1 }' \
    | sort -u
}

queue_dep() {
  local dep="$1"
  [[ -n "$dep" && -f "$dep" ]] || return 0
  local real
  real="$(real_path "$dep")"
  is_system_excluded "$real" && return 0
  [[ -n "${SEEN_LIBS[$dep]:-}" ]] && return 0
  SEEN_LIBS["$dep"]=1
  PENDING_LIBS+=("$dep")
}

echo "→ Bundling into $OUT"
rm -rf "$OUT"
mkdir -p "$OUT/bin" "$OUT/lib"
cp -p "$BIN" "$OUT/bin/livi-compositor"

while read -r dep; do queue_dep "$dep"; done < <(scan_deps "$BIN")

idx=0
while [[ $idx -lt ${#PENDING_LIBS[@]} ]]; do
  lib="${PENDING_LIBS[$idx]}"
  idx=$((idx + 1))
  link_name="$(basename "$lib")"
  real_name="$(real_path "$lib")"
  real_base="$(basename "$real_name")"
  [[ -e "$OUT/lib/$real_base" ]] || cp -p "$real_name" "$OUT/lib/$real_base"
  if [[ "$link_name" != "$real_base" && ! -e "$OUT/lib/$link_name" ]]; then
    ln -s "$real_base" "$OUT/lib/$link_name"
  fi
  while read -r dep; do queue_dep "$dep"; done < <(scan_deps "$real_name")
done

# Launcher: bundled libs first, then exec the compositor. LIVI spawns this.
cat > "$OUT/livi-compositor" <<'EOF'
#!/usr/bin/env bash
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export LD_LIBRARY_PATH="$here/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
exec "$here/bin/livi-compositor" "$@"
EOF
chmod +x "$OUT/livi-compositor"

echo "→ livi-compositor bundle at: $OUT"
du -sh "$OUT"
find "$OUT" -maxdepth 2 | sort
