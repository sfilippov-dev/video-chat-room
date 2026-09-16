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
          <li key={participant.id} className="participant-list__item">
            {participant.name}
            {participant.id === selfId ? ' (вы)' : ''}
          </li>
        ))}
      </ul>
    </section>
  );
}
