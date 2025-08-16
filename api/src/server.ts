import { Queue } from 'bullmq';
import cors from 'cors';
import express from 'express';
import http from 'http';
import { createClient } from 'redis';
import { Server } from 'socket.io';

const app = express();
const server = http.createServer(app);
const io = new Server(server, {});

// Express Setup
app.use(express.json());
app.use(cors());

const PORT = process.env.PORT || 3000;

// Redis Setup
const REDIS_URL = process.env.REDIS_URL || 'redis://redis:6379';
const redis = createClient({ url: REDIS_URL });
const sub = redis.duplicate();

await redis.connect();
await sub.connect();

// BullMQ Setup
const jobQueue = new Queue('sampling-jobs', {
  connection: { url: REDIS_URL },
});

// Redis Pub/Sub
// Listens to progress updates from BullMQ when pub to redis
// So that it can emit progress events using socket.io on sub'd events
sub.pSubscribe('progress:*', (message, channel) => {
  const jobId = channel.split(':')[1];
  io.to(jobId).emit('progress', JSON.parse(message));
});

sub.pSubscribe('complete:*', (message, channel) => {
  const jobId = channel.split(':')[1];
  io.to(jobId).emit('complete', JSON.parse(message));
});

sub.pSubscribe('error:*', (message, channel) => {
  const jobId = channel.split(':')[1];
  io.to(jobId).emit('error', JSON.parse(message));
});


// HTTP
app.post('/sample', async (req, res) => {
  const { polygon, n } = req.body ?? {};
  if (!polygon || !n) {
    return res.status(400).json({ error: 'Missing polygon or n' });
  }

  console.log(`[API] Received sampling request for polygon: ${JSON.stringify(polygon)}, n: ${n}`);

  const job = await jobQueue.add('sample', { polygon, n });
  res.json({ jobId: job.id });

  return {
    jobId: job.id
  };
});

// HTTP - Healthcheck
app.get('/health', (_, res) => res.sendStatus(200));

// Websocket
io.on('connection', (socket) => {
  socket.on('join', (jobId: string) => socket.join(jobId));
});

// Express
server.listen(PORT, () => {
  console.log(`API server listening on port ${PORT}`);
});
