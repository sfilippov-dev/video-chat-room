import { EVENTS, ERROR_CODES, MESSAGE_TYPES, SYSTEM_EVENTS } from './events.js';
import { validateName, validateRoomId, validateMessage } from '../validation.js';
import { createRateLimiter } from '../rateLimiter.js';
import {
  tryAddParticipant,
  removeParticipant,
  addMessage,
  getParticipants,
  getMessages,
  hasParticipant,
  setMediaState,
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
  // Ограничитель живёт в замыкании сокета: уходит вместе с соединением.
  const rateLimiter = createRateLimiter();

  socket.on(EVENTS.JOIN, (payload, ack) => handleJoin(io, socket, payload, ack));
  socket.on(EVENTS.LEAVE, () => handleLeave(io, socket));
  socket.on('disconnect', () => handleLeave(io, socket));

  socket.on(EVENTS.SIGNAL_OFFER, (payload) =>
    relaySignal(io, socket, EVENTS.SIGNAL_OFFER, payload, 'sdp'),
  );
  socket.on(EVENTS.SIGNAL_ANSWER, (payload) =>
    relaySignal(io, socket, EVENTS.SIGNAL_ANSWER, payload, 'sdp'),
  );
  socket.on(EVENTS.SIGNAL_ICE, (payload) =>
    relaySignal(io, socket, EVENTS.SIGNAL_ICE, payload, 'candidate'),
  );

  socket.on(EVENTS.MEDIA_STATE, (payload) => handleMediaState(io, socket, payload));

  socket.on(EVENTS.CHAT_SEND, (payload, ack) =>
    handleChatSend(io, socket, payload, ack, rateLimiter),
  );
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

/**
 * Реле сигналинга: сервер перекладывает конверт от отправителя к адресату,
 * подменяя targetId на fromId. Содержимое SDP и ICE-кандидатов он не разбирает
 * и не хранит — вся логика согласования живёт на клиентах, а медиа идёт мимо
 * сервера напрямую между браузерами.
 *
 * Единственная проверка — отправитель и адресат находятся в одной комнате.
 * Всё остальное молча отбрасывается: доверять клиенту незачем.
 */
function relaySignal(io, socket, event, payload, payloadKey) {
  const { roomId } = socket.data;
  if (!roomId) return;

  const data = payload ?? {};
  const targetId = data.targetId;
  const content = data[payloadKey];

  if (typeof targetId !== 'string' || !content || typeof content !== 'object') return;
  if (targetId === socket.id) return;
  if (!hasParticipant(roomId, targetId)) return;

  io.to(targetId).emit(event, { fromId: socket.id, [payloadKey]: content });
}

/**
 * Состояние микрофона и камеры участника.
 *
 * Это исключительно индикация для интерфейса: фактическое прекращение передачи
 * выполняет сам отправитель средствами WebRTC. Флаги держим на сервере, чтобы
 * вошедший позже сразу увидел, у кого что выключено, и чтобы интерфейс не
 * додумывал состояние по факту прихода медиапотока.
 */
function handleMediaState(io, socket, payload) {
  const { roomId } = socket.data;
  if (!roomId) return;

  const data = payload ?? {};
  const updated = setMediaState(roomId, socket.id, {
    micOn: data.micOn,
    camOn: data.camOn,
  });
  if (!updated) return;

  io.to(roomId).emit(EVENTS.PEER_MEDIA_STATE, {
    id: socket.id,
    micOn: updated.micOn,
    camOn: updated.camOn,
  });
}

/**
 * Отправка сообщения в общий чат.
 *
 * Имя автора и время берутся из состояния сервера, а не из полезной нагрузки:
 * иначе любой участник смог бы отправить сообщение от чужого имени и с любой
 * отметкой времени.
 *
 * Сообщение уходит всем, включая автора. Так у всех участников порядок ленты
 * совпадает с серверным, и собственное сообщение не «прыгает» вверх, когда
 * почти одновременно приходит чужое.
 */
function handleChatSend(io, socket, payload, ack, rateLimiter) {
  const respond = typeof ack === 'function' ? ack : () => {};
  const { roomId, name } = socket.data;

  if (!roomId) {
    respond({ ok: false, code: ERROR_CODES.INVALID_ROOM });
    return;
  }

  const text = validateMessage((payload ?? {}).text);
  if (!text.ok) {
    respond({ ok: false, code: text.code });
    return;
  }

  if (!rateLimiter.tryConsume()) {
    respond({ ok: false, code: ERROR_CODES.RATE_LIMITED });
    return;
  }

  const message = addMessage(roomId, {
    type: MESSAGE_TYPES.USER,
    authorId: socket.id,
    name,
    text: text.value,
  });
  if (!message) {
    respond({ ok: false, code: ERROR_CODES.INVALID_ROOM });
    return;
  }

  respond({ ok: true });
  io.to(roomId).emit(EVENTS.CHAT_MESSAGE, message);
}
