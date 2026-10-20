#!/usr/bin/env bash
# setup-clip.sh — turn a recording of one setup step into the looping clip
# the hako page shows under that step (assets/images/setup/step-N.webp).
#
#   tools/setup-clip.sh 2 ~/Movies/step2.mov            whole recording
#   tools/setup-clip.sh 2 ~/Movies/step2.mov 3.5 8      from 3.5 s, 8 s long
#
# Record each step with the setup rehearsal (web admin → Setup rehearsal, or
# hako-ctl setup-demo plug|phone|anki|study). Film in landscape; the clip is
# cropped to 4:3, 480 px wide, 12 fps, silent, looping. Needs ffmpeg.
set -euo pipefail
step=${1:?usage: setup-clip.sh <1-4> <video> [start-seconds] [length-seconds]}
src=${2:?usage: setup-clip.sh <1-4> <video> [start-seconds] [length-seconds]}
[[ "$step" =~ ^[1-4]$ ]] || { echo "step must be 1-4" >&2; exit 2; }
command -v ffmpeg >/dev/null || { echo "setup-clip.sh needs ffmpeg (brew install ffmpeg / apt install ffmpeg)" >&2; exit 1; }
here=$(cd "$(dirname "$0")/.." && pwd)
out="$here/assets/images/setup/step-$step.webp"
mkdir -p "$(dirname "$out")"
trim=()
[ -n "${3:-}" ] && trim+=(-ss "$3")
[ -n "${4:-}" ] && trim+=(-t "$4")
ffmpeg -hide_banner -loglevel error -y "${trim[@]}" -i "$src" -an \
  -vf "crop='min(iw,ih*4/3)':'min(ih,iw*3/4)',scale=480:360:flags=lanczos,fps=12" \
  -c:v libwebp -lossless 0 -q:v 70 -compression_level 6 -loop 0 "$out"
echo "wrote ${out#$here/} ($(du -k "$out" | cut -f1) KB)"
