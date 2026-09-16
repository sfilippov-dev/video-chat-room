import { RATE_LIMIT } from './config.js';

/**
 * Ограничитель частоты сообщений — по одному на сокет.
 *
 * Два окна сразу: короткое отсекает залипшую клавишу и скрипт в консоли,
 * длинное — равномерный флуд, который в короткое окно укладывается.
 *
 * Хранится в замыкании самого сокета, поэтому чистить ничего не нужно:
 * состояние уходит вместе с соединением.
 */
export function createRateLimiter(limits = RATE_LIMIT) {
  let burst = [];
  let minute = [];

  return {
    /** @returns {boolean} true — сообщение можно пропустить */
    tryConsume(now = Date.now()) {
      burst = burst.filter((ts) => now - ts < limits.BURST_WINDOW_MS);
      minute = minute.filter((ts) => now - ts < limits.MINUTE_WINDOW_MS);

      if (burst.length >= limits.BURST_MESSAGES) return false;
      if (minute.length >= limits.MINUTE_MESSAGES) return false;

      burst.push(now);
      minute.push(now);
      return true;
    },
  };
}
