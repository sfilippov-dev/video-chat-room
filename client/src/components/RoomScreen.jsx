import { useRoomSession, SESSION_STATUS } from '../hooks/useRoomSession.js';
import VideoGrid from './VideoGrid.jsx';
import ControlBar from './ControlBar.jsx';
import ChatPanel from './ChatPanel.jsx';
import ParticipantList from './ParticipantList.jsx';
import Notice, { NoticeScreen } from './Notice.jsx';
import { ERROR_CODES } from '../lib/events.js';

/**
 * Экран комнаты: видеосетка, панель управления, состав комнаты и чат.
 *
 * Выход по кнопке отпускает устройства, закрывает соединения и возвращает на
 * стартовый экран. Закрытие вкладки специально не перехватывается: сервер сам
 * видит разрыв сокета и обрабатывает его тем же кодом, так что костыль на
 * beforeunload только добавил бы второй путь к одному результату.
 */
export default function RoomScreen({ roomId, name, onLeave }) {
  const session = useRoomSession({ roomId, name });

  // Ссылка-приглашение — это адрес самой комнаты: любой, кто её откроет,
  // попадёт сюда же. Собираем из origin, а не берём location.href, чтобы в
  // ссылку не уехали случайные параметры запроса.
  const inviteUrl = `${window.location.origin}/${roomId}`;

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
      <NoticeScreen
        title={failureTitle(session.status, session.errorCode)}
        text={session.error}
        actionLabel={
          session.status === SESSION_STATUS.DISCONNECTED
            ? 'Вернуться на стартовый экран'
            : 'Повторить вход'
        }
        onAction={onLeave}
      />
    );
  }

  return (
    <main className="shell shell--room">
      <header className="room-header">
        <h1 className="title title--small">Комната</h1>
      </header>

      {session.mediaState.error ? (
        <div className="room-notice">
          <Notice tone="warning" text={session.mediaState.error} />
        </div>
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
            inviteUrl={inviteUrl}
            onToggleMic={session.toggleMic}
            onToggleCamera={session.toggleCamera}
            onLeave={handleLeave}
          />
        </div>

        <aside className="room-side">
          <ParticipantList participants={session.participants} selfId={session.selfId} />

          <ChatPanel
            messages={session.messages}
            selfId={session.selfId}
            onSend={session.sendMessage}
          />
        </aside>
      </div>
    </main>
  );
}

/**
 * Заголовок экрана отказа. Причина называется прямо: «Комната заполнена» —
 * это совсем не то же самое, что «сервер недоступен», и пользователю нужно
 * разное действие в ответ.
 */
function failureTitle(status, errorCode) {
  if (status === SESSION_STATUS.SERVER_ERROR) return 'Сервер недоступен';
  if (status === SESSION_STATUS.DISCONNECTED) return 'Соединение с сервером потеряно';

  switch (errorCode) {
    case ERROR_CODES.ROOM_FULL:
      return 'Комната заполнена';
    case ERROR_CODES.INVALID_NAME:
      return 'Имя не принято';
    case ERROR_CODES.INVALID_ROOM:
      return 'Некорректная ссылка';
    default:
      return 'Не удалось войти в комнату';
  }
}
