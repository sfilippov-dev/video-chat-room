import http from 'node:http';

import express from 'express';
import { Server } from 'socket.io';

import { PORT, DEV_CLIENT_ORIGIN, IS_PRODUCTION } from './config.js';

const app = express();
const httpServer = http.createServer(app);

app.get('/healthz', (req, res) => {
  res.json({ status: 'ok' });
});

const io = new Server(httpServer, {
  // В разработке клиент отдаётся Vite с другого порта. В production статику
  // раздаёт этот же процесс, и запрос приходит с того же origin.
  cors: IS_PRODUCTION ? undefined : { origin: DEV_CLIENT_ORIGIN },
});

io.on('connection', (socket) => {
  console.log(`[socket] connected: ${socket.id}`);

  socket.on('disconnect', (reason) => {
    console.log(`[socket] disconnected: ${socket.id} (${reason})`);
  });
});

httpServer.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`);
});
