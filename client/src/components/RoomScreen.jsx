/**
 * Экран комнаты. Пока каркас: сессия, медиа и видеосетка подключаются
 * следующими задачами.
 */
export default function RoomScreen({ roomId, name, onLeave }) {
  return (
    <main className="shell">
      <header className="room-header">
        <h1 className="title title--small">Комната</h1>
        <button className="button" type="button" onClick={onLeave}>
          Выйти
        </button>
      </header>

      <p className="subtitle">
        Вы вошли как <strong>{name}</strong>
      </p>
      <p className="note">Идентификатор комнаты: {roomId}</p>
    </main>
  );
}
