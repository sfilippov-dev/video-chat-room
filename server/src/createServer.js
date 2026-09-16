import http from 'node:http';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import express from 'express';
import { Server } from 'socket.io';

import { DEV_CLIENT_ORIGIN, IS_PRODUCTION } from './config.js';
import { registerHandlers } from './socket/handlers.js';

/** Собранный клиент: появляется после `npm run build`. */
const CLIENT_DIST = fileURLToPath(new URL('../../client/dist/', import.meta.url));

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

  serveClient(app);

  return { app, httpServer, io };
}

/**
 * Раздача собранного клиента тем же процессом: приложение поднимается одной
 * командой и живёт на одном origin, так что сигналингу не нужен CORS.
 *
 * SPA-fallback обязателен из-за ссылок-приглашений: прямой заход по `/<roomId>`
 * — это не файл на диске, а маршрут внутри React, и вернуть на него нужно
 * index.html, а не 404.
 *
 * В разработке каталога сборки нет — тогда раздавать нечего, клиент отдаёт Vite.
 */
function serveClient(app) {
  const indexFile = path.join(CLIENT_DIST, 'index.html');
  if (!existsSync(indexFile)) return;

  app.use(express.static(CLIENT_DIST));

  app.get('*', (req, res) => {
    res.sendFile(indexFile);
  });
}
