import { useRoomSession, SESSION_STATUS } from '../hooks/useRoomSession.js';
import VideoGrid from './VideoGrid.jsx';
import ControlBar from './ControlBar.jsx';
import ChatPanel from './ChatPanel.jsx';

/**
 * Экран комнаты. Видеосетка, панель управления и чат подключаются следующими
 * задачами; сейчас здесь состояние сессии и состав комнаты.
 */
export default function RoomScreen({ roomId, name, onLeave }) {
  const session = useRoomSession({ roomId, name });

  function handleLeave() {
    session.leave();
    onLeave();
  }

  if (session.status === SESSION_STATUS.ACQUIRING) {
    return (
      <main className="shell shell--narrow">
        <h1 className="title">Подключаемся…</h1>
        <p className="subtitle">Запрашиваем доступ к камере и микрофону.</p>
      </main>
    );
  }

  if (
    session.status === SESSION_STATUS.REJECTED ||
    session.status === SESSION_STATUS.SERVER_ERROR ||
    session.status === SESSION_STATUS.DISCONNECTED
  ) {
    return (
      <main className="shell shell--narrow">
        <h1 className="title">Не получилось</h1>
        <p className="notice notice--error" role="alert">
          {session.error}
        </p>
        <p className="room-actions">
          <button className="button button--primary" type="button" onClick={onLeave}>
            Повторить вход
          </button>
        </p>
      </main>
    );
  }

  return (
    <main className="shell">
      <header className="room-header">
        <h1 className="title title--small">
          Комната · {session.participants.length} из 4
        </h1>
        <button className="button" type="button" onClick={handleLeave}>
          Выйти
        </button>
      </header>

      {session.mediaState.error ? (
        <p className="notice notice--warning" role="alert">
          {session.mediaState.error}
        </p>
      ) : null}

      <div className="room-layout">
        <div className="room-main">
          <VideoGrid
            participants={session.participants}
            selfId={session.selfId}
            localStream={session.localStream}
            remoteStreams={session.remoteStreams}
            failedPeers={session.failedPeers}
            mediaState={session.mediaState}
          />

          <ControlBar
            micOn={session.mediaState.micOn}
            hasMic={session.mediaState.hasMic}
            camOn={session.mediaState.camOn}
            hasCam={session.mediaState.hasCam}
            onToggleMic={session.toggleMic}
            onToggleCamera={session.toggleCamera}
          />
        </div>

        <ChatPanel
          messages={session.messages}
          selfId={session.selfId}
          onSend={session.sendMessage}
        />
      </div>
    </main>
  );
}
