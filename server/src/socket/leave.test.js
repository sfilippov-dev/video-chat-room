import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { EVENTS, MESSAGE_TYPES, SYSTEM_EVENTS } from './events.js';
import {
  startTestServer,
  connectClient,
  join,
  waitForEvent,
  settle,
  closeAll,
} from './testHarness.js';
import { resetRooms, roomExists, getParticipants, getMessages } from '../rooms.js';

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

describe('выход из комнаты', () => {
  it('по кнопке «Выйти» остальные получают peer-left', async () => {
    const alice = await newClient();
    const bob = await newClient();
    await join(alice, ROOM, 'Алиса');
    await join(bob, ROOM, 'Боб');

    await settle();

    const peerLeft = waitForEvent(alice, EVENTS.PEER_LEFT);
    bob.emit(EVENTS.LEAVE);

    expect(await peerLeft).toEqual({ id: bob.id, name: 'Боб' });
  });

  it('обрыв соединения обрабатывается так же, как осознанный выход', async () => {
    const alice = await newClient();
    const bob = await newClient();
    await join(alice, ROOM, 'Алиса');
    await join(bob, ROOM, 'Боб');

    await settle();

    const bobId = bob.id;
    const peerLeft = waitForEvent(alice, EVENTS.PEER_LEFT);
    bob.disconnect();

    expect(await peerLeft).toEqual({ id: bobId, name: 'Боб' });
  });

  it('системное сообщение о выходе не говорит о потере соединения', async () => {
    const alice = await newClient();
    const bob = await newClient();
    await join(alice, ROOM, 'Алиса');
    await join(bob, ROOM, 'Боб');

    await settle();

    const systemMessage = waitForEvent(alice, EVENTS.CHAT_SYSTEM);
    bob.disconnect();

    // Сервер не может отличить обрыв от закрытия вкладки, поэтому код события
    // всегда один и тот же — «покинул комнату».
    expect(await systemMessage).toMatchObject({
      type: MESSAGE_TYPES.SYSTEM,
      authorId: null,
      name: 'Боб',
      text: SYSTEM_EVENTS.LEFT,
    });
  });

  it('слот освобождается: после выхода в комнату снова можно войти', async () => {
    const clients = [];
    for (let i = 1; i <= 4; i += 1) {
      const socket = await newClient();
      await join(socket, ROOM, `У${i}`);
      clients.push(socket);
    }

    await settle();

    const participantsUpdate = waitForEvent(clients[0], EVENTS.PARTICIPANTS);
    clients[3].disconnect();
    expect((await participantsUpdate).participants).toHaveLength(3);

    const fifth = await newClient();
    expect((await join(fifth, ROOM, 'Пятый')).ok).toBe(true);
  });

  it('список участников обновляется у оставшихся', async () => {
    const alice = await newClient();
    const bob = await newClient();
    await join(alice, ROOM, 'Алиса');
    await join(bob, ROOM, 'Боб');

    await settle();

    const participants = waitForEvent(alice, EVENTS.PARTICIPANTS);
    bob.emit(EVENTS.LEAVE);

    expect((await participants).participants).toEqual([
      { id: alice.id, name: 'Алиса', micOn: true, camOn: true },
    ]);
  });

  it('выход последнего участника удаляет комнату вместе с историей', async () => {
    const alice = await newClient();
    await join(alice, ROOM, 'Алиса');
    expect(roomExists(ROOM)).toBe(true);

    alice.disconnect();
    await settle(100);

    expect(roomExists(ROOM)).toBe(false);
    expect(getMessages(ROOM)).toEqual([]);
  });

  it('повторный вход по тому же идентификатору даёт новую пустую комнату', async () => {
    const alice = await newClient();
    await join(alice, ROOM, 'Алиса');
    alice.disconnect();
    await settle(100);

    const bob = await newClient();
    const ack = await join(bob, ROOM, 'Боб');

    expect(ack.ok).toBe(true);
    expect(ack.messages).toEqual([]);
    expect(ack.participants).toEqual([]);
  });

  it('явный leave, а следом disconnect не ломают состояние', async () => {
    const alice = await newClient();
    const bob = await newClient();
    await join(alice, ROOM, 'Алиса');
    await join(bob, ROOM, 'Боб');

    bob.emit(EVENTS.LEAVE);
    await settle(50);
    bob.disconnect();
    await settle(100);

    expect(getParticipants(ROOM)).toHaveLength(1);
    // Повторной записи о выходе в истории быть не должно.
    const leftMessages = getMessages(ROOM).filter((m) => m.text === SYSTEM_EVENTS.LEFT);
    expect(leftMessages).toHaveLength(1);
  });

  it('leave от сокета, который никуда не входил, игнорируется', async () => {
    const socket = await newClient();
    socket.emit(EVENTS.LEAVE);
    await settle(50);
    expect(socket.connected).toBe(true);
  });

  it('звонок остальных не прерывается выходом одного', async () => {
    const alice = await newClient();
    const bob = await newClient();
    const carol = await newClient();
    await join(alice, ROOM, 'Алиса');
    await join(bob, ROOM, 'Боб');
    await join(carol, ROOM, 'Кэрол');

    carol.disconnect();
    await settle(100);

    expect(alice.connected).toBe(true);
    expect(bob.connected).toBe(true);
    expect(getParticipants(ROOM)).toHaveLength(2);
  });
});
