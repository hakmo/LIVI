#!/usr/bin/env bash
# Install the LIVI (or other)Plymouth boot splash on Raspberry Pi OS.
# Usage:
#   sudo ./install.sh [theme-name]
# If theme-name is not provided, it defaults to 'livi' and looks for 'livi-splash.png' in the script directory.
# If theme-name is provided, it looks for the subdirectory named after the theme; there it will look for `<theme-name>-splash.png`
#  for static boot image or `progress-N.png` frames for animated boot images.
# Run as root (or via sudo) on the Pi
set -euo pipefail

THEME_NAME="${1:-livi}"
THEME_DIR="/usr/share/plymouth/themes/${THEME_NAME}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

FRAME_COUNT=0
if [[ $# -gt 0 ]]; then
  for f in "${SCRIPT_DIR}/${THEME_NAME}"/progress-[0-9]*.png; do
    if [[ -f "$f" ]]; then
      FRAME_COUNT=$(( FRAME_COUNT + 1 ))
    fi
  done
fi

if [[ $# -gt 0 && ${FRAME_COUNT} -eq 0 ]]; then
  LOGO_SRC="${SCRIPT_DIR}/${THEME_NAME}/${THEME_NAME}-splash.png"
elif [[ $# -eq 0 ]]; then
  LOGO_SRC="${SCRIPT_DIR}/livi-splash.png"
else
  LOGO_SRC=""
fi

CONFIG_TXT=""
CMDLINE_TXT=""

if [[ $EUID -ne 0 ]]; then
  echo "Run with sudo: sudo $0" >&2
  exit 1
fi

if [[ ${FRAME_COUNT} -eq 0 && ! -f "${LOGO_SRC}" ]]; then
  echo "Missing ${LOGO_SRC}" >&2
  echo "Place a transparent-background PNG or progress-N.png animation frames." >&2
  exit 1
fi

CONFIG_TXT="/boot/firmware/config.txt"
CMDLINE_TXT="/boot/firmware/cmdline.txt"
if [[ ! -f "${CONFIG_TXT}" ]] || [[ ! -f "${CMDLINE_TXT}" ]]; then
  echo "Expected ${CONFIG_TXT} and ${CMDLINE_TXT} (Pi OS Trixie)" >&2
  exit 1
fi

echo "[1/5] Installing Plymouth"
apt-get update -qq
apt-get install -y plymouth plymouth-themes

echo "[2/5] Writing theme to ${THEME_DIR}"
install -d -m 0755 "${THEME_DIR}"
if [[ ${FRAME_COUNT} -gt 0 ]]; then
  echo "      animated: ${FRAME_COUNT} frames"
  for f in "${SCRIPT_DIR}/${THEME_NAME}"/progress-[0-9]*.png; do
    if [[ -f "$f" ]]; then
      install -m 0644 "$f" "${THEME_DIR}/"
    fi
  done
else
  install -m 0644 "${LOGO_SRC}" "${THEME_DIR}/logo.png"
fi

cat > "${THEME_DIR}/${THEME_NAME}.plymouth" <<EOF
[Plymouth Theme]
Name=LIVI
Description=LIVI boot splash
ModuleName=script

[script]
ImageDir=${THEME_DIR}
ScriptFile=${THEME_DIR}/${THEME_NAME}.script
EOF

if [[ ${FRAME_COUNT} -gt 0 ]]; then
cat > "${THEME_DIR}/${THEME_NAME}.script" <<EOF
Window.SetBackgroundTopColor(0, 0, 0);
Window.SetBackgroundBottomColor(0, 0, 0);

for (i = 1; i <= ${FRAME_COUNT}; i++)
  frames[i] = Image("progress-" + i + ".png");

sprite = Sprite();
sprite.SetX(Window.GetX() + (Window.GetWidth(0) / 2 - frames[1].GetWidth() / 2));
sprite.SetY(Window.GetY() + (Window.GetHeight(0) / 2 - frames[1].GetHeight() / 2));

tick = 0;
fun refresh_callback() {
  sprite.SetImage(frames[Math.Int(tick / 2) % ${FRAME_COUNT} + 1]);
  tick++;
}
Plymouth.SetRefreshFunction(refresh_callback);
EOF
else
cat > "${THEME_DIR}/${THEME_NAME}.script" <<'EOF'
Window.SetBackgroundTopColor(0, 0, 0);
Window.SetBackgroundBottomColor(0, 0, 0);

logo = Image("logo.png");
sprite = Sprite(logo);

# Re-center on every refresh; window size is 0 at init on some displays
fun refresh() {
  sprite.SetPosition(
    Window.GetWidth() / 2 - logo.GetWidth() / 2,
    Window.GetHeight() / 2 - logo.GetHeight() / 2,
    10);
}
Plymouth.SetRefreshFunction(refresh);
EOF
fi

echo "[3/5] Activating theme + rebuilding initramfs"
plymouth-set-default-theme "${THEME_NAME}" -R

# disable_fw_kms_setup=1 means KMS comes up late; let plymouth wait for it
install -d -m 0755 /etc/plymouth
cat > /etc/plymouth/plymouthd.conf <<EOF
[Daemon]
Theme=${THEME_NAME}
ShowDelay=0
DeviceTimeout=30
EOF

echo "[4/5] Patching ${CONFIG_TXT}"
# Pi rainbow off (we run plymouth instead)
if ! grep -qE '^\s*disable_splash=1' "${CONFIG_TXT}"; then
  echo "disable_splash=1" >> "${CONFIG_TXT}"
fi
# Firmware mode-set must run early; otherwise plymouth renders into offline HDMI
sed -i 's/^disable_fw_kms_setup=1$/# disable_fw_kms_setup=1     # disabled by pi-splash for early HDMI/' "${CONFIG_TXT}"

echo "[5/5] Patching ${CMDLINE_TXT}"
cp -a "${CMDLINE_TXT}" "${CMDLINE_TXT}.bak.$(date +%s)"
LINE=$(tr -d '\n' < "${CMDLINE_TXT}")

add_flag() {
  local flag="$1"
  case " ${LINE} " in
    *" ${flag} "*) ;;
    *) LINE="${LINE} ${flag}" ;;
  esac
}

add_flag "quiet"
add_flag "splash"
add_flag "plymouth.ignore-serial-consoles"
add_flag "loglevel=0"

# Auto-detect the active display mode so plymouth doesn't render at EDID
# preferred (often 4K). Falls back to LIVI_SPLASH_VIDEO env if detection fails.
detect_video_mode() {
  [[ -z "${SUDO_USER:-}" ]] && return 1
  command -v wlr-randr >/dev/null || return 1
  local uid runtime
  uid=$(id -u "${SUDO_USER}")
  runtime="/run/user/${uid}"
  [[ -S "${runtime}/wayland-0" ]] || return 1
  local out
  out=$(WAYLAND_DISPLAY=wayland-0 XDG_RUNTIME_DIR="${runtime}" \
        runuser -u "${SUDO_USER}" -- wlr-randr 2>/dev/null) || return 1
  awk '
    /^[^[:space:]]/ { conn=$1 }
    /current/ {
      for (i=1;i<=NF;i++) if ($i ~ /^[0-9]+x[0-9]+/) mode=$i
      for (i=1;i<=NF;i++) if ($i ~ /^[0-9]+\.[0-9]+/) hz=int($i+0.5)
      if (conn && mode && hz) { printf "%s:%s@%d", conn, mode, hz; exit }
    }
  ' <<< "${out}"
}

VIDEO_MODE="${LIVI_SPLASH_VIDEO:-$(detect_video_mode || true)}"
if [[ -n "${VIDEO_MODE}" ]]; then
  echo "      video mode = ${VIDEO_MODE}"
  LINE=$(echo "${LINE}" | sed -E 's/[[:space:]]*video=[^[:space:]]+//g')
  LINE="${LINE} video=${VIDEO_MODE}"
else
  echo "      no video mode pinned (plymouth will use EDID preferred)"
fi
add_flag "logo.nologo"
add_flag "vt.global_cursor_default=0"

echo "${LINE}" > "${CMDLINE_TXT}"

echo
echo "Done. Reboot to see the new splash."
