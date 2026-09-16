import { describe, it, expect, beforeEach } from 'vitest';

import {
  getOrCreateRoom,
  tryAddParticipant,
  removeParticipant,
  setMediaState,
  addMessage,
  getParticipants,
  getMessages,
  hasParticipant,
  roomExists,
  getRoomCount,
  resetRooms,
} from './rooms.js';
import { ERROR_CODES, MESSAGE_TYPES, SYSTEM_EVENTS } from './socket/events.js';

const ROOM = 'room-1';

beforeEach(() => {
  resetRooms();
});

describe('жизненный цикл комнаты', () => {
  it('комната создаётся первым участником', () => {
    expect(roomExists(ROOM)).toBe(false);

    const result = tryAddParticipant(ROOM, 'socket-1', 'Алексей');

    expect(result.ok).toBe(true);
    expect(roomExists(ROOM)).toBe(true);
    expect(getParticipants(ROOM)).toEqual([
      { id: 'socket-1', name: 'Алексей', micOn: true, camOn: true },
    ]);
  });

  it('вход по неизвестному идентификатору создаёт комнату, а не отказ', () => {
    // Состояния «комната не найдена» в продукте не существует (PRD п. 5).
    const room = getOrCreateRoom('никогда-не-существовавшая');
    expect(room.participants.size).toBe(0);
    expect(roomExists('никогда-не-существовавшая')).toBe(true);
  });

  it('микрофон и камера включены по умолчанию', () => {
    tryAddParticipant(ROOM, 'socket-1', 'Алексей');
    const [participant] = getParticipants(ROOM);
    expect(participant.micOn).toBe(true);
    expect(participant.camOn).toBe(true);
  });

  it('выход последнего участника удаляет комнату вместе с историей', () => {
    tryAddParticipant(ROOM, 'socket-1', 'Алексей');
    addMessage(ROOM, { authorId: 'socket-1', name: 'Алексей', text: 'привет' });

    const result = removeParticipant(ROOM, 'socket-1');

    expect(result.roomDeleted).toBe(true);
    expect(roomExists(ROOM)).toBe(false);
    expect(getMessages(ROOM)).toEqual([]);
    expect(getRoomCount()).toBe(0);
  });

  it('повторный вход по тому же идентификатору даёт пустую историю', () => {
    tryAddParticipant(ROOM, 'socket-1', 'Алексей');
    addMessage(ROOM, { authorId: 'socket-1', name: 'Алексей', text: 'секрет' });
    removeParticipant(ROOM, 'socket-1');

    tryAddParticipant(ROOM, 'socket-2', 'Мария');

    expect(getMessages(ROOM)).toEqual([]);
    expect(getParticipants(ROOM)).toHaveLength(1);
  });

  it('пока в комнате остаётся хоть кто-то, она и история живут', () => {
    tryAddParticipant(ROOM, 'socket-1', 'Алексей');
    tryAddParticipant(ROOM, 'socket-2', 'Мария');
    addMessage(ROOM, { authorId: 'socket-1', name: 'Алексей', text: 'привет' });

    const result = removeParticipant(ROOM, 'socket-1');

    expect(result.roomDeleted).toBe(false);
    expect(roomExists(ROOM)).toBe(true);
    expect(getMessages(ROOM)).toHaveLength(1);
  });

  it('удаление несуществующего участника безопасно и идемпотентно', () => {
    expect(removeParticipant('нет-такой', 'socket-1')).toEqual({
      removed: null,
      roomDeleted: false,
    });

    tryAddParticipant(ROOM, 'socket-1', 'Алексей');
    removeParticipant(ROOM, 'socket-1');
    expect(() => removeParticipant(ROOM, 'socket-1')).not.toThrow();
  });
});

