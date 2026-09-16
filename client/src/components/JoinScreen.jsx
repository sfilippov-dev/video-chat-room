import { useState } from 'react';

import { MAX_NAME_LENGTH, NAME_PATTERN } from '../config.js';

/**
 * Стартовый экран: единственное, что требуется от пользователя, — имя.
 * Регистрации нет, пароля нет, имя между перезагрузками не запоминается:
 * никакого localStorage и sessionStorage в проекте нет вообще.
 */
export default function JoinScreen({ mode, onSubmit }) {
  const [name, setName] = useState('');
  const [error, setError] = useState(null);

  const isCreating = mode === 'create';
  const trimmed = name.trim();

  function handleSubmit(event) {
    event.preventDefault();

    if (trimmed.length === 0) {
      setError('Введите имя, чтобы участники вас узнавали');
      return;
    }
    if (!NAME_PATTERN.test(trimmed)) {
      setError('Допустимы буквы, цифры, пробел, дефис и подчёркивание');
      return;
    }

    setError(null);
    onSubmit(trimmed);
  }

  return (
    <main className="shell shell--narrow">
      <h1 className="title">Видеочат</h1>
      <p className="subtitle">
        {isCreating
          ? 'Создайте комнату и отправьте ссылку тем, кого хотите позвать. До четырёх участников.'
          : 'Вас пригласили в комнату. Представьтесь, чтобы войти.'}
      </p>

      <form className="join-form" onSubmit={handleSubmit} noValidate>
        <label className="field">
          <span className="field__label">Ваше имя</span>
          <input
            className="field__input"
            type="text"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              if (error) setError(null);
            }}
            maxLength={MAX_NAME_LENGTH}
            placeholder="Например, Алексей"
            autoFocus
          />
          <span className="field__hint">
            {trimmed.length}/{MAX_NAME_LENGTH}
          </span>
        </label>

        {error ? (
          <p className="field__error" role="alert">
            {error}
          </p>
        ) : null}

        <button className="button button--primary" type="submit" disabled={trimmed.length === 0}>
          {isCreating ? 'Создать комнату' : 'Войти'}
        </button>
      </form>

      <p className="note">
        Имя не сохраняется: после перезагрузки страницы его нужно ввести заново.
      </p>
    </main>
  );
}
