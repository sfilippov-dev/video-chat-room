/**
 * Конфигурация сервера. Все магические числа проекта живут здесь.
 */
export const PORT = Number(process.env.PORT) || 3001;

/** Адрес dev-сервера Vite: в режиме разработки клиент живёт на другом порту. */
export const DEV_CLIENT_ORIGIN = process.env.DEV_CLIENT_ORIGIN || 'http://localhost:5173';

export const IS_PRODUCTION = process.env.NODE_ENV === 'production';

/**
 * Лимит участников комнаты. Следствие топологии mesh: при N участниках в
 * комнате N*(N-1)/2 соединений, и каждый клиент отдаёт свой поток отдельной
 * копией каждому собеседнику. На четверых это 6 соединений и 3 исходящих
 * потока с клиента — потолок для обычного домашнего канала.
 */
export const MAX_PARTICIPANTS = 4;

/** Имя участника: длина и разрешённый алфавит (PRD п. 38). */
export const MAX_NAME_LENGTH = 30;

/** Длина сообщения чата (PRD п. 40, разумное умолчание). */
export const MAX_MESSAGE_LENGTH = 1000;

/** Длина идентификатора комнаты: гигиена ключей Map, а не безопасность. */
export const MAX_ROOM_ID_LENGTH = 64;

/**
 * Анти-флуд в чате: токен-бакет на сокет. Значения подобраны так, чтобы
 * не мешать живой переписке, но отсекать автоматическую отправку.
 */
export const RATE_LIMIT = {
  BURST_MESSAGES: 5,
  BURST_WINDOW_MS: 2000,
  MINUTE_MESSAGES: 30,
  MINUTE_WINDOW_MS: 60000,
};
