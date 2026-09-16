/**
 * Конфигурация клиента.
 */

/**
 * ICE-серверы: только публичные Google STUN, TURN не используется (PRD §5).
 * Два адреса — дешёвая избыточность на случай недоступности одного из них.
 * Следствие отсутствия TURN: пара за строгим симметричным NAT может не
 * соединиться — это обрабатывается как деградация одной плитки, а не всего
 * приложения.
 */
export const ICE_SERVERS = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
];

/** Лимит участников: используется только для подписи "N из 4" в интерфейсе. */
export const MAX_PARTICIPANTS = 4;

/** Ограничения ввода, дублирующие серверную валидацию ради подсказок в UI. */
export const MAX_NAME_LENGTH = 30;
export const MAX_MESSAGE_LENGTH = 1000;

/**
 * Запрашиваемые характеристики камеры. Только ideal: при exact камера без
 * поддержки 720p вернула бы OverconstrainedError вместо того, что может.
 */
export const VIDEO_CONSTRAINTS = {
  width: { ideal: 1280 },
  height: { ideal: 720 },
  frameRate: { ideal: 30 },
};
