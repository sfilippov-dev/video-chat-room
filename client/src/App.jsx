import { useEffect, useState } from 'react';

import JoinScreen from './components/JoinScreen.jsx';
import RoomScreen from './components/RoomScreen.jsx';
import { checkBrowserSupport } from './lib/browserSupport.js';
import {
  readRoomIdFromPath,
  navigateToRoom,
  navigateToStart,
  createRoomId,
} from './lib/routing.js';

const UNSUPPORTED_TEXT = {
  webrtc: 'Ваш браузер не поддерживает WebRTC. Откройте приложение в Chrome, Firefox или Edge версии 100 и новее.',
  'media-devices':
    'Браузер не даёт доступ к камере и микрофону. Обновите его до актуальной версии.',
  insecure:
    'Камера и микрофон доступны только на защищённом соединении. Откройте приложение по адресу localhost или по HTTPS.',
};

/**
 * Корневой компонент: разбирает адрес и решает, какой экран показать.
 *
 * Имя живёт только в состоянии React. Перезагрузка страницы — это новый вход
 * с повторным вводом имени: сохранять что-либо на клиенте запрещено.
 */
export default function App() {
  const [roomId, setRoomId] = useState(() => readRoomIdFromPath());
  const [name, setName] = useState(null);
  const [support] = useState(() => checkBrowserSupport());

  useEffect(() => {
    // Кнопки «назад» и «вперёд» не должны оставлять пользователя в комнате,
    // адрес которой он уже покинул.
    function handlePopState() {
      const nextRoomId = readRoomIdFromPath();
      setRoomId(nextRoomId);
      if (!nextRoomId) setName(null);
    }

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  if (!support.supported) {
    return (
      <main className="shell shell--narrow">
        <h1 className="title">Видеочат</h1>
        <p className="notice notice--error" role="alert">
          {UNSUPPORTED_TEXT[support.reason]}
        </p>
      </main>
    );
  }

  function handleCreateRoom(enteredName) {
    const newRoomId = createRoomId();
    setName(enteredName);
    setRoomId(newRoomId);
    navigateToRoom(newRoomId);
  }

  function handleJoinRoom(enteredName) {
    setName(enteredName);
  }

  function handleLeave() {
    setName(null);
    setRoomId(null);
    navigateToStart();
  }

  if (!roomId) {
    return <JoinScreen mode="create" onSubmit={handleCreateRoom} />;
  }

  if (!name) {
    return <JoinScreen mode="join" onSubmit={handleJoinRoom} />;
  }

  return <RoomScreen roomId={roomId} name={name} onLeave={handleLeave} />;
}
