require('dotenv').config();
const express = require('express');
const { exec } = require('child_process');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const mysql = require('mysql2/promise');
const { promisify } = require('util');
const { format } = require('date-fns');
const dgram = require('dgram');
const fs = require('fs');
const execAsync = promisify(exec);

const app = express();
const port = 3000;

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'your_password',
  database: process.env.DB_NAME || 'rtp_streams'
};

const activeStreams = new Map();
const rtpSourceIps = new Map();

function generateStreamConfig(numStreams = 1000, startPort = 5001) {
  const config = [];
  for (let i = 1; i <= numStreams; i++) {
    const streamId = i;
    const mid = `VT${String(streamId).padStart(3, '0')}`;
    const port = startPort + (i - 1);
    const label = String(port);
    const stream = {
      type: 'rtp',
      description: `Stream ${streamId}`,
      media: [
        {
          type: 'video',
          port: port,
          mid: mid,
          label: label,
          pt: 100,
          codec: 'h264',
          camera_ip: 'unknown',
          sender_port: null  // new field for sender's source port
        }
      ]
    };
    config.push(stream);
  }
  return config;
}

function detectRtpSourceIp(port, streamData) {
  return new Promise((resolve) => {
    const socket = dgram.createSocket('udp4');
    let detected = false;
    let isClosed = false;

    const safeClose = () => {
      if (!isClosed) {
        socket.close();
        isClosed = true;
      }
    };

    socket.on('message', async (msg, rinfo) => {
      if (detected) return;
      detected = true;

      const sourceIp = rinfo.address;
      const senderPort = rinfo.port;
      console.log(`✅ RTP stream from IP ${sourceIp} (sender port ${senderPort}) connected on port ${port}`);
      rtpSourceIps.set(port, sourceIp);
      safeClose();

      streamData.camera_ip = sourceIp;
      streamData.sender_port = senderPort;

      try {
        const connection = await mysql.createConnection(dbConfig);
        await connection.query(
          `INSERT INTO streams (mid, camera_ip, port, sender_port, label, pt, codec)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
           camera_ip = ?, port = ?, sender_port = ?, label = ?, pt = ?, codec = ?`,
          [
            streamData.mid, streamData.camera_ip, streamData.port, streamData.sender_port, streamData.label, streamData.pt, streamData.codec,
            streamData.camera_ip, streamData.port, streamData.sender_port, streamData.label, streamData.pt, streamData.codec
          ]
        );
        await connection.end();
        console.log(`📦 Inserted/updated database for stream ${streamData.mid}`);
      } catch (error) {
        console.error(`❌ DB insert failed for ${streamData.mid}:`, error);
      }

      try {
        await startRecording(streamData.mid, streamData.camera_ip, port, streamData.label, streamData.pt, streamData.codec);
        console.log(`🎥 Recording started for ${streamData.mid}`);

        setTimeout(async () => {
          try {
            await stopRecording(streamData.mid);
            console.log(`🛑 Recording stopped for ${streamData.mid}`);
          } catch (err) {
            console.error(`❌ Error stopping recording for ${streamData.mid}:`, err);
          }
        }, 60000);
      } catch (err) {
        console.error(`❌ FFmpeg failed for ${streamData.mid}:`, err);
      }

      resolve(sourceIp);
    });

    socket.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.warn(`⚠️ Port ${port} already in use, skipping`);
      } else {
        console.error(`❌ UDP error on port ${port}:`, err);
      }
      safeClose();
      resolve(null);
    });

    socket.bind(port, '0.0.0.0', () => {
      console.log(`🔍 Listening for RTP on port ${port} on 0.0.0.0`);
    });

    setTimeout(() => {
      if (!detected) {
        console.warn(`⏱ No RTP packets received on port ${port}`);
        safeClose();
        resolve(null);
      }
    }, 10000);
  });
}

