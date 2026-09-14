#!/bin/bash
# Runs ON the Mac Studio. Extracts the videos from the archived Basecamp
# export zip, strips their audio, and transcribes everything with
# whisper.cpp (Metal). Idempotent: safe to re-run; finished transcripts
# are skipped.
#
# Layout under ~/archives/pro-moves/:
#   Basecamp-export-*.zip   the archived raw export (source of truth)
#   videos/                 extracted .mp4/.mov
#   audio/                  16kHz mono wav, deleted after transcription
#   transcripts/            <video-basename>.txt
#   models/                 whisper model
#   transcribe.log          progress log

set -uo pipefail
eval "$(/opt/homebrew/bin/brew shellenv)"

BASE="$HOME/archives/pro-moves"
ZIP="$(ls "$BASE"/Basecamp-export-*.zip | head -1)"
MODEL_URL="https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo.bin"
MODEL="$BASE/models/ggml-large-v3-turbo.bin"
LOG="$BASE/transcribe.log"

mkdir -p "$BASE/videos" "$BASE/audio" "$BASE/transcripts" "$BASE/models"
exec >>"$LOG" 2>&1
echo "=== run started $(date) ==="

if [ ! -f "$MODEL" ]; then
  echo "downloading whisper model..."
  curl -L --fail -o "$MODEL.part" "$MODEL_URL" && mv "$MODEL.part" "$MODEL"
fi

echo "extracting videos from $(basename "$ZIP")..."
unzip -n -q "$ZIP" "*.mp4" "*.mov" "*.MP4" "*.MOV" -d "$BASE/videos" || true

count=0; done_already=0; failed=0
find "$BASE/videos" -type f \( -iname "*.mp4" -o -iname "*.mov" \) -print0 |
while IFS= read -r -d '' vid; do
  name="$(basename "$vid")"
  stem="${name%.*}"
  out="$BASE/transcripts/$stem"
  if [ -s "$out.txt" ]; then
    done_already=$((done_already+1)); continue
  fi
  wav="$BASE/audio/$stem.wav"
  if [ ! -s "$wav" ]; then
    ffmpeg -nostdin -loglevel error -y -i "$vid" -vn -ac 1 -ar 16000 "$wav" || {
      echo "FFMPEG FAILED: $name"; failed=$((failed+1)); continue; }
  fi
  echo "[$(date +%H:%M:%S)] transcribing $name"
  whisper-cli -m "$MODEL" -f "$wav" -otxt -of "$out" -np || {
    echo "WHISPER FAILED: $name"; failed=$((failed+1)); continue; }
  rm -f "$wav"
  count=$((count+1))
done

total=$(find "$BASE/transcripts" -name "*.txt" | wc -l | tr -d ' ')
echo "=== run finished $(date): $total transcripts on disk ==="
