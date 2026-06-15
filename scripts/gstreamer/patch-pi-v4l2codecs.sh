#!/usr/bin/env bash
set -euo pipefail

# ----------------------------------------------------------------------------
# Build a crop-fixed v4l2codecs plugin for the Raspberry Pi 5 HEVC decoder.
# Run on the Pi:  bash scripts/gstreamer/patch-pi-v4l2codecs.sh
# ----------------------------------------------------------------------------

VER="$(gst-launch-1.0 --version 2>/dev/null | awk '/version/{print $NF; exit}')"
[ -n "$VER" ] || { echo "gst-launch-1.0 not found; install gstreamer first" >&2; exit 1; }
echo "System GStreamer: $VER"

WORK="${TMPDIR:-/tmp}/livi-v4l2codecs"
rm -rf "$WORK"; mkdir -p "$WORK"; cd "$WORK"

echo "==> Installing build dependencies"
sudo apt-get update
sudo apt-get install -y --no-install-recommends \
  build-essential meson ninja-build pkg-config dpkg-dev \
  libgstreamer1.0-dev libgstreamer-plugins-base1.0-dev \
  libv4l-dev libudev-dev libgudev-1.0-dev

# Fetch the DISTRO source (deb-src)
CREATED_SRC=()
cleanup() { for f in "${CREATED_SRC[@]:-}"; do sudo rm -f "$f"; done; }
trap cleanup EXIT

if ! apt-get source --download-only gstreamer1.0-plugins-bad >/dev/null 2>&1; then
  echo "==> deb-src not enabled, adding it temporarily"
  # deb822 format (Trixie default): mirror each deb stanza as a deb-src one
  for f in /etc/apt/sources.list.d/*.sources; do
    [ -f "$f" ] || continue
    grep -q '^Types:' "$f" || continue
    grep -q 'deb-src' "$f" && continue
    tmp="/etc/apt/sources.list.d/zz-livi-debsrc-$(basename "$f")"
    sudo sed 's/^Types:.*/Types: deb-src/' "$f" | sudo tee "$tmp" >/dev/null
    CREATED_SRC+=("$tmp")
  done
  # classic format: mirror each "deb " line as a "deb-src " line
  for f in /etc/apt/sources.list /etc/apt/sources.list.d/*.list; do
    [ -f "$f" ] || continue
    grep -qE '^[[:space:]]*deb ' "$f" || continue
    tmp="/etc/apt/sources.list.d/zz-livi-debsrc-$(basename "$f").list"
    grep -E '^[[:space:]]*deb ' "$f" | sed 's/^[[:space:]]*deb /deb-src /' | sudo tee "$tmp" >/dev/null
    CREATED_SRC+=("$tmp")
  done
  sudo apt-get update
fi

echo "==> Fetching gst-plugins-bad distro source"
if ! apt-get source --download-only gstreamer1.0-plugins-bad || ! ls gst-plugins-bad*.dsc >/dev/null 2>&1; then
  echo "ERROR: could not fetch the distro source for gstreamer1.0-plugins-bad." >&2
  echo "Enable deb-src in your apt config, run 'sudo apt-get update', then re-run." >&2
  echo "Do NOT use the upstream tarball: its kernel uAPI mismatches the Pi and the decoder crashes (VIDIOC_QBUF EINVAL)." >&2
  exit 1
fi
dpkg-source -x gst-plugins-bad*.dsc gpb-src   # applies debian/patches
cd gpb-src

echo "==> Applying zero-copy-crop patch (emit the uncropped CODED size for bottom crops)"
f="sys/v4l2codecs/gstv4l2codech265dec.c"
[ -f "$f" ] && grep -q 'crop_width = sps->crop_rect_width;' "$f" \
  || { echo "ERROR: 'crop_width = sps->crop_rect_width;' not found in $f - source layout differs" >&2; exit 1; }
sed -i \
  -e 's/crop_width = sps->crop_rect_width;/crop_width = sps->width;/' \
  -e 's/crop_height = sps->crop_rect_height;/crop_height = sps->height;/' \
  "$f"
grep -q 'crop_height = sps->height;' "$f" || { echo "ERROR: patch did not take in $f" >&2; exit 1; }
echo "    patched $f (display := coded -> consistent 1088 caps/VideoMeta/dmabuf)"

echo "==> Forcing copy_frames = FALSE (never copy; emit the uncropped coded frame)"
grep -q 'self->copy_frames = self->need_crop;' "$f" \
  || { echo "ERROR: copy_frames decision not found in $f - source layout differs" >&2; exit 1; }
sed -i \
  -e 's/self->copy_frames = TRUE;/self->copy_frames = FALSE;/' \
  -e 's/self->copy_frames = self->need_crop;/self->copy_frames = FALSE;/' \
  "$f"
! grep -q 'self->copy_frames = self->need_crop;' "$f" \
  || { echo "ERROR: copy_frames patch did not take in $f" >&2; exit 1; }
echo "    patched $f (copy_frames forced FALSE -> capture dmabuf passes through)"

echo "==> Building only the v4l2codecs plugin"
meson setup build -Dauto_features=disabled -Dv4l2codecs=enabled \
  -Dintrospection=disabled -Ddoc=disabled -Dtests=disabled -Dexamples=disabled
ninja -C build

SO="$(find build -name 'libgstv4l2codecs.so' | head -1)"
[ -n "$SO" ] || { echo "build did not produce libgstv4l2codecs.so" >&2; exit 1; }
echo "    built: $SO"

PLUGINS_DIR="$(pkg-config --variable=pluginsdir gstreamer-1.0)"
TARGET="$PLUGINS_DIR/libgstv4l2codecs.so"
echo "==> Installing over $TARGET (original backed up to .orig)"
[ -f "$TARGET" ] && sudo cp -n "$TARGET" "$TARGET.orig" || true
sudo cp "$SO" "$TARGET"

echo "==> Clearing the GStreamer registry cache so the new plugin is rescanned"
rm -f "$HOME"/.cache/gstreamer-1.0/registry.*.bin 2>/dev/null || true

echo
echo "Done"
echo
echo "Restore with"
echo "  sudo cp \"$TARGET.orig\" \"$TARGET\" && rm -f ~/.cache/gstreamer-1.0/registry.*.bin"
