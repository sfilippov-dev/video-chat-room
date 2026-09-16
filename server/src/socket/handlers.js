import { EVENTS, ERROR_CODES, MESSAGE_TYPES, SYSTEM_EVENTS } from './events.js';
import { validateName, validateRoomId } from '../validation.js';
import {
  tryAddParticipant,
  removeParticipant,
  addMessage,
  getParticipants,
  getMessages,
} from '../rooms.js';

/**
 * Обработчики событий одного сокета.
 *
 * Сервер здесь выступает в двух ролях: он авторитет по составу комнаты и
 * истории чата — и тупое реле для сигналинга WebRTC, которое не разбирает
 * содержимое SDP. Медиа через сервер не проходит вообще.
 */
export function registerHandlers(io, socket) {
  socket.data.roomId = null;
  socket.data.name = null;

  socket.on(EVENTS.JOIN, (payload, ack) => handleJoin(io, socket, payload, ack));
  socket.on(EVENTS.LEAVE, () => handleLeave(io, socket));
  socket.on('disconnect', () => handleLeave(io, socket));
}

/**
 * Вход в комнату.
 *
 * Ключевая асимметрия ролей: старожилы получают peer-joined и становятся
 * инициаторами соединения, а новичок получает в ack только список тех, от кого
 * ждать оффер. Если бы обе стороны начали согласование одновременно, случился
 * бы glare и соединение развалилось бы.
 */
function handleJoin(io, socket, payload, ack) {
  const respond = typeof ack === 'function' ? ack : () => {};

  // Повторный join по уже занятому сокету игнорируем: один сокет — один слот.
  if (socket.data.roomId) {
    respond({ ok: false, code: ERROR_CODES.INVALID_ROOM });
    return;
  }

  const data = payload ?? {};

  const room = validateRoomId(data.roomId);
  if (!room.ok) {
    respond({ ok: false, code: room.code });
    return;
  }

  const name = validateName(data.name);
  if (!name.ok) {
    respond({ ok: false, code: name.code });
    return;
  }

  const roomId = room.value;

  // Атомарный участок: проверка лимита и вставка идут одним синхронным блоком
  // внутри rooms.tryAddParticipant, без единого await между ними.
  const added = tryAddParticipant(roomId, socket.id, name.value);
  if (!added.ok) {
    respond({ ok: false, code: added.code });
    return;
  }

  socket.data.roomId = roomId;
  socket.data.name = name.value;
  socket.join(roomId);

  // История снимается ДО добавления системного сообщения о собственном входе:
  // читать «вы присоединились» в своей же ленте бессмысленно.
  const history = getMessages(roomId);
  const others = getParticipants(roomId).filter((participant) => participant.id !== socket.id);

  // Ack уходит раньше рассылки peer-joined, поэтому новичок успевает создать
  // соединения и подписаться на события до того, как прилетит первый оффер.
  respond({
    ok: true,
    selfId: socket.id,
    participants: others,
    messages: history,
  });

  const systemMessage = addMessage(roomId, {
    type: MESSAGE_TYPES.SYSTEM,
    name: name.value,
    text: SYSTEM_EVENTS.JOINED,
  });

  socket.to(roomId).emit(EVENTS.PEER_JOINED, {
    id: socket.id,
    name: name.value,
    micOn: true,
    camOn: true,
  });
  socket.to(roomId).emit(EVENTS.CHAT_SYSTEM, systemMessage);

  io.to(roomId).emit(EVENTS.PARTICIPANTS, { participants: getParticipants(roomId) });
}

/**
 * Выход из комнаты.
 *
 * Один и тот же код обслуживает кнопку «Выйти», закрытие вкладки и обрыв связи:
 * сервер принципиально не может отличить одно от другого. Именно поэтому
 * системное сообщение всегда «покинул комнату», а формулировка «соединение
 * потеряно» не используется нигде (PRD п. 31). Автопереподключения нет:
 * вернуться можно только повторным входом по ссылке.
 *
 * Идемпотентен: после явного leave придёт ещё и disconnect.
 */
function handleLeave(io, socket) {
  const { roomId, name } = socket.data;
  if (!roomId) return;

  socket.data.roomId = null;
  socket.data.name = null;
  socket.leave(roomId);

  const { removed, roomDeleted } = removeParticipant(roomId, socket.id);
  if (!removed) return;

  // Комната вместе с историей уже удалена — рассылать некому и нечего.
  if (roomDeleted) return;

  const systemMessage = addMessage(roomId, {
    type: MESSAGE_TYPES.SYSTEM,
    name: removed.name ?? name,
    text: SYSTEM_EVENTS.LEFT,
  });

  io.to(roomId).emit(EVENTS.PEER_LEFT, { id: socket.id, name: removed.name ?? name });
  io.to(roomId).emit(EVENTS.CHAT_SYSTEM, systemMessage);
  io.to(roomId).emit(EVENTS.PARTICIPANTS, { participants: getParticipants(roomId) });
}
