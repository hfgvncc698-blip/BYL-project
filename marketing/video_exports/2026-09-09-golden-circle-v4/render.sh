#!/bin/zsh
set -euo pipefail

ROOT="${0:A:h}"

/Users/tommarie/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node "$ROOT/build_assets.mjs"

ffmpeg -y -hide_banner -loglevel error \
  -i "$ROOT/rushes/clip-01-why-original.mp4" \
  -loop 1 -t 4.4 -i "$ROOT/assets/product-proof.png" \
  -i "$ROOT/rushes/clip-03-what-original.mp4" \
  -loop 1 -t 6.3 -i "$ROOT/assets/cta.png" \
  -i "$ROOT/voice.mp3" \
  -filter_complex "[0:v]trim=0:6.8,setpts=PTS-STARTPTS,scale=1080:1920,setsar=1,fps=30,format=yuv420p[v0];[1:v]scale=1120:1991,zoompan=z='min(zoom+0.00045,1.055)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=132:s=1080x1920:fps=30,trim=duration=4.4,setpts=PTS-STARTPTS,setsar=1,format=yuv420p[v1];[2:v]trim=0:8,setpts=PTS-STARTPTS,scale=1080:1920,setsar=1,fps=30,format=yuv420p[v2];[3:v]scale=1080:1920,zoompan=z='min(zoom+0.00025,1.025)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=189:s=1080x1920:fps=30,trim=duration=6.3,setpts=PTS-STARTPTS,setsar=1,format=yuv420p[v3];[v0][v1][v2][v3]concat=n=4:v=1:a=0[vout];[0:a]atrim=0:6.8,asetpts=PTS-STARTPTS,volume=0.14[a0];anullsrc=r=48000:cl=stereo,atrim=duration=4.4[as1];[2:a]atrim=0:8,asetpts=PTS-STARTPTS,volume=0.14[a2];anullsrc=r=48000:cl=stereo,atrim=duration=6.3[as3];[a0][as1][a2][as3]concat=n=4:v=0:a=1[bed];[4:a]aresample=48000,adelay=250|250,volume=1.25[voice];[bed][voice]amix=inputs=2:duration=first:dropout_transition=0,loudnorm=I=-15:TP=-1.5:LRA=9[aout]" \
  -map "[vout]" -map "[aout]" -c:v libx264 -preset medium -crf 18 -pix_fmt yuv420p \
  -c:a aac -b:a 192k -movflags +faststart "$ROOT/base.mp4"

ffmpeg -y -hide_banner -loglevel error \
  -i "$ROOT/base.mp4" \
  -i "$ROOT/assets/hook-01.png" -i "$ROOT/assets/hook-02.png" \
  -i "$ROOT/assets/hook-03.png" -i "$ROOT/assets/hook-04.png" \
  -i "$ROOT/assets/sub-01.png" -i "$ROOT/assets/sub-02.png" \
  -i "$ROOT/assets/sub-03.png" -i "$ROOT/assets/sub-04.png" \
  -i "$ROOT/assets/sub-05.png" -i "$ROOT/assets/sub-06.png" \
  -i "$ROOT/assets/sub-07.png" -i "$ROOT/assets/sub-08.png" \
  -filter_complex "[0:v][1:v]overlay=enable='between(t,0.10,3.45)'[v1];[v1][2:v]overlay=enable='between(t,3.45,6.80)'[v2];[v2][3:v]overlay=enable='between(t,11.20,15.10)'[v3];[v3][4:v]overlay=enable='between(t,15.10,19.20)'[v4];[v4][5:v]overlay=enable='between(t,0.15,3.45)'[v5];[v5][6:v]overlay=enable='between(t,3.45,6.80)'[v6];[v6][7:v]overlay=enable='between(t,6.80,11.20)'[v7];[v7][8:v]overlay=enable='between(t,11.20,14.25)'[v8];[v8][9:v]overlay=enable='between(t,14.25,16.25)'[v9];[v9][10:v]overlay=enable='between(t,16.25,20.10)'[v10];[v10][11:v]overlay=enable='between(t,20.10,22.05)'[v11];[v11][12:v]overlay=enable='between(t,22.05,25.40)'[vout]" \
  -map "[vout]" -map 0:a -c:v libx264 -preset medium -crf 18 -pix_fmt yuv420p \
  -c:a copy -movflags +faststart -shortest "$ROOT/byl-golden-circle-v4.mp4"

