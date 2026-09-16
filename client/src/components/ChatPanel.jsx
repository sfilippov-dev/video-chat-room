import { useState } from 'react';

import { MESSAGE_TYPES, SYSTEM_EVENTS, ERROR_CODES } from '../lib/events.js';
import { MAX_MESSAGE_LENGTH } from '../config.js';
import { useAutoScroll } from '../hooks/useAutoScroll.js';
import { SendIcon } from './icons.jsx';

/**
 * Общий чат комнаты.
 *
 * Лента приходит с сервера целиком: история — в ack при входе, новые записи —
 * событиями. Клиент ничего не досочиняет и не сортирует, поэтому порядок
 * сообщений у всех участников одинаковый.
 *
 * Весь текст рендерится как children JSX и потому экранируется React'ом.
 * dangerouslySetInnerHTML не используется нигде — присланная разметка обязана
 * остаться текстом.
 */
export default function ChatPanel({ messages, selfId, onSend }) {
  const [text, setText] = useState('');
  const [error, setError] = useState(null);

  const listRef = useAutoScroll(messages.length);

  const trimmed = text.trim();

  async function handleSubmit(event) {
    event.preventDefault();
    // Пустое или пробельное сообщение не отправляется: тот же запрет живёт и
    // на сервере, клиентская проверка здесь только ради подсказки.
    if (!trimmed) return;

    setText('');
    setError(null);

    const ack = await onSend(trimmed);
    if (!ack?.ok) setError(SEND_ERROR_TEXT[ack?.code] ?? 'Сообщение не отправлено.');
  }

  return (
    <section className="chat">
      <h2 className="chat__title">Чат</h2>

      <ol className="chat__list" ref={listRef}>
        {messages.map((message, index) => {
          if (message.type === MESSAGE_TYPES.SYSTEM) {
            return (
              <li key={message.id} className="chat__item chat__item--system">
                {systemText(message)}
              </li>
            );
          }

          /*
           * Несколько сообщений подряд от одного человека — это одна реплика,
           * разбитая на строки. Шапку с именем и временем печатаем только над
           * первой из них: повторять имя у каждой строки значит превращать
           * ленту в столбец подписей, в котором теряется сам текст. Системная
           * строка разрывает серию — после неё разговор начинается заново.
           */
          const previous = messages[index - 1];
          const grouped =
            previous?.type !== MESSAGE_TYPES.SYSTEM && previous?.authorId === message.authorId;

          return (
            <li
              key={message.id}
              className={
                `chat__item${grouped ? ' chat__item--follow' : ' chat__item--first'}` +
                `${message.authorId === selfId ? ' chat__item--own' : ''}`
              }
            >
              {grouped ? null : (
                <span className="chat__meta">
                  <span className="chat__author">{message.name}</span>
                  <time className="chat__time" dateTime={new Date(message.ts).toISOString()}>
                    {formatTime(message.ts)}
                  </time>
                </span>
              )}
              <span className="chat__text">{message.text}</span>
            </li>
          );
        })}
      </ol>

      <form className="chat__form" onSubmit={handleSubmit}>
        <input
          className="field__input"
          type="text"
          value={text}
          maxLength={MAX_MESSAGE_LENGTH}
          placeholder="Сообщение"
          aria-label="Сообщение"
          onChange={(event) => setText(event.target.value)}
        />
        <button
          className="icon-button icon-button--accent icon-button--small"
          type="submit"
          disabled={!trimmed}
          aria-label="Отправить"
          title="Отправить"
        >
          <SendIcon className="icon-button__glyph icon-button__glyph--solid" />
        </button>
      </form>

      {error ? (
        <p className="chat__error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}

const SEND_ERROR_TEXT = {
  [ERROR_CODES.RATE_LIMITED]: 'Слишком часто. Подождите пару секунд.',
  [ERROR_CODES.MESSAGE_TOO_LONG]: `Слишком длинное сообщение: не больше ${MAX_MESSAGE_LENGTH} символов.`,
  [ERROR_CODES.EMPTY_MESSAGE]: 'Пустое сообщение не отправляется.',
};

/**
 * В истории хранится семантический код события, а не готовая фраза: текст
 * собирается здесь, чтобы формулировку можно было менять в одном месте.
 *
 * Про выход говорим «покинул комнату» и на кнопку «Выйти», и на обрыв связи:
 * сервер эти случаи не различает, поэтому обещать «соединение потеряно» он не
 * вправе.
 */
function systemText({ name, text }) {
  if (text === SYSTEM_EVENTS.JOINED) return `${name} присоединился к комнате`;
  if (text === SYSTEM_EVENTS.LEFT) return `${name} покинул комнату`;
  return name;
}

/** Часы и минуты по локальному времени клиента: сервер отдаёт только epoch. */
const timeFormatter = new Intl.DateTimeFormat('ru-RU', {
  hour: '2-digit',
  minute: '2-digit',
});

function formatTime(ts) {
  return timeFormatter.format(new Date(ts));
}
