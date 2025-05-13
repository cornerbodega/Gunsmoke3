#!/bin/bash

set -e
echo "🚀 Starting stitching process"

# Confirm gsutil is available
echo "✅ gsutil version: $(gsutil version)"
echo "📍 gsutil path: $(which gsutil)"

# Setup work directory
mkdir -p /work && cd /work

# Get metadata
SCENE_ID=$(curl -s -H "Metadata-Flavor: Google" \
  http://metadata.google.internal/computeMetadata/v1/instance/attributes/scene-id)
SUPABASE_KEY=$(curl -s -H "Metadata-Flavor: Google" \
  http://metadata.google.internal/computeMetadata/v1/project/attributes/supabase-key)
SUPABASE_URL="https://zibmgusmsqnpqacuygec.supabase.co"  # Replace with your project URL

BUCKET="gs3_audio_files"
TARGET_DIR="video/alameda-${SCENE_ID}"
TARGET_PATH="gs://${BUCKET}/${TARGET_DIR}/*.mp4"

echo "🔍 Looking for MP4s at: $TARGET_PATH"

# Diagnostic listing
gsutil ls "gs://${BUCKET}/${TARGET_DIR}/" || echo "❌ Failed to list folder"
gsutil ls "$TARGET_PATH" || echo "❌ No MP4 files found"

# Download videos
echo "📥 Downloading MP4s..."
gsutil cp "$TARGET_PATH" .

# Check if files were downloaded
if ! ls *.mp4 1> /dev/null 2>&1; then
  echo "❌ No MP4s found after copy. Exiting."
  shutdown -h now
  exit 1
fi

# Create concat.txt for ffmpeg
ls *.mp4 | sort | awk '{print "file \x27" $0 "\x27"}' > concat.txt

# Run FFmpeg
echo "🎞️ Running FFmpeg to stitch videos..."
ffmpeg -f concat -safe 0 -i concat.txt -c copy stitched.mp4

# Upload result back to the same input folder
OUTPUT_PATH="gs://${BUCKET}/${TARGET_DIR}/gunsmoke3-output-video.mp4"
echo "☁️ Uploading stitched video to: $OUTPUT_PATH"
gsutil -h "x-goog-acl:bucket-owner-full-control" cp stitched.mp4 "$OUTPUT_PATH"

# Generate public URL (adjust if signed URLs used)
PUBLIC_URL="https://storage.googleapis.com/${BUCKET}/${TARGET_DIR}/gunsmoke3-output-video.mp4"

# Post to Supabase
echo "📝 Saving record to Supabase..."
echo "📦 Supabase payload:"
echo '{
  "scene_id": "'"${SCENE_ID}"'",
  "video_type": "stitched",
  "video_url": "'"${PUBLIC_URL}"'",
  "gcs_path": "'"${TARGET_DIR}/gunsmoke3-output-video.mp4"'"
}'

RESPONSE=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST "${SUPABASE_URL}/rest/v1/gs3_videos" \
  -H "apikey: ${SUPABASE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "scene_id": "'"${SCENE_ID}"'",
    "video_type": "stitched",
    "video_url": "'"${PUBLIC_URL}"'",
    "gcs_path": "'"${TARGET_DIR}/gunsmoke3-output-video.mp4"'"
  }')

BODY=$(echo "$RESPONSE" | sed -e 's/HTTP_STATUS\:.*//g')
STATUS=$(echo "$RESPONSE" | tr -d '\n' | sed -e 's/.*HTTP_STATUS://')

echo "📬 Supabase response:"
echo "$BODY"
echo "📡 Status code: $STATUS"

if [[ "$STATUS" -ge 300 ]]; then
  echo "❌ Supabase POST failed with status $STATUS"
  shutdown -h now
  exit 1
fi
echo "✅ Supabase POST successful!"

echo "🧹 Deleting original part videos..."
rm *.mp4
echo "🧹 Local MP4s deleted."
gsutil rm "gs://${BUCKET}/${TARGET_DIR}/[0-9]*.mp4" || echo "⚠️ GCS part deletion failed (likely already deleted)"

echo "✅ Done. Shutting down"
shutdown -h now
