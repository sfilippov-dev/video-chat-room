import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { EVENTS, ERROR_CODES, MESSAGE_TYPES } from './events.js';
import {
  startTestServer,
  connectClient,
  join,
  waitForEvent,
  collectEvents,
  settle,
  closeAll,
} from './testHarness.js';
import { resetRooms } from '../rooms.js';
import { RATE_LIMIT } from '../config.js';

const ROOM = 'test-room';

let server;
let sockets = [];

async function newClient() {
  const socket = await connectClient(server.url);
  sockets.push(socket);
  return socket;
}

function send(socket, text) {
  return new Promise((resolve) => {
    socket.emit(EVENTS.CHAT_SEND, { text }, resolve);
  });
}

beforeEach(async () => {
  resetRooms();
  server = await startTestServer();
  sockets = [];
});

afterEach(async () => {
  closeAll(...sockets);
  await server.close();
});

describe('отправка сообщений', () => {
  it('сообщение доходит до всех участников комнаты', async () => {
    const alice = await newClient();
    const bob = await newClient();
    await join(alice, ROOM, 'Алиса');
    await join(bob, ROOM, 'Боб');
    await settle();

    const incoming = waitForEvent(bob, EVENTS.CHAT_MESSAGE);
    const ack = await send(alice, 'привет');

    expect(ack).toEqual({ ok: true });
    expect(await incoming).toMatchObject({
      type: MESSAGE_TYPES.USER,
      authorId: alice.id,
      name: 'Алиса',
      text: 'привет',
    });
  });

  it('автор получает своё же сообщение — порядок ленты у всех одинаковый', async () => {
    const alice = await newClient();
    await join(alice, ROOM, 'Алиса');
    await settle();

    const own = waitForEvent(alice, EVENTS.CHAT_MESSAGE);
    await send(alice, 'привет');

    expect((await own).text).toBe('привет');
  });

  it('у сообщения есть идентификатор и серверная отметка времени', async () => {
    const alice = await newClient();
    await join(alice, ROOM, 'Алиса');
    await settle();

    const incoming = waitForEvent(alice, EVENTS.CHAT_MESSAGE);
    const before = Date.now();
    await send(alice, 'привет');
    const message = await incoming;

    expect(typeof message.id).toBe('string');
    expect(message.ts).toBeGreaterThanOrEqual(before);
  });

  it('пробелы по краям обрезаются', async () => {
    const alice = await newClient();
    await join(alice, ROOM, 'Алиса');
    await settle();

    const incoming = waitForEvent(alice, EVENTS.CHAT_MESSAGE);
    await send(alice, '   привет   ');

    expect((await incoming).text).toBe('привет');
  });

  it('разметка передаётся как текст: экранирование — задача рендера', async () => {
    const alice = await newClient();
    await join(alice, ROOM, 'Алиса');
    await settle();

    const incoming = waitForEvent(alice, EVENTS.CHAT_MESSAGE);
    await send(alice, '<script>alert(1)</script>');

    expect((await incoming).text).toBe('<script>alert(1)</script>');
  });

  it('пустое сообщение и одни пробелы отклоняются', async () => {
    const alice = await newClient();
    await join(alice, ROOM, 'Алиса');

    expect(await send(alice, '')).toEqual({ ok: false, code: ERROR_CODES.EMPTY_MESSAGE });
    expect(await send(alice, '    ')).toEqual({ ok: false, code: ERROR_CODES.EMPTY_MESSAGE });
  });

  it('слишком длинное сообщение отклоняется', async () => {
    const alice = await newClient();
    await join(alice, ROOM, 'Алиса');

    expect(await send(alice, 'а'.repeat(1001))).toEqual({
      ok: false,
      code: ERROR_CODES.MESSAGE_TOO_LONG,
    });
  });

  it('имя автора берётся с сервера, а не из полезной нагрузки', async () => {
    const alice = await newClient();
    const bob = await newClient();
    await join(alice, ROOM, 'Алиса');
    await join(bob, ROOM, 'Боб');
    await settle();

    const incoming = waitForEvent(bob, EVENTS.CHAT_MESSAGE);
    alice.emit(EVENTS.CHAT_SEND, {
      text: 'я не Алиса',
      name: 'Боб',
      authorId: bob.id,
      ts: 0,
    });
    const message = await incoming;

    expect(message.name).toBe('Алиса');
    expect(message.authorId).toBe(alice.id);
    expect(message.ts).toBeGreaterThan(0);
  });

  it('сообщение от сокета вне комнаты отклоняется', async () => {
    const alice = await newClient();
    await join(alice, ROOM, 'Алиса');
    const outsider = await newClient();
    await settle();

    const aliceEvents = collectEvents(alice, EVENTS.CHAT_MESSAGE);
    const ack = await send(outsider, 'подслушиваю');

    expect(ack).toEqual({ ok: false, code: ERROR_CODES.INVALID_ROOM });
    expect(await aliceEvents).toEqual([]);
  });

  it('сообщение не утекает в соседнюю комнату', async () => {
    const alice = await newClient();
    const stranger = await newClient();
    await join(alice, ROOM, 'Алиса');
    await join(stranger, 'other-room', 'Чужак');
    await settle();

    const strangerEvents = collectEvents(stranger, EVENTS.CHAT_MESSAGE);
    await send(alice, 'секрет');

    expect(await strangerEvents).toEqual([]);
  });
});

