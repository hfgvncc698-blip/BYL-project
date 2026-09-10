#!/bin/zsh
set -euo pipefail

ROOT="${0:A:h}"
OUT="$ROOT/byl-reel-humain-v2.mp4"
SEGMENTS="$ROOT/segments"
CONCAT="$SEGMENTS/concat.txt"
SILENT="$SEGMENTS/silent.mp4"

node "$ROOT/generate_frames.mjs"
mkdir -p "$SEGMENTS"
: > "$CONCAT"

index=0
while IFS=$'\t' read -r frame duration; do
  index=$((index + 1))
  segment="$SEGMENTS/$(printf '%02d' "$index").mp4"
  frames=$(awk "BEGIN {printf \"%d\", ${duration} * 30}")
  ffmpeg -nostdin -y -loop 1 -i "$ROOT/frames/$frame" \
    -vf "scale=1080:1920,zoompan=z='min(zoom+0.00022,1.025)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=1080x1920:fps=30" \
    -frames:v "$frames" -an -c:v libx264 -preset medium -crf 18 -pix_fmt yuv420p "$segment"
  printf "file '%s'\n" "$segment" >> "$CONCAT"
done < "$ROOT/frames/scenes.tsv"

ffmpeg -nostdin -y -f concat -safe 0 -i "$CONCAT" -c copy "$SILENT"

ffmpeg -nostdin -y -i "$SILENT" -i "$ROOT/voice-denise.mp3" \
  -f lavfi -t 28 -i "aevalsrc=0.010*(sin(2*PI*110*t)+0.55*sin(2*PI*164.81*t)+0.35*sin(2*PI*220*t))*(0.82+0.18*sin(2*PI*0.22*t)):s=48000" \
  -filter_complex "[1:a]aresample=48000,volume=1.0[voice];[2:a]lowpass=f=900,afade=t=in:st=0:d=1.2,afade=t=out:st=26.3:d=1.7[bed];[voice][bed]amix=inputs=2:duration=first:dropout_transition=0,loudnorm=I=-15:LRA=7:TP=-1.5[audio]" \
  -map 0:v -map "[audio]" -t 28 -c:v copy -c:a aac -b:a 192k -ar 48000 -movflags +faststart "$OUT"

ffprobe -v error -show_format -show_streams -of json "$OUT" > "$ROOT/byl-reel-humain-v2-ffprobe.json"
