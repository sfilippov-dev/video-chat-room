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
import { resetRooms } from '../rooms.js';

const ROOM = 'test-room';
const OFFER = { type: 'offer', sdp: 'v=0\r\no=- 0 0 IN IP4 127.0.0.1\r\n' };
const ANSWER = { type: 'answer', sdp: 'v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\n' };
const CANDIDATE = { candidate: 'candidate:1 1 UDP 1 10.0.0.1 5000 typ host', sdpMid: '0', sdpMLineIndex: 0 };

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

describe('реле сигналинга', () => {
  it('оффер доходит до адресата с подменой targetId на fromId', async () => {
    const alice = await newClient();
    const bob = await newClient();
    await join(alice, ROOM, 'Алиса');
    await join(bob, ROOM, 'Боб');
    await settle();

    const incoming = waitForEvent(bob, EVENTS.SIGNAL_OFFER);
    alice.emit(EVENTS.SIGNAL_OFFER, { targetId: bob.id, sdp: OFFER });

    expect(await incoming).toEqual({ fromId: alice.id, sdp: OFFER });
  });

  it('ответ доходит обратно инициатору', async () => {
    const alice = await newClient();
    const bob = await newClient();
    await join(alice, ROOM, 'Алиса');
    await join(bob, ROOM, 'Боб');
    await settle();

    const incoming = waitForEvent(alice, EVENTS.SIGNAL_ANSWER);
    bob.emit(EVENTS.SIGNAL_ANSWER, { targetId: alice.id, sdp: ANSWER });

    expect(await incoming).toEqual({ fromId: bob.id, sdp: ANSWER });
  });

  it('ICE-кандидаты передаются в обе стороны', async () => {
    const alice = await newClient();
    const bob = await newClient();
    await join(alice, ROOM, 'Алиса');
    await join(bob, ROOM, 'Боб');
    await settle();

    const toBob = waitForEvent(bob, EVENTS.SIGNAL_ICE);
    const toAlice = waitForEvent(alice, EVENTS.SIGNAL_ICE);
    alice.emit(EVENTS.SIGNAL_ICE, { targetId: bob.id, candidate: CANDIDATE });
    bob.emit(EVENTS.SIGNAL_ICE, { targetId: alice.id, candidate: CANDIDATE });

    expect(await toBob).toEqual({ fromId: alice.id, candidate: CANDIDATE });
    expect(await toAlice).toEqual({ fromId: bob.id, candidate: CANDIDATE });
  });

  it('сигнал адресуется точечно и не рассылается остальным', async () => {
    const alice = await newClient();
    const bob = await newClient();
    const carol = await newClient();
    await join(alice, ROOM, 'Алиса');
    await join(bob, ROOM, 'Боб');
    await join(carol, ROOM, 'Кэрол');
    await settle();

    const carolEvents = collectEvents(carol, EVENTS.SIGNAL_OFFER);
    const bobOffer = waitForEvent(bob, EVENTS.SIGNAL_OFFER);
    alice.emit(EVENTS.SIGNAL_OFFER, { targetId: bob.id, sdp: OFFER });

    expect(await bobOffer).toBeTruthy();
    expect(await carolEvents).toEqual([]);
  });

  it('сигнал участнику из другой комнаты не доходит', async () => {
    const alice = await newClient();
    const stranger = await newClient();
    await join(alice, ROOM, 'Алиса');
    await join(stranger, 'other-room', 'Чужак');
    await settle();

    const strangerEvents = collectEvents(stranger, EVENTS.SIGNAL_OFFER);
    alice.emit(EVENTS.SIGNAL_OFFER, { targetId: stranger.id, sdp: OFFER });

    expect(await strangerEvents).toEqual([]);
  });

  it('сигнал от сокета, не вошедшего в комнату, отбрасывается', async () => {
    const alice = await newClient();
    await join(alice, ROOM, 'Алиса');
    const outsider = await newClient();
    await settle();

    const aliceEvents = collectEvents(alice, EVENTS.SIGNAL_OFFER);
    outsider.emit(EVENTS.SIGNAL_OFFER, { targetId: alice.id, sdp: OFFER });

    expect(await aliceEvents).toEqual([]);
  });

  it('мусорная полезная нагрузка не роняет сервер', async () => {
    const alice = await newClient();
    const bob = await newClient();
    await join(alice, ROOM, 'Алиса');
    await join(bob, ROOM, 'Боб');
    await settle();

    const bobEvents = collectEvents(bob, EVENTS.SIGNAL_OFFER);
    alice.emit(EVENTS.SIGNAL_OFFER, null);
    alice.emit(EVENTS.SIGNAL_OFFER, { targetId: bob.id });
    alice.emit(EVENTS.SIGNAL_OFFER, { targetId: 42, sdp: OFFER });
    alice.emit(EVENTS.SIGNAL_OFFER, { targetId: bob.id, sdp: 'строка вместо объекта' });
    alice.emit(EVENTS.SIGNAL_OFFER, { targetId: alice.id, sdp: OFFER });

    expect(await bobEvents).toEqual([]);
    expect(alice.connected).toBe(true);
    expect(bob.connected).toBe(true);
  });

  it('сигнал ушедшему участнику отбрасывается', async () => {
    const alice = await newClient();
    const bob = await newClient();
    await join(alice, ROOM, 'Алиса');
    await join(bob, ROOM, 'Боб');
    await settle();

    const bobId = bob.id;
    bob.emit(EVENTS.LEAVE);
    await settle();

    expect(() => alice.emit(EVENTS.SIGNAL_OFFER, { targetId: bobId, sdp: OFFER })).not.toThrow();
    await settle();
    expect(alice.connected).toBe(true);
  });
});
