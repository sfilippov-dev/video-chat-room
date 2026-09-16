import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { EVENTS } from './events.js';
import {
  startTestServer,
  connectClient,
  join,
  waitForEvent,
  collectEvents,
  settle,
  closeAll,
} from './testHarness.js';
import { resetRooms, getParticipants } from '../rooms.js';

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

describe('состояние микрофона и камеры', () => {
  it('при входе устройства включены по умолчанию', async () => {
    const alice = await newClient();
    await join(alice, ROOM, 'Алиса');

    expect(getParticipants(ROOM)[0]).toMatchObject({ micOn: true, camOn: true });
  });

  it('выключение микрофона рассылается остальным', async () => {
    const alice = await newClient();
    const bob = await newClient();
    await join(alice, ROOM, 'Алиса');
    await join(bob, ROOM, 'Боб');
    await settle();

    const update = waitForEvent(bob, EVENTS.PEER_MEDIA_STATE);
    alice.emit(EVENTS.MEDIA_STATE, { micOn: false, camOn: true });

    expect(await update).toEqual({ id: alice.id, micOn: false, camOn: true });
  });

  it('выключение камеры рассылается остальным', async () => {
    const alice = await newClient();
    const bob = await newClient();
    await join(alice, ROOM, 'Алиса');
    await join(bob, ROOM, 'Боб');
    await settle();

    const update = waitForEvent(bob, EVENTS.PEER_MEDIA_STATE);
    alice.emit(EVENTS.MEDIA_STATE, { micOn: true, camOn: false });

    expect(await update).toEqual({ id: alice.id, micOn: true, camOn: false });
  });

  it('отправитель тоже получает подтверждение своего состояния', async () => {
    const alice = await newClient();
    await join(alice, ROOM, 'Алиса');
    await settle();

    const update = waitForEvent(alice, EVENTS.PEER_MEDIA_STATE);
    alice.emit(EVENTS.MEDIA_STATE, { micOn: false, camOn: false });

    expect(await update).toEqual({ id: alice.id, micOn: false, camOn: false });
  });

  it('вошедший позже сразу видит, у кого что выключено', async () => {
    const alice = await newClient();
    await join(alice, ROOM, 'Алиса');
    alice.emit(EVENTS.MEDIA_STATE, { micOn: false, camOn: false });
    await settle();

    const bob = await newClient();
    const ack = await join(bob, ROOM, 'Боб');

    expect(ack.participants[0]).toMatchObject({ micOn: false, camOn: false });
  });

  it('peer-joined сообщает актуальное состояние устройств новичка', async () => {
    const alice = await newClient();
    await join(alice, ROOM, 'Алиса');
    await settle();

    const bob = await newClient();
    const peerJoined = waitForEvent(alice, EVENTS.PEER_JOINED);
    await join(bob, ROOM, 'Боб');

    expect(await peerJoined).toMatchObject({ micOn: true, camOn: true });
  });

  it('частичное обновление меняет только переданный флаг', async () => {
    const alice = await newClient();
    await join(alice, ROOM, 'Алиса');
    await settle();

    const update = waitForEvent(alice, EVENTS.PEER_MEDIA_STATE);
    alice.emit(EVENTS.MEDIA_STATE, { camOn: false });

    expect(await update).toEqual({ id: alice.id, micOn: true, camOn: false });
  });

  it('состояние от сокета вне комнаты игнорируется', async () => {
    const alice = await newClient();
    await join(alice, ROOM, 'Алиса');
    const outsider = await newClient();
    await settle();

    const aliceEvents = collectEvents(alice, EVENTS.PEER_MEDIA_STATE);
    outsider.emit(EVENTS.MEDIA_STATE, { micOn: false, camOn: false });

    expect(await aliceEvents).toEqual([]);
    expect(getParticipants(ROOM)[0]).toMatchObject({ micOn: true, camOn: true });
  });

  it('мусорная нагрузка не меняет состояние и не роняет сервер', async () => {
    const alice = await newClient();
    await join(alice, ROOM, 'Алиса');
    await settle();

    alice.emit(EVENTS.MEDIA_STATE, null);
    alice.emit(EVENTS.MEDIA_STATE, { micOn: 'нет', camOn: 0 });
    await settle();

    expect(getParticipants(ROOM)[0]).toMatchObject({ micOn: true, camOn: true });
    expect(alice.connected).toBe(true);
  });
});
