/**
 * Конфигурация сервера. Все магические числа проекта живут здесь.
 */
export const PORT = Number(process.env.PORT) || 3001;

/** Адрес dev-сервера Vite: в режиме разработки клиент живёт на другом порту. */
export const DEV_CLIENT_ORIGIN = process.env.DEV_CLIENT_ORIGIN || 'http://localhost:5173';

export const IS_PRODUCTION = process.env.NODE_ENV === 'production';
