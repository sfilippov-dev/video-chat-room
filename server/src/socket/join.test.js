import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { EVENTS, ERROR_CODES, MESSAGE_TYPES, SYSTEM_EVENTS } from './events.js';
import {
  startTestServer,
  connectClient,
  join,
  waitForEvent,
  collectEvents,
  closeAll,
} from './testHarness.js';
import { resetRooms } from '../rooms.js';

const ROOM = 'test-room';

let server;
let sockets = [];

async function newClient() {
  const socket = await connectClient(server.url);
  sockets.push(socket);
  return socket;
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

describe('join: вход в комнату', () => {
  it('первый участник входит в пустую комнату', async () => {
    const alice = await newClient();

    const ack = await join(alice, ROOM, 'Алиса');

    expect(ack.ok).toBe(true);
    expect(ack.selfId).toBe(alice.id);
    expect(ack.participants).toEqual([]);
    expect(ack.messages).toEqual([]);
  });

  it('вход по неизвестному идентификатору создаёт комнату, а не отказ', async () => {
    const alice = await newClient();
    const ack = await join(alice, '6f1c2b7e-6d2f-4a0e-9d8a-1c2b3d4e5f60', 'Алиса');
    expect(ack.ok).toBe(true);
  });

  it('новичок получает список тех, от кого ждать оффер', async () => {
    const alice = await newClient();
    await join(alice, ROOM, 'Алиса');

    const bob = await newClient();
    const ack = await join(bob, ROOM, 'Боб');

    expect(ack.participants).toEqual([
      { id: alice.id, name: 'Алиса', micOn: true, camOn: true },
    ]);
  });

  it('старожил получает команду инициировать соединение, новичок — нет', async () => {
    const alice = await newClient();
    await join(alice, ROOM, 'Алиса');

    const bob = await newClient();
    const bobEvents = collectEvents(bob, EVENTS.PEER_JOINED);
    const alicePeerJoined = waitForEvent(alice, EVENTS.PEER_JOINED);

    await join(bob, ROOM, 'Боб');

    // Оффер шлёт тот, кто уже был в комнате: защита от glare.
    expect(await alicePeerJoined).toEqual({
      id: bob.id,
      name: 'Боб',
      micOn: true,
      camOn: true,
    });
    expect(await bobEvents).toEqual([]);
  });

  it('список участников обновляется у всех', async () => {
    const alice = await newClient();
    await join(alice, ROOM, 'Алиса');

    const bob = await newClient();
    const aliceList = waitForEvent(alice, EVENTS.PARTICIPANTS);
    const bobList = waitForEvent(bob, EVENTS.PARTICIPANTS);
    await join(bob, ROOM, 'Боб');

    expect((await aliceList).participants).toHaveLength(2);
    expect((await bobList).participants).toHaveLength(2);
  });

  it('о входе участника приходит системное сообщение остальным', async () => {
    const alice = await newClient();
    await join(alice, ROOM, 'Алиса');

    const bob = await newClient();
    const systemMessage = waitForEvent(alice, EVENTS.CHAT_SYSTEM);
    await join(bob, ROOM, 'Боб');

    expect(await systemMessage).toMatchObject({
      type: MESSAGE_TYPES.SYSTEM,
      authorId: null,
      name: 'Боб',
      text: SYSTEM_EVENTS.JOINED,
    });
  });

  it('новичок не получает системное сообщение о собственном входе', async () => {
    const alice = await newClient();
    await join(alice, ROOM, 'Алиса');

    const bob = await newClient();
    const bobSystem = collectEvents(bob, EVENTS.CHAT_SYSTEM);
    const ack = await join(bob, ROOM, 'Боб');

    // Про вход Алисы в истории запись есть — это корректная хронология.
    // Про свой собственный вход новичок не узнаёт ни событием, ни из истории.
    expect(await bobSystem).toEqual([]);
    expect(ack.messages.some((message) => message.name === 'Боб')).toBe(false);
    expect(ack.messages).toHaveLength(1);
  });
});

describe('join: лимит участников', () => {
  it('пятый получает ROOM_FULL', async () => {
    for (let i = 1; i <= 4; i += 1) {
      const socket = await newClient();
      const ack = await join(socket, ROOM, `Участник${i}`);
      expect(ack.ok).toBe(true);
    }

    const fifth = await newClient();
    const ack = await join(fifth, ROOM, 'Пятый');

    expect(ack).toEqual({ ok: false, code: ERROR_CODES.ROOM_FULL });
  });

  it('гонка за последний слот: два join одновременно — входит ровно один', async () => {
    for (let i = 1; i <= 3; i += 1) {
      const socket = await newClient();
      await join(socket, ROOM, `Участник${i}`);
    }

    const first = await newClient();
    const second = await newClient();

    // Обе заявки уходят без ожидания ответа — сервер разбирает их в разных
    // тиках цикла событий, но проверка лимита и вставка неделимы.
    const [firstAck, secondAck] = await Promise.all([
      join(first, ROOM, 'Первый'),
      join(second, ROOM, 'Второй'),
    ]);

    const accepted = [firstAck, secondAck].filter((ack) => ack.ok);
    const rejected = [firstAck, secondAck].filter((ack) => !ack.ok);

    expect(accepted).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].code).toBe(ERROR_CODES.ROOM_FULL);
  });

  it('десять одновременных заявок в пустую комнату дают ровно четырёх участников', async () => {
    const clients = await Promise.all(Array.from({ length: 10 }, () => newClient()));

    const acks = await Promise.all(clients.map((socket, i) => join(socket, ROOM, `У${i}`)));

    expect(acks.filter((ack) => ack.ok)).toHaveLength(4);
    expect(acks.filter((ack) => !ack.ok).every((ack) => ack.code === ERROR_CODES.ROOM_FULL)).toBe(
      true,
    );
  });
});

