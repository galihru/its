#!/usr/bin/env bash
set -euo pipefail

RED_PIN="${ITS_GPIO_RED_PIN:-17}"
YELLOW_PIN="${ITS_GPIO_YELLOW_PIN:-27}"
GREEN_PIN="${ITS_GPIO_GREEN_PIN:-22}"
ACTIVE_LOW="${ITS_GPIO_ACTIVE_LOW:-false}"
HOLD_SECONDS="${ITS_GPIO_TEST_SECONDS:-2}"

if command -v pinctrl >/dev/null 2>&1; then
  GPIO_CMD="pinctrl"
elif command -v raspi-gpio >/dev/null 2>&1; then
  GPIO_CMD="raspi-gpio"
else
  echo "Tidak menemukan pinctrl atau raspi-gpio. Install paket GPIO Raspberry Pi dulu." >&2
  exit 1
fi

physical_level() {
  local logical="$1"
  if [ "$ACTIVE_LOW" = "true" ]; then
    if [ "$logical" = "1" ]; then printf 'dl'; else printf 'dh'; fi
  else
    if [ "$logical" = "1" ]; then printf 'dh'; else printf 'dl'; fi
  fi
}

write_pin() {
  local pin="$1"
  local logical="$2"
  "$GPIO_CMD" set "$pin" op "$(physical_level "$logical")"
}

all_off() {
  write_pin "$RED_PIN" 0
  write_pin "$YELLOW_PIN" 0
  write_pin "$GREEN_PIN" 0
}

show_color() {
  local color="$1"
  echo "LED test: $color"
  case "$color" in
    red)
      write_pin "$RED_PIN" 1
      write_pin "$YELLOW_PIN" 0
      write_pin "$GREEN_PIN" 0
      ;;
    yellow)
      write_pin "$RED_PIN" 0
      write_pin "$YELLOW_PIN" 1
      write_pin "$GREEN_PIN" 0
      ;;
    green)
      write_pin "$RED_PIN" 0
      write_pin "$YELLOW_PIN" 0
      write_pin "$GREEN_PIN" 1
      ;;
  esac
  sleep "$HOLD_SECONDS"
}

echo "Testing LEDs with $GPIO_CMD: red=$RED_PIN yellow=$YELLOW_PIN green=$GREEN_PIN activeLow=$ACTIVE_LOW"
all_off
show_color red
show_color yellow
show_color green
all_off
echo "LED test finished."