describe('лимит участников', () => {
  it('четверо входят, пятый получает отказ', () => {
    for (let i = 1; i <= 4; i += 1) {
      expect(tryAddParticipant(ROOM, `socket-${i}`, `Участник ${i}`).ok).toBe(true);
    }

    const fifth = tryAddParticipant(ROOM, 'socket-5', 'Пятый');

    expect(fifth).toEqual({ ok: false, code: ERROR_CODES.ROOM_FULL });
    expect(getParticipants(ROOM)).toHaveLength(4);
    expect(hasParticipant(ROOM, 'socket-5')).toBe(false);
  });

  it('освободившийся слот снова доступен', () => {
    for (let i = 1; i <= 4; i += 1) tryAddParticipant(ROOM, `socket-${i}`, `У${i}`);
    removeParticipant(ROOM, 'socket-2');

    expect(tryAddParticipant(ROOM, 'socket-5', 'Пятый').ok).toBe(true);
    expect(getParticipants(ROOM)).toHaveLength(4);
  });

  it('гонка за последний слот: два входа подряд без передачи управления', () => {
    // Имитация двух обработчиков join, выполняющихся в одном тике цикла
    // событий. Проверка лимита и вставка неделимы, поэтому пятого не будет.
    for (let i = 1; i <= 3; i += 1) tryAddParticipant(ROOM, `socket-${i}`, `У${i}`);

    const first = tryAddParticipant(ROOM, 'socket-A', 'A');
    const second = tryAddParticipant(ROOM, 'socket-B', 'B');

    expect(first.ok).toBe(true);
    expect(second).toEqual({ ok: false, code: ERROR_CODES.ROOM_FULL });
    expect(getParticipants(ROOM)).toHaveLength(4);
  });

  it('отказ пятому не создаёт и не ломает комнату', () => {
    for (let i = 1; i <= 4; i += 1) tryAddParticipant(ROOM, `socket-${i}`, `У${i}`);
    tryAddParticipant(ROOM, 'socket-5', 'Пятый');

    expect(getRoomCount()).toBe(1);
    expect(getParticipants(ROOM)).toHaveLength(4);
  });
});

describe('участники', () => {
  it('одинаковые имена разрешены и различаются по внутреннему id', () => {
    tryAddParticipant(ROOM, 'socket-1', 'Алекс');
    tryAddParticipant(ROOM, 'socket-2', 'Алекс');

    const participants = getParticipants(ROOM);
    expect(participants).toHaveLength(2);
    expect(participants.map((p) => p.name)).toEqual(['Алекс', 'Алекс']);
    expect(new Set(participants.map((p) => p.id)).size).toBe(2);
  });

  it('несколько вкладок одного пользователя занимают разные слоты', () => {
    tryAddParticipant(ROOM, 'tab-1', 'Алексей');
    tryAddParticipant(ROOM, 'tab-2', 'Алексей');

    expect(getParticipants(ROOM)).toHaveLength(2);
  });

  it('состояние устройств обновляется точечно', () => {
    tryAddParticipant(ROOM, 'socket-1', 'Алексей');

    const updated = setMediaState(ROOM, 'socket-1', { camOn: false });

    expect(updated).toMatchObject({ micOn: true, camOn: false });
    expect(getParticipants(ROOM)[0]).toMatchObject({ micOn: true, camOn: false });
  });

  it('обновление состояния для чужого сокета ничего не меняет', () => {
    tryAddParticipant(ROOM, 'socket-1', 'Алексей');
    expect(setMediaState(ROOM, 'socket-999', { camOn: false })).toBeNull();
    expect(getParticipants(ROOM)[0].camOn).toBe(true);
  });
});

describe('история сообщений', () => {
  it('пользовательские и системные записи лежат в одной ленте по времени', () => {
    tryAddParticipant(ROOM, 'socket-1', 'Алексей');
    addMessage(ROOM, {
      type: MESSAGE_TYPES.SYSTEM,
      name: 'Алексей',
      text: SYSTEM_EVENTS.JOINED,
    });
    addMessage(ROOM, { authorId: 'socket-1', name: 'Алексей', text: 'привет' });

    const messages = getMessages(ROOM);
    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({ type: MESSAGE_TYPES.SYSTEM, authorId: null });
    expect(messages[1]).toMatchObject({ type: MESSAGE_TYPES.USER, authorId: 'socket-1' });
    expect(messages[0].ts).toBeLessThanOrEqual(messages[1].ts);
  });

  it('у каждого сообщения есть уникальный идентификатор и отметка времени', () => {
    tryAddParticipant(ROOM, 'socket-1', 'Алексей');
    const first = addMessage(ROOM, { authorId: 'socket-1', name: 'Алексей', text: 'раз' });
    const second = addMessage(ROOM, { authorId: 'socket-1', name: 'Алексей', text: 'два' });

    expect(first.id).not.toBe(second.id);
    expect(typeof first.ts).toBe('number');
  });

  it('сообщение в несуществующую комнату не сохраняется', () => {
    expect(addMessage('нет-такой', { authorId: 'x', name: 'X', text: 'привет' })).toBeNull();
  });

  it('getMessages возвращает копию: внешняя мутация не портит историю', () => {
    tryAddParticipant(ROOM, 'socket-1', 'Алексей');
    addMessage(ROOM, { authorId: 'socket-1', name: 'Алексей', text: 'привет' });

    getMessages(ROOM).push({ text: 'подделка' });

    expect(getMessages(ROOM)).toHaveLength(1);
  });
});
