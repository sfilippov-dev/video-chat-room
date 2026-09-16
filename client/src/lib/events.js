/**
 * Словарь имён событий Socket.io — контракт между сервером и клиентом.
 *
 * Зеркало server/src/socket/events.js. При изменении одного файла второй
 * обязан меняться синхронно.
 */
export const EVENTS = {
  // Клиент → сервер
  JOIN: 'join',
  LEAVE: 'leave',
  MEDIA_STATE: 'media-state',
  CHAT_SEND: 'chat:send',

  // Сервер → клиент
  PEER_JOINED: 'peer-joined',
  PEER_LEFT: 'peer-left',
  PARTICIPANTS: 'participants',
  PEER_MEDIA_STATE: 'peer-media-state',
  CHAT_MESSAGE: 'chat:message',
  CHAT_SYSTEM: 'chat:system',

  // Сигналинг WebRTC (в обе стороны, сервер работает реле)
  SIGNAL_OFFER: 'signal:offer',
  SIGNAL_ANSWER: 'signal:answer',
  SIGNAL_ICE: 'signal:ice',
};

/** Коды отказов, приходящие в ack-ответах. */
export const ERROR_CODES = {
  ROOM_FULL: 'ROOM_FULL',
  INVALID_NAME: 'INVALID_NAME',
  INVALID_ROOM: 'INVALID_ROOM',
  EMPTY_MESSAGE: 'EMPTY_MESSAGE',
  MESSAGE_TOO_LONG: 'MESSAGE_TOO_LONG',
  RATE_LIMITED: 'RATE_LIMITED',
};

/** Типы записей в ленте чата. */
export const MESSAGE_TYPES = {
  USER: 'user',
  SYSTEM: 'system',
};

/** Коды системных событий; текст для них собирается на клиенте. */
export const SYSTEM_EVENTS = {
  JOINED: 'joined',
  LEFT: 'left',
};