async function initDatabase() {
  try {
    const connection = await mysql.createConnection({ ...dbConfig, database: undefined });
    console.log('Connected to MySQL');
    await connection.query(`CREATE DATABASE IF NOT EXISTS ${dbConfig.database}`);
    await connection.query(`USE ${dbConfig.database}`);
    await connection.query(`
      CREATE TABLE IF NOT EXISTS streams (
        mid VARCHAR(50) PRIMARY KEY,
        camera_ip VARCHAR(45),
        port INT NOT NULL,
        sender_port INT NULL,
        label VARCHAR(50),
        pt INT,
        codec VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await connection.end();
    console.log('Streams table ready');

    const streams = generateStreamConfig(1000, 5001);
    const tasks = streams.map((s) => detectRtpSourceIp(s.media[0].port, s.media[0]));
    await Promise.all(tasks);
    console.log('All detection tasks complete');
  } catch (err) {
    console.error('Database initialization error:', err);
    process.exit(1);
  }
}

async function startRecording(mid, cameraIp, port, label, pt, codec) {
  const timestamp = format(new Date(), 'd-MMMM-yyyy-h-mm-a');
  const outputFile = `${timestamp}-${mid}.mp4`;

  if (activeStreams.has(mid)) throw new Error(`Stream ${mid} already active`);

  const ffmpegCommand = `ffmpeg -i rtp://${cameraIp}:${port} -c:v copy -c:a aac -f mp4 ${outputFile}`;
  const process = exec(ffmpegCommand);

  activeStreams.set(mid, {
    process,
    outputFile,
    config: { mid, label, port, pt, codec, camera_ip: cameraIp }
  });

  process.stderr.on('data', (data) => {
    console.error(`FFmpeg stderr for ${mid}: ${data}`);
  });

  return outputFile;
}

async function stopRecording(mid) {
  if (!activeStreams.has(mid)) throw new Error(`No active stream for ${mid}`);

  const { process, outputFile } = activeStreams.get(mid);
  process.kill('SIGINT');

  await new Promise((resolve, reject) => {
    process.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg exited with code ${code}`));
    });
  });

  await uploadToS3(outputFile, mid);
  activeStreams.delete(mid);
  return outputFile;
}

async function uploadToS3(filePath, mid) {
  const fileContent = fs.readFileSync(filePath);
  const timestamp = format(new Date(), 'd-MMMM-yyyy-h-mm-a');

  const command = new PutObjectCommand({
    Bucket: process.env.S3_BUCKET || 'your-bucket-name',
    Key: `recordings/${timestamp}-${mid}.mp4`,
    Body: fileContent,
    ContentType: 'video/mp4'
  });

  await s3.send(command);
  console.log(`Uploaded ${filePath} to S3`);
  fs.unlinkSync(filePath);
}

app.use(express.json());

app.post('/start/:mid', async (req, res) => {
  const { mid } = req.params;
  try {
    const connection = await mysql.createConnection(dbConfig);
    const [rows] = await connection.query('SELECT * FROM streams WHERE mid = ?', [mid]);
    await connection.end();

    if (!rows.length) return res.status(404).json({ error: 'Stream not found' });
    const { camera_ip, port, label, pt, codec } = rows[0];
    if (camera_ip === 'unknown') return res.status(400).json({ error: 'RTP IP not detected yet' });

    const outputFile = await startRecording(mid, camera_ip, port, label, pt, codec);
    res.json({ message: 'Recording started', outputFile });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/stop/:mid', async (req, res) => {
  try {
    const outputFile = await stopRecording(req.params.mid);
    res.json({ message: 'Recording stopped', outputFile });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/streams', async (req, res) => {
  try {
    const connection = await mysql.createConnection(dbConfig);
    const [rows] = await connection.query('SELECT mid, camera_ip, port, sender_port, label, pt, codec FROM streams');
    await connection.end();
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/live-streams', (req, res) => {
  const live = Array.from(activeStreams.entries()).map(([mid, stream]) => ({
    mid,
    isLive: true,
    config: stream.config
  }));
  res.json(live);
});

async function startServer() {
  try {
    await initDatabase();
    app.listen(port, () => {
      console.log(`🚀 Server running at http://localhost:${port}`);
    });
  } catch (err) {
    console.error('Startup error:', err);
    process.exit(1);
  }
}

startServer();
