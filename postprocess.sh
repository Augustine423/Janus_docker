#!/bin/bash
RECORDINGS_DIR="/opt/janus/recordings"

echo "Looking for .mjr files in $RECORDINGS_DIR"

for mjr in "$RECORDINGS_DIR"/*.mjr; do
  [ -e "$mjr" ] || continue
  base="${mjr%.mjr}"
  webm="${base}.webm"
  mp4="${base}.mp4"

  echo "Converting $mjr → $webm"
  /opt/janus/bin/janus-pp-rec "$mjr" "$webm"

  echo "Converting $webm → $mp4"
  ffmpeg -y -i "$webm" -c:v libx264 -preset fast "$mp4"

  echo "Finished: $mp4"
done
