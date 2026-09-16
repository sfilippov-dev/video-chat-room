import { describe, it, expect } from 'vitest';

import { createRateLimiter } from './rateLimiter.js';

const LIMITS = {
  BURST_MESSAGES: 3,
  BURST_WINDOW_MS: 1000,
  MINUTE_MESSAGES: 5,
  MINUTE_WINDOW_MS: 10000,
};

describe('ограничитель частоты', () => {
  it('пропускает сообщения в пределах короткого окна', () => {
    const limiter = createRateLimiter(LIMITS);
    const now = 1_000_000;

    expect(limiter.tryConsume(now)).toBe(true);
    expect(limiter.tryConsume(now + 10)).toBe(true);
    expect(limiter.tryConsume(now + 20)).toBe(true);
    expect(limiter.tryConsume(now + 30)).toBe(false);
  });

  it('после истечения короткого окна снова пропускает', () => {
    const limiter = createRateLimiter(LIMITS);
    const now = 1_000_000;

    for (let i = 0; i < LIMITS.BURST_MESSAGES; i += 1) limiter.tryConsume(now);
    expect(limiter.tryConsume(now + 100)).toBe(false);
    expect(limiter.tryConsume(now + LIMITS.BURST_WINDOW_MS + 1)).toBe(true);
  });

  it('длинное окно ловит равномерный флуд, проходящий сквозь короткое', () => {
    const limiter = createRateLimiter(LIMITS);
    let now = 1_000_000;

    // По одному сообщению раз в секунду: короткое окно такое не замечает.
    const results = [];
    for (let i = 0; i < LIMITS.MINUTE_MESSAGES + 1; i += 1) {
      results.push(limiter.tryConsume(now));
      now += LIMITS.BURST_WINDOW_MS + 1;
    }

    expect(results.filter(Boolean)).toHaveLength(LIMITS.MINUTE_MESSAGES);
    expect(results.at(-1)).toBe(false);
  });

  it('ограничители независимы друг от друга', () => {
    const first = createRateLimiter(LIMITS);
    const second = createRateLimiter(LIMITS);
    const now = 1_000_000;

    for (let i = 0; i < LIMITS.BURST_MESSAGES; i += 1) first.tryConsume(now);

    expect(first.tryConsume(now)).toBe(false);
    expect(second.tryConsume(now)).toBe(true);
  });
});
