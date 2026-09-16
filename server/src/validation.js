import { MAX_NAME_LENGTH, MAX_MESSAGE_LENGTH, MAX_ROOM_ID_LENGTH } from './config.js';
import { ERROR_CODES } from './socket/events.js';

/**
 * Валидация всего, что приходит от клиента.
 *
 * Клиентские проверки существуют только ради подсказок в интерфейсе: их
 * обходят из консоли за десять секунд. Источник правды — этот модуль.
 *
 * Алфавит имени задан белым списком, а не чёрным: перечислять запрещённое —
 * значит гарантированно что-нибудь забыть.
 */
const NAME_ALPHABET = /^[\p{L}\p{N} _-]+$/u;
const ROOM_ID_ALPHABET = /^[A-Za-z0-9_-]+$/;

/**
 * Имя участника: обрезаем до 30 символов и проверяем алфавит (PRD п. 38).
 * Обрезка идёт по кодовым точкам, а не по кодовым единицам, чтобы не разорвать
 * суррогатную пару пополам.
 *
 * @returns {{ok: true, value: string} | {ok: false, code: string}}
 */
export function validateName(raw) {
  if (typeof raw !== 'string') {
    return { ok: false, code: ERROR_CODES.INVALID_NAME };
  }

  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return { ok: false, code: ERROR_CODES.INVALID_NAME };
  }

  const value = [...trimmed].slice(0, MAX_NAME_LENGTH).join('').trim();
  if (value.length === 0 || !NAME_ALPHABET.test(value)) {
    return { ok: false, code: ERROR_CODES.INVALID_NAME };
  }

  return { ok: true, value };
}

/**
 * Текст сообщения чата: непустой после trim, не длиннее лимита.
 *
 * @returns {{ok: true, value: string} | {ok: false, code: string}}
 */
export function validateMessage(raw) {
  if (typeof raw !== 'string') {
    return { ok: false, code: ERROR_CODES.EMPTY_MESSAGE };
  }

  const value = raw.trim();
  if (value.length === 0) {
    return { ok: false, code: ERROR_CODES.EMPTY_MESSAGE };
  }
  if ([...value].length > MAX_MESSAGE_LENGTH) {
    return { ok: false, code: ERROR_CODES.MESSAGE_TOO_LONG };
  }

  return { ok: true, value };
}

/**
 * Идентификатор комнаты. Проверка не ограничивает доступ к комнате — вход по
 * чужому идентификатору разрешён PRD, — а защищает ключи Map от мусора:
 * без неё клиент может засорить память гигантскими ключами.
 *
 * @returns {{ok: true, value: string} | {ok: false, code: string}}
 */
export function validateRoomId(raw) {
  if (typeof raw !== 'string') {
    return { ok: false, code: ERROR_CODES.INVALID_ROOM };
  }

  const value = raw.trim();
  if (value.length === 0 || value.length > MAX_ROOM_ID_LENGTH || !ROOM_ID_ALPHABET.test(value)) {
    return { ok: false, code: ERROR_CODES.INVALID_ROOM };
  }

  return { ok: true, value };
}