describe('история чата', () => {
  it('вошедший позже видит переписку, отправленную до его входа', async () => {
    const alice = await newClient();
    await join(alice, ROOM, 'Алиса');
    await send(alice, 'первое');
    await send(alice, 'второе');
    await settle();

    const bob = await newClient();
    const ack = await join(bob, ROOM, 'Боб');

    const userMessages = ack.messages.filter((m) => m.type === MESSAGE_TYPES.USER);
    expect(userMessages.map((m) => m.text)).toEqual(['первое', 'второе']);
  });

  it('история уходит только новичку: у остальных лента не дублируется', async () => {
    const alice = await newClient();
    await join(alice, ROOM, 'Алиса');
    await send(alice, 'первое');
    await settle();

    const aliceMessages = collectEvents(alice, EVENTS.CHAT_MESSAGE, 300);
    const bob = await newClient();
    await join(bob, ROOM, 'Боб');

    expect(await aliceMessages).toEqual([]);
  });

  it('системные и пользовательские записи лежат в одной ленте по времени', async () => {
    const alice = await newClient();
    await join(alice, ROOM, 'Алиса');
    await send(alice, 'привет');
    await settle();

    const bob = await newClient();
    await join(bob, ROOM, 'Боб');
    await send(bob, 'и тебе');
    await settle();

    const carol = await newClient();
    const ack = await join(carol, ROOM, 'Кэрол');

    expect(ack.messages.map((m) => `${m.type}:${m.text}`)).toEqual([
      'system:joined',
      'user:привет',
      'system:joined',
      'user:и тебе',
    ]);
  });
});

describe('защита от флуда', () => {
  it('серия сообщений подряд отсекается кодом RATE_LIMITED', async () => {
    const alice = await newClient();
    await join(alice, ROOM, 'Алиса');

    const acks = [];
    for (let i = 0; i < RATE_LIMIT.BURST_MESSAGES + 3; i += 1) {
      acks.push(await send(alice, `сообщение ${i}`));
    }

    expect(acks.filter((ack) => ack.ok)).toHaveLength(RATE_LIMIT.BURST_MESSAGES);
    expect(acks.at(-1)).toEqual({ ok: false, code: ERROR_CODES.RATE_LIMITED });
  });

  it('отсечённое сообщение не попадает ни в ленту, ни в историю', async () => {
    const alice = await newClient();
    const bob = await newClient();
    await join(alice, ROOM, 'Алиса');
    await join(bob, ROOM, 'Боб');
    await settle();

    for (let i = 0; i < RATE_LIMIT.BURST_MESSAGES; i += 1) {
      await send(alice, `сообщение ${i}`);
    }
    await settle();

    const bobMessages = collectEvents(bob, EVENTS.CHAT_MESSAGE, 200);
    await send(alice, 'лишнее');

    expect(await bobMessages).toEqual([]);
  });

  it('ограничитель у каждого участника свой', async () => {
    const alice = await newClient();
    const bob = await newClient();
    await join(alice, ROOM, 'Алиса');
    await join(bob, ROOM, 'Боб');

    for (let i = 0; i < RATE_LIMIT.BURST_MESSAGES; i += 1) {
      await send(alice, `сообщение ${i}`);
    }

    expect(await send(alice, 'лишнее')).toEqual({ ok: false, code: ERROR_CODES.RATE_LIMITED });
    expect(await send(bob, 'а я молчал')).toEqual({ ok: true });
  });
});
