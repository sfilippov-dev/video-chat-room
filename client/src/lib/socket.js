import { io } from 'socket.io-client';

/**
 * Клиент Socket.io. Подключение ленивое: сокет создаётся не при загрузке
 * страницы, а в момент входа в комнату — до этого сервер клиенту не нужен.
 *
 * reconnection: false — осознанно. PRD запрещает автоматическое возвращение
 * участника в звонок: при потере связи он выбывает и возвращается только
 * повторным входом по ссылке.
 */
let socket = null;

export function createSocket() {
  if (socket) return socket;

  socket = io({
    autoConnect: false,
    reconnection: false,
    transports: ['websocket', 'polling'],
  });

  return socket;
}

export function getSocket() {
  return socket;
}

export function destroySocket() {
  if (!socket) return;
  socket.removeAllListeners();
  socket.disconnect();
  socket = null;
}
