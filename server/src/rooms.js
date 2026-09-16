import { randomUUID } from 'node:crypto';

import { MAX_PARTICIPANTS } from './config.js';
import { ERROR_CODES, MESSAGE_TYPES } from './socket/events.js';

/**
 * Состояние комнат — единственный источник правды о составе звонка и истории
 * чата. Живёт в памяти процесса: базы данных в проекте нет и не будет (PRD §7).
 * Перезапуск сервера уничтожает все активные комнаты, и это ожидаемое поведение.
 *
 * Модуль намеренно не знает про Socket.io: он оперирует идентификаторами и
 * структурами данных. Поэтому его целиком покрывают unit-тесты без сети.
 *
 * Map, а не объект: ключи приходят от клиента, а у обычного объекта есть
 * прототипные ключи (__proto__, constructor), дающие либо ложные попадания,
 * либо загрязнение прототипа. Плюс честный size за O(1) — как раз для лимита.
 *
 * @typedef {{name: string, micOn: boolean, camOn: boolean}} Participant
 * @typedef {{id: string, type: string, authorId: string|null, name: string,
 *            text: string, ts: number}} Message
 * @typedef {{participants: Map<string, Participant>, messages: Message[]}} Room
 */

/** @type {Map<string, Room>} */
const rooms = new Map();

/**
 * Возвращает комнату, создавая её при отсутствии.
 *
 * Состояния «комната не найдена» в продукте не существует: любой идентификатор
 * из URL либо открывает существующую комнату, либо создаёт новую (PRD п. 5).
 */
export function getOrCreateRoom(roomId) {
  let room = rooms.get(roomId);
  if (!room) {
    room = { participants: new Map(), messages: [] };
    rooms.set(roomId, room);
  }
  return room;
}

/**
 * Атомарная попытка занять слот в комнате.
 *
 * ВАЖНО: между чтением participants.size и вставкой участника не должно быть
 * ни одного await. Node исполняет JavaScript в одном потоке, поэтому весь
 * синхронный блок неделим и двое одновременно вошедших не могут превысить
 * лимит. Любой await отдал бы управление циклу событий, и второй клиент влез
 * бы ровно между проверкой и вставкой — это и есть гонка за последний слот
 * (PRD п. 7, US-5).
 *
 * @returns {{ok: true, room: Room} | {ok: false, code: string}}
 */
export function tryAddParticipant(roomId, socketId, name) {
  const room = getOrCreateRoom(roomId);

  if (room.participants.size >= MAX_PARTICIPANTS) {
    // Комната могла быть создана этим же вызовом только если она пуста,
    // поэтому удалять её здесь не нужно: пустой она тут быть не может.
    return { ok: false, code: ERROR_CODES.ROOM_FULL };
  }

  room.participants.set(socketId, { name, micOn: true, camOn: true });
  return { ok: true, room };
}

/**
 * Удаляет участника. Когда комната пустеет, она удаляется целиком — вместе с
 * идентификатором и всей историей чата (PRD п. 9). Повторный вход по тому же
 * идентификатору создаст новую пустую комнату.
 *
 * Идемпотентна: вызов для уже удалённого участника безопасен — на кнопку
 * «Выйти» и на disconnect может прилететь подряд.
 *
 * @returns {{removed: Participant|null, roomDeleted: boolean}}
 */
export function removeParticipant(roomId, socketId) {
  const room = rooms.get(roomId);
  if (!room) return { removed: null, roomDeleted: false };

  const participant = room.participants.get(socketId) ?? null;
  room.participants.delete(socketId);

  if (room.participants.size === 0) {
    rooms.delete(roomId);
    return { removed: participant, roomDeleted: true };
  }

  return { removed: participant, roomDeleted: false };
}

/**
 * Обновляет флаги устройств участника. Это только индикация для интерфейса:
 * фактическое прекращение передачи выполняет WebRTC на стороне отправителя.
 *
 * @returns {Participant|null}
 */
export function setMediaState(roomId, socketId, { micOn, camOn }) {
  const participant = rooms.get(roomId)?.participants.get(socketId);
  if (!participant) return null;

  if (typeof micOn === 'boolean') participant.micOn = micOn;
  if (typeof camOn === 'boolean') participant.camOn = camOn;

  return { ...participant };
}

/**
 * Кладёт сообщение в историю комнаты и возвращает его в готовом для рассылки
 * виде. Пользовательские и системные записи лежат в одной ленте, чтобы
 * вошедший позже видел корректный хронологический порядок.
 *
 * @returns {Message|null}
 */
export function addMessage(roomId, { type, authorId, name, text }) {
  const room = rooms.get(roomId);
  if (!room) return null;

  const message = {
    id: randomUUID(),
    type: type ?? MESSAGE_TYPES.USER,
    authorId: authorId ?? null,
    name,
    text,
    ts: Date.now(),
  };

  room.messages.push(message);
  return message;
}

/** Список участников комнаты для рассылки. Внутренние id в интерфейсе не показываются. */
export function getParticipants(roomId) {
  const room = rooms.get(roomId);
  if (!room) return [];

  return [...room.participants.entries()].map(([id, participant]) => ({
    id,
    ...participant,
  }));
}

/** Копия истории сообщений: отдаётся только новичку, в его собственный сокет. */
export function getMessages(roomId) {
  return rooms.get(roomId)?.messages.slice() ?? [];
}

export function hasParticipant(roomId, socketId) {
  return Boolean(rooms.get(roomId)?.participants.has(socketId));
}

export function getParticipant(roomId, socketId) {
  const participant = rooms.get(roomId)?.participants.get(socketId);
  return participant ? { ...participant } : null;
}

export function roomExists(roomId) {
  return rooms.has(roomId);
}

export function getRoomCount() {
  return rooms.size;
}

/** Только для тестов: сбрасывает состояние между сценариями. */
export function resetRooms() {
  rooms.clear();
}