describe('join: валидация', () => {
  it('отклоняет пустое имя', async () => {
    const socket = await newClient();
    expect(await join(socket, ROOM, '   ')).toEqual({
      ok: false,
      code: ERROR_CODES.INVALID_NAME,
    });
  });

  it('отклоняет имя со спецсимволами', async () => {
    const socket = await newClient();
    expect(await join(socket, ROOM, '<script>alert(1)</script>')).toEqual({
      ok: false,
      code: ERROR_CODES.INVALID_NAME,
    });
  });

  it('обрезает слишком длинное имя до 30 символов', async () => {
    const alice = await newClient();
    await join(alice, ROOM, 'А'.repeat(50));

    const bob = await newClient();
    const ack = await join(bob, ROOM, 'Боб');

    expect(ack.participants[0].name).toHaveLength(30);
  });

  it('отклоняет некорректный идентификатор комнаты', async () => {
    const socket = await newClient();
    expect(await join(socket, 'комната/../etc', 'Алиса')).toEqual({
      ok: false,
      code: ERROR_CODES.INVALID_ROOM,
    });
  });

  it('отклоняет join без полезной нагрузки', async () => {
    const socket = await newClient();
    const ack = await new Promise((resolve) => socket.emit(EVENTS.JOIN, null, resolve));
    expect(ack.ok).toBe(false);
  });

  it('повторный join по тому же сокету игнорируется', async () => {
    const socket = await newClient();
    expect((await join(socket, ROOM, 'Алиса')).ok).toBe(true);
    expect((await join(socket, 'другая-комната', 'Алиса')).ok).toBe(false);
  });

  it('одинаковые имена в одной комнате разрешены', async () => {
    const alice = await newClient();
    await join(alice, ROOM, 'Алекс');

    const alex = await newClient();
    const ack = await join(alex, ROOM, 'Алекс');

    expect(ack.ok).toBe(true);
    expect(ack.participants[0].name).toBe('Алекс');
    expect(ack.participants[0].id).not.toBe(alex.id);
  });
});
