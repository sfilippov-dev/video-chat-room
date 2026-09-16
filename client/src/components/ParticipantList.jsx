import { MAX_PARTICIPANTS } from '../config.js';

/**
 * Актуальный состав комнаты.
 *
 * Источник правды — сервер: список приходит событием participants после
 * каждого изменения состава, а не собирается из факта прихода медиапотоков.
 *
 * Внутренние идентификаторы не показываются нигде: одинаковые имена в комнате
 * разрешены и различаются только внутри системы.
 */
export default function ParticipantList({ participants, selfId }) {
  return (
    <section className="participants">
      <h2 className="participants__title">
        Участники · {participants.length} из {MAX_PARTICIPANTS}
      </h2>

      <ul className="participant-list">
        {participants.map((participant) => (
          <li
            key={participant.id}
            className={`participant-list__item${
              participant.id === selfId ? ' participant-list__item--self' : ''
            }`}
          >
            {/* Кружок с первой буквой имени: строка опознаётся боковым зрением
                раньше, чем прочитана. Буква декоративна — имя рядом полное. */}
            <span className="participant-list__avatar" aria-hidden="true">
              {participant.name.trim().charAt(0)}
            </span>
            <span>
              {participant.name}
              {participant.id === selfId ? ' (вы)' : ''}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
