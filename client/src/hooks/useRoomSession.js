import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { EVENTS, ERROR_CODES } from '../lib/events.js';
import { createSocket, destroySocket } from '../lib/socket.js';
import { LocalMediaController } from '../lib/LocalMediaController.js';

/**
 * Состояния сессии.
 *
 * acquiring наступает уже после клика по кнопке входа — и это не деталь
 * реализации, а требование: клик служит жестом пользователя, снимающим
 * блокировку автозапуска звука. Если запрашивать устройства раньше, удалённое
 * аудио потом не заиграет само.
 */
export const SESSION_STATUS = {
  ACQUIRING: 'acquiring',
  JOINING: 'joining',
  IN_ROOM: 'in_room',
  REJECTED: 'rejected',
  SERVER_ERROR: 'server_error',
  DISCONNECTED: 'disconnected',
};

const JOIN_ERROR_TEXT = {
  [ERROR_CODES.ROOM_FULL]:
    'Комната заполнена: в звонке уже четыре участника. Попробуйте войти позже.',
  [ERROR_CODES.INVALID_NAME]: 'Имя не принято. Допустимы буквы, цифры, пробел, дефис и подчёркивание.',
  [ERROR_CODES.INVALID_ROOM]: 'Некорректная ссылка на комнату.',
};

/**
 * Оркестратор сессии: связывает сокет, локальные устройства и состав комнаты.
 * WebRTC-соединения подключаются к этому же хуку следующими задачами.
 */
export function useRoomSession({ roomId, name }) {
  const [status, setStatus] = useState(SESSION_STATUS.ACQUIRING);
  const [error, setError] = useState(null);
  const [selfId, setSelfId] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [messages, setMessages] = useState([]);
  const [mediaState, setMediaState] = useState({
    micOn: false,
    camOn: false,
    hasMic: false,
    hasCam: false,
    error: null,
  });

  const mediaRef = useRef(null);
  const socketRef = useRef(null);
  const leftRef = useRef(false);

  const media = useMemo(() => {
    if (!mediaRef.current) mediaRef.current = new LocalMediaController();
    return mediaRef.current;
  }, []);

  useEffect(() => {
    let cancelled = false;
    leftRef.current = false;

    const unsubscribe = media.on('state-changed', (next) => {
      setMediaState(next);
      // Состояние устройств нужно остальным для индикации на плитке.
      socketRef.current?.emit(EVENTS.MEDIA_STATE, { micOn: next.micOn, camOn: next.camOn });
    });

    async function start() {
      // 1. Устройства. Отказ или их отсутствие не мешают войти в комнату.
      const initialMedia = await media.init();
      if (cancelled) return;
      setMediaState(initialMedia);

      // 2. Сокет.
      setStatus(SESSION_STATUS.JOINING);
      const socket = createSocket();
      socketRef.current = socket;

      socket.on('connect_error', () => {
        if (cancelled) return;
        setStatus(SESSION_STATUS.SERVER_ERROR);
        setError('Не удалось подключиться к серверу. Проверьте, что он запущен, и повторите вход.');
      });

      socket.on('disconnect', () => {
        if (cancelled || leftRef.current) return;
        setStatus(SESSION_STATUS.DISCONNECTED);
        setError('Соединение с сервером потеряно. Вернитесь на стартовый экран и войдите заново.');
      });

      socket.on(EVENTS.PARTICIPANTS, ({ participants: list }) => {
        setParticipants(list);
      });

      socket.on(EVENTS.PEER_MEDIA_STATE, ({ id, micOn, camOn }) => {
        setParticipants((current) =>
          current.map((participant) =>
            participant.id === id ? { ...participant, micOn, camOn } : participant,
          ),
        );
      });

      socket.on(EVENTS.CHAT_MESSAGE, (message) => {
        setMessages((current) => [...current, message]);
      });

      socket.on(EVENTS.CHAT_SYSTEM, (message) => {
        setMessages((current) => [...current, message]);
      });

      socket.connect();

      // 3. Вход в комнату. Ответ сервера — вердикт: лимит проверяется там.
      socket.emit(EVENTS.JOIN, { roomId, name }, (ack) => {
        if (cancelled) return;

        if (!ack?.ok) {
          // Отвергнутый участник обязан отпустить устройства немедленно:
          // иначе у него горит лампочка камеры ради комнаты, куда он не попал.
          media.stopAll();
          socket.disconnect();
          setStatus(SESSION_STATUS.REJECTED);
          setError(JOIN_ERROR_TEXT[ack?.code] ?? 'Не удалось войти в комнату.');
          return;
        }

        setSelfId(ack.selfId);
        setParticipants([
          ...ack.participants,
          { id: ack.selfId, name, micOn: media.state.micOn, camOn: media.state.camOn },
        ]);
        setMessages(ack.messages);
        setStatus(SESSION_STATUS.IN_ROOM);

        // Сервер считает устройства включёнными по умолчанию. Если доступа не
        // дали, нужно сразу поправить индикацию у остальных.
        socket.emit(EVENTS.MEDIA_STATE, {
          micOn: media.state.micOn,
          camOn: media.state.camOn,
        });
      });
    }

    start();

    return () => {
      cancelled = true;
      unsubscribe();
      media.stopAll();
      destroySocket();
      socketRef.current = null;
    };
  }, [roomId, name, media]);

  const toggleMic = useCallback(() => media.toggleMic(), [media]);
  const toggleCamera = useCallback(() => media.toggleCamera(), [media]);

  const leave = useCallback(() => {
    leftRef.current = true;
    socketRef.current?.emit(EVENTS.LEAVE);
    media.stopAll();
    destroySocket();
    socketRef.current = null;
  }, [media]);

  const sendMessage = useCallback((text) => {
    return new Promise((resolve) => {
      const socket = socketRef.current;
      if (!socket) {
        resolve({ ok: false });
        return;
      }
      socket.emit(EVENTS.CHAT_SEND, { text }, resolve);
    });
  }, []);

  return {
    status,
    error,
    selfId,
    participants,
    messages,
    mediaState,
    localStream: media.stream,
    toggleMic,
    toggleCamera,
    sendMessage,
    leave,
  };
}
