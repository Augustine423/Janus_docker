# RTP Stream Server

This server detects RTP streams, records them using FFmpeg, and uploads the results to S3.

## Setup
1. Copy `.env.example` to `.env` and fill in your environment values.
2. Install dependencies: `npm install`
3. Start server: `node server.js`

## Endpoints
- `POST /start/:mid` — Start recording a stream.
- `POST /stop/:mid` — Stop recording.
- `GET /streams` — View all streams.
- `GET /live-streams` — View live recordings.
