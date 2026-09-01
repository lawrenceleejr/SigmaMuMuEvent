#!/usr/bin/env bash
# Render the animated σμμ Instagram post to MP4 on your own machine.
#
#   ./render/render-video.sh                       # 14s, 1080x1350, 60fps
#   ./render/render-video.sh --fast                # quick preview, no ink filters
#   ./render/render-video.sh --seconds 8 --fps 20  # shorter / cheaper
#   ./render/render-video.sh --scale 2             # 2160x2700 master
#   ./render/render-video.sh --screen TABLOID --out out/tabloid.mp4
#
# Needs: node 18+, and a Chromium/Chrome. ffmpeg is found automatically if you
# have it; otherwise `pip install imageio-ffmpeg` gives us one.
#
# Why this takes minutes rather than seconds: the package ships an animation
# that is *drawn live in a browser*, not a folder of frames. There is no frame
# sequence to collect -- each frame has to be composed by the browser and read
# back. On top of that every layer goes through the letterpress ink filter
# (noise displacement, blur, alpha threshold), and that filter is re-evaluated
# for every frame. --fast turns the filters off during capture, which is several
# times quicker and fine for checking timing and composition.
set -euo pipefail
cd "$(dirname "$0")/.."

SCREEN=INSTAGRAM
OUT=out/sigmamumu-instagram-post-1080x1350.mp4
FPS=60
SECONDS_LEN=14
SCALE=1
SETTLE=12000
FAST=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --fast)    FAST=1; shift ;;
    --screen)  SCREEN="$2"; shift 2 ;;
    --out)     OUT="$2"; shift 2 ;;
    --fps)     FPS="$2"; shift 2 ;;
    --seconds) SECONDS_LEN="$2"; shift 2 ;;
    --scale)   SCALE="$2"; shift 2 ;;
    --settle)  SETTLE="$2"; shift 2 ;;
    -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
done

# ---- node ------------------------------------------------------------------
command -v node >/dev/null || { echo "node not found: install Node 18 or newer" >&2; exit 1; }

# ---- browser ---------------------------------------------------------------
if [[ -z "${CHROMIUM_PATH:-}" ]]; then
  for c in \
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
    "/Applications/Chromium.app/Contents/MacOS/Chromium" \
    "$(command -v google-chrome || true)" \
    "$(command -v chromium || true)" \
    "$(command -v chromium-browser || true)"; do
    [[ -n "$c" && -x "$c" ]] && { export CHROMIUM_PATH="$c"; break; }
  done
fi
if [[ -z "${CHROMIUM_PATH:-}" ]]; then
  echo "No Chrome/Chromium found. Either install one, set CHROMIUM_PATH=/path/to/chrome,"
  echo "or run:  npx playwright install chromium   (then re-run this script)"
  exit 1
fi

# ---- ffmpeg ----------------------------------------------------------------
if [[ -z "${FFMPEG:-}" ]]; then
  if command -v ffmpeg >/dev/null; then
    export FFMPEG=ffmpeg
  elif python3 -c "import imageio_ffmpeg" 2>/dev/null; then
    export FFMPEG="$(python3 -c 'import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())')"
  else
    echo "ffmpeg not found: install it (brew install ffmpeg / apt install ffmpeg)" >&2
    echo "or run: pip install imageio-ffmpeg" >&2
    exit 1
  fi
fi

# ---- deps ------------------------------------------------------------------
[[ -d render/node_modules ]] || (cd render && npm install --no-audit --no-fund)

mkdir -p "$(dirname "$OUT")"
echo "browser : $CHROMIUM_PATH"
echo "ffmpeg  : $FFMPEG"
echo "target  : $OUT  (${SECONDS_LEN}s @ ${FPS}fps, scale ${SCALE}x, fast=${FAST})"
echo

exec node render/dcrender.mjs video \
  --file "design/Sigma Mu Mu Network.dc.html" \
  --screen "$SCREEN" --scale "$SCALE" --fps "$FPS" \
  --seconds "$SECONDS_LEN" --settle "$SETTLE" --fast "$FAST" --out "$OUT"
