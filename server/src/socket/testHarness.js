import { io as createClient } from 'socket.io-client';

import { createServer } from '../createServer.js';
import { EVENTS } from './events.js';

/**
 * Утилиты для интеграционных тестов: поднимают настоящий сервер на свободном
 * порту и говорят с ним настоящим клиентом Socket.io. Моки здесь были бы
 * бесполезны — проверяем как раз проводку событий.
 */
export async function startTestServer() {
  const { httpServer, io } = createServer();

  await new Promise((resolve) => {
    httpServer.listen(0, resolve);
  });

  const { port } = httpServer.address();

  return {
    url: `http://localhost:${port}`,
    async close() {
      io.close();
      await new Promise((resolve) => {
        httpServer.close(resolve);
      });
    },
  };
}

function connectOnce(url) {
  const socket = createClient(url, {
    transports: ['websocket'],
    reconnection: false,
    forceNew: true,
  });

  return new Promise((resolve, reject) => {
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', (error) => {
      socket.close();
      reject(error);
    });
  });
}

/**
 * Рукопожатие websocket изредка срывается на загруженной машине: восемь тестовых
 * файлов поднимают свои серверы параллельно, а `reconnection: false` не оставляет
 * клиенту второго шанса. Для теста это шум, а не находка, поэтому пара повторов —
 * дешевле и честнее, чем красный прогон на ровном месте. Настоящий отказ сервера
 * переживёт все попытки и всё равно уронит тест.
 */
export async function connectClient(url, attempts = 3) {
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await connectOnce(url);
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await settle(50);
    }
  }

  throw lastError;
}

export function join(socket, roomId, name) {
  return new Promise((resolve) => {
    socket.emit(EVENTS.JOIN, { roomId, name }, resolve);
  });
}

/** Ждёт одно событие с таймаутом, чтобы падение теста было читаемым. */
export function waitForEvent(socket, event, timeoutMs = 1000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, onEvent);
      reject(new Error(`Событие "${event}" не пришло за ${timeoutMs} мс`));
    }, timeoutMs);

    function onEvent(payload) {
      clearTimeout(timer);
      resolve(payload);
    }

    socket.once(event, onEvent);
  });
}

/** Собирает все события указанного типа за отведённое время. */
export function collectEvents(socket, event, windowMs = 200) {
  const received = [];
  socket.on(event, (payload) => received.push(payload));

  return new Promise((resolve) => {
    setTimeout(() => resolve(received), windowMs);
  });
}

/**
 * Ack на join приходит раньше широковещательных событий этого же входа.
 * Пауза даёт им долететь, чтобы подписка в тесте ловила события следующего
 * действия, а не предыдущего.
 */
export function settle(ms = 60) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function closeAll(...sockets) {
  sockets.filter(Boolean).forEach((socket) => {
    socket.removeAllListeners();
    socket.disconnect();
  });
}
