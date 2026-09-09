#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../../.." && pwd)"
OUT_DIR="$ROOT_DIR/marketing/video_exports/2026-09-09"
SRC_DIR="$OUT_DIR/sources"
CONTACT_DIR="$OUT_DIR/contact_sheets"
GENERATED_DIR="$SRC_DIR/generated"

mkdir -p "$SRC_DIR" "$CONTACT_DIR"
node "$OUT_DIR/generate_scenes.mjs"

build_one() {
  local slug="$1"
  local duration="$2"
  local rate="$3"
  local voice="$SRC_DIR/${slug}-voice.aiff"
  local output="$OUT_DIR/${slug}.mp4"
  local probe="$OUT_DIR/${slug}-ffprobe.json"
  local segment_dir="$GENERATED_DIR/$slug/segments"
  local concat_file="$segment_dir/concat.txt"
  local silent_video="$segment_dir/silent.mp4"

  if [[ ! -f "$voice" || "$(stat -f '%z' "$voice")" -lt 10000 ]]; then
    say -v Thomas -r "$rate" -f "$SRC_DIR/${slug}-voice.txt" -o "$voice"
  fi
  if [[ "$(stat -f '%z' "$voice")" -lt 10000 ]]; then
    printf '%s\n' "Erreur : la synthèse vocale locale n’a produit aucun audio pour $slug." >&2
    printf '%s\n' "Relancez ce script dans un contexte autorisant le service vocal macOS." >&2
    exit 1
  fi
  mkdir -p "$segment_dir"
  : > "$concat_file"
  local scene_index=0
  while IFS=$'\t' read -r scene_file scene_duration; do
    scene_index=$((scene_index + 1))
    local segment="$segment_dir/$(printf '%02d' "$scene_index").mp4"
    local frames=$((scene_duration * 30))
    ffmpeg -nostdin -y -loop 1 -i "$GENERATED_DIR/$slug/$scene_file" \
      -vf "scale=1080:1920,zoompan=z='min(zoom+0.00018,1.025)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=1080x1920:fps=30,fade=t=in:st=0:d=0.16,fade=t=out:st=$(awk "BEGIN {print ${scene_duration}-0.16}"):d=0.16" \
      -frames:v "$frames" -an -c:v libx264 -preset medium -crf 18 -pix_fmt yuv420p "$segment"
    printf "file '%s'\n" "$segment" >> "$concat_file"
  done < "$GENERATED_DIR/$slug/scenes.tsv"

  ffmpeg -nostdin -y -f concat -safe 0 -i "$concat_file" -c copy "$silent_video"
  ffmpeg -nostdin -y -i "$silent_video" -i "$voice" \
    -filter_complex "[1:a]apad=pad_dur=${duration},atrim=duration=${duration},afade=t=in:st=0:d=0.15,afade=t=out:st=$(awk "BEGIN {print ${duration}-0.5}"):d=0.5[aout]" \
    -map 0:v -map "[aout]" -t "$duration" -c:v copy -c:a aac -b:a 192k -movflags +faststart "$output"

  ffprobe -v error -show_entries \
    format=filename,duration,size,bit_rate:stream=index,codec_name,codec_type,width,height,r_frame_rate,sample_rate,channels \
    -of json "$output" > "$probe"

  ffmpeg -y -i "$output" -vf \
    "fps=1/4,scale=270:480:force_original_aspect_ratio=decrease,pad=270:480:(ow-iw)/2:(oh-ih)/2:color=0x07192e,tile=4x2:padding=8:margin=8" \
    -frames:v 1 -q:v 2 "$CONTACT_DIR/${slug}-contact-sheet.jpg"
}

build_one "video-01-suivi-disperse" 27 205
build_one "video-02-programme-vs-suivi" 25 150
build_one "video-03-creer-assigner-suivre" 31 135

printf '%s\n' "Exports créés dans $OUT_DIR"
