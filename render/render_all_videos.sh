#!/usr/bin/env bash
set -euo pipefail
export CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome
export FFMPEG=$(python3 -c "import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())")
cd "$(dirname "$0")/.."
node render/render.mjs video --format ig       --ss 2 --fps 30 --seconds 20 --scale 1080x1350 --out out/sigmamumu-instagram-1080x1350.mp4
node render/render.mjs video --format livideo  --ss 2 --fps 30 --seconds 20 --scale 1920x1080 --out out/sigmamumu-linkedin-1920x1080.mp4
node render/render.mjs video --format story    --ss 2 --fps 30 --seconds 20 --scale 1080x1920 --out out/sigmamumu-story-1080x1920.mp4
echo ALL_VIDEOS_DONE
