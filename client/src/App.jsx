import { useEffect, useState } from 'react';

import { createSocket, destroySocket } from './lib/socket.js';

/**
 * Каркас приложения. Пока показывает только состояние сигнального соединения —
 * это опора для проверки следующих задач: экраны, медиа и mesh появятся дальше.
 */
export default function App() {
  const [status, setStatus] = useState('connecting');
  const [socketConnected, setSocketConnected] = useState(false);

  useEffect(() => {
    const socket = createSocket();

    const onConnect = () => {
      setStatus('connected');
      setSocketConnected(true);
    };
    const onDisconnect = () => {
      setStatus('disconnected');
      setSocketConnected(false);
    };
    const onError = () => {
      setStatus('error');
      setSocketConnected(false);
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onError);
    socket.connect();

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onError);
      destroySocket();
    };
  }, []);

  const statusText = {
    connecting: 'подключение к серверу…',
    connected: 'сигнальный сервер подключён',
    disconnected: 'соединение с сервером закрыто',
    error: 'сервер недоступен',
  }[status];

  return (
    <main className="shell">
      <h1>Видеочат</h1>
      <p className={socketConnected ? 'status status--ok' : 'status status--wait'}>{statusText}</p>
    </main>
  );
}
