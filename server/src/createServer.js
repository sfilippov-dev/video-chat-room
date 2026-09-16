import http from 'node:http';

import express from 'express';
import { Server } from 'socket.io';

import { DEV_CLIENT_ORIGIN, IS_PRODUCTION } from './config.js';
import { registerHandlers } from './socket/handlers.js';

/**
 * Собирает приложение целиком, но не слушает порт: слушать решает вызывающий.
 * Благодаря этому интеграционные тесты поднимают настоящий сервер на свободном
 * порту и говорят с ним настоящим клиентом Socket.io.
 */
export function createServer() {
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
    registerHandlers(io, socket);
  });

  return { app, httpServer, io };
}
