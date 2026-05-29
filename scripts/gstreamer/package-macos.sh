#!/usr/bin/env bash
set -euo pipefail

OUT="${1:-assets/gstreamer/macos-arm64}"
GST_ROOT="/Library/Frameworks/GStreamer.framework/Versions/1.0"

copy_required() {
  local src="$1"
  local dst="$2"

  if [[ ! -e "$src" ]]; then
    echo "missing required file: $src" >&2
    exit 1
  fi

  cp -p "$src" "$dst"
}

real_path() {
  python3 - <<'PY' "$1"
import os, sys
print(os.path.realpath(sys.argv[1]))
PY
}

# Only follow @rpath deps, system libs (/usr/lib, /System) are absolute and skipped
scan_deps() {
  local file="$1"
  otool -L "$file" 2>/dev/null \
    | awk '/^\t@rpath\// { sub(/^@rpath\//, "", $1); print $1 }' \
    | sort -u
}

SEEN_LIBS=""

queue_dep() {
  local name="$1"
  [[ -n "$name" ]] || return 0
  [[ -e "$GST_ROOT/lib/$name" ]] || return 0
  case " $SEEN_LIBS " in *" $name "*) return 0 ;; esac
  SEEN_LIBS="$SEEN_LIBS $name"
  PENDING_LIBS+=("$name")
}

copy_bin_and_deps() {
  copy_required "$1" "$OUT/bin/$(basename "$1")"
  while read -r dep; do queue_dep "$dep"; done < <(scan_deps "$1")
}

copy_libexec_and_deps() {
  copy_required "$1" "$OUT/libexec/gstreamer-1.0/$(basename "$1")"
  while read -r dep; do queue_dep "$dep"; done < <(scan_deps "$1")
}

copy_plugin_and_deps() {
  copy_required "$1" "$OUT/lib/gstreamer-1.0/$(basename "$1")"
  while read -r dep; do queue_dep "$dep"; done < <(scan_deps "$1")
}

copy_all_pending_libs() {
  local idx=0
  while [[ $idx -lt ${#PENDING_LIBS[@]} ]]; do
    local link_name="${PENDING_LIBS[$idx]}"
    idx=$((idx + 1))

    local real_name real_base
    real_name="$(real_path "$GST_ROOT/lib/$link_name")"
    real_base="$(basename "$real_name")"

    if [[ ! -e "$OUT/lib/$real_base" ]]; then
      copy_required "$real_name" "$OUT/lib/$real_base"
    fi

    # Preserve versioned aliases (e.g. libjpeg.8.dylib -> libjpeg.8.3.2.dylib)
    if [[ "$link_name" != "$real_base" && ! -e "$OUT/lib/$link_name" ]]; then
      ln -s "$real_base" "$OUT/lib/$link_name"
    fi

    while read -r dep; do queue_dep "$dep"; done < <(scan_deps "$real_name")
  done
}

rm -rf "$OUT"
mkdir -p \
  "$OUT/bin" \
  "$OUT/lib" \
  "$OUT/lib/gstreamer-1.0" \
  "$OUT/libexec/gstreamer-1.0"

PENDING_LIBS=()

# bin
copy_bin_and_deps "$GST_ROOT/bin/gst-launch-1.0"
copy_bin_and_deps "$GST_ROOT/bin/gst-inspect-1.0"
copy_bin_and_deps "$GST_ROOT/bin/gst-device-monitor-1.0"

# libexec
copy_libexec_and_deps "$GST_ROOT/libexec/gstreamer-1.0/gst-plugin-scanner"

plugins=(
  # core
  libgstapp.dylib
  libgstcoreelements.dylib
  libgsttypefindfunctions.dylib
  libgstautodetect.dylib
  # audio
  libgstaudioconvert.dylib
  libgstaudiofx.dylib
  libgstaudiomixer.dylib
  libgstaudioparsers.dylib
  libgstaudiorate.dylib
  libgstaudioresample.dylib
  libgstaudiotestsrc.dylib
  libgstequalizer.dylib
  libgstinterleave.dylib
  libgstlevel.dylib
  libgstosxaudio.dylib
  libgstrawparse.dylib
  libgstvolume.dylib
  # video parse + decode + scale
  libgstvideoparsersbad.dylib
  libgstapplemedia.dylib
  libgstvideoconvertscale.dylib
  # video sinks
  libgstopengl.dylib
  libgstosxvideo.dylib
)

for plugin in "${plugins[@]}"; do
  copy_plugin_and_deps "$GST_ROOT/lib/gstreamer-1.0/$plugin"
done

# Umbrella framework binary (kept for parity with prior bundles)
copy_required "$GST_ROOT/lib/GStreamer" "$OUT/lib/GStreamer"

# all transitive libs
copy_all_pending_libs

echo "Created macOS GStreamer bundle at: $OUT"
echo "Bundle size:"
du -sh "$OUT"
echo "Top-level contents:"
find "$OUT" -maxdepth 3 | sort
