/**
 * Роутинг на два экрана: стартовый и комната. Полноценный роутер здесь был бы
 * зависимостью ради одной строки разбора — путь целиком состоит из
 * идентификатора комнаты.
 */

/** @returns {string|null} идентификатор комнаты из адреса или null для стартового экрана */
export function readRoomIdFromPath(pathname = window.location.pathname) {
  const value = decodeURIComponent(pathname.replace(/^\/+|\/+$/g, ''));
  return value.length > 0 ? value : null;
}

/** Переход на адрес комнаты без перезагрузки страницы. */
export function navigateToRoom(roomId) {
  window.history.pushState({}, '', `/${encodeURIComponent(roomId)}`);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

/** Возврат на стартовый экран. */
export function navigateToStart() {
  window.history.pushState({}, '', '/');
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export function buildRoomUrl(roomId) {
  return `${window.location.origin}/${encodeURIComponent(roomId)}`;
}

/**
 * Идентификатор комнаты — полный UUID, а не короткий читаемый код.
 * Авторизации в продукте нет и вход по чужому идентификатору разрешён, но
 * облегчать угадывание незачем: длинный случайный идентификатор остаётся
 * единственным практическим барьером приватности.
 */
export function createRoomId() {
  return crypto.randomUUID();
}
