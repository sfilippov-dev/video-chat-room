import { useEffect, useState } from 'react';

/**
 * Панель управления устройствами и ссылкой-приглашением.
 *
 * Микрофон переключается мгновенно — через enabled у дорожки, без повторного
 * захвата устройства. Остальные узнают о состоянии не по факту прихода звука,
 * а из события сервера: индикация на плитке не должна ничего домысливать.
 *
 * Камера работает иначе: выключение останавливает дорожку и освобождает
 * устройство, включение захватывает его заново. Это занимает сотни
 * миллисекунд, поэтому на время переключения кнопка блокируется — двойной клик
 * не должен запускать второй захват поверх первого.
 */
export default function ControlBar({
  micOn,
  hasMic,
  camOn,
  hasCam,
  inviteUrl,
  onToggleMic,
  onToggleCamera,
}) {
  const [switchingCamera, setSwitchingCamera] = useState(false);
  const [copyState, setCopyState] = useState('idle');

  // Подтверждение «скопировано» живёт несколько секунд: висящая навсегда
  // плашка перестаёт означать результат последнего нажатия.
  useEffect(() => {
    if (copyState !== 'copied') return undefined;

    const timer = setTimeout(() => setCopyState('idle'), 4000);
    return () => clearTimeout(timer);
  }, [copyState]);

  async function handleToggleCamera() {
    setSwitchingCamera(true);
    try {
      await onToggleCamera();
    } finally {
      setSwitchingCamera(false);
    }
  }

  /**
   * Clipboard API доступен не всегда: браузер может отказать без жеста, в
   * незащищённом контексте его нет вовсе. На этот случай показываем поле со
   * ссылкой — скопировать вручную всегда можно.
   */
  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopyState('copied');
    } catch {
      setCopyState('manual');
    }
  }

  return (
    <div className="controls">
      <div className="controls__row">
        <button
          className={`button controls__button${micOn ? '' : ' controls__button--off'}`}
          type="button"
          onClick={onToggleMic}
          disabled={!hasMic}
          aria-pressed={micOn}
          title={hasMic ? undefined : 'Микрофон недоступен'}
        >
          {micOn ? 'Выключить микрофон' : 'Включить микрофон'}
        </button>

        <button
          className={`button controls__button${camOn ? '' : ' controls__button--off'}`}
          type="button"
          onClick={handleToggleCamera}
          disabled={!hasCam || switchingCamera}
          aria-pressed={camOn}
          title={hasCam ? undefined : 'Камера недоступна'}
        >
          {camOn ? 'Выключить камеру' : 'Включить камеру'}
        </button>

        <button className="button" type="button" onClick={handleCopy}>
          Копировать ссылку
        </button>
      </div>

      {copyState === 'copied' ? (
        <p className="controls__hint status status--ok" role="status">
          Ссылка скопирована
        </p>
      ) : null}

      {copyState === 'manual' ? (
        <label className="controls__fallback">
          <span className="field__label">Скопируйте ссылку вручную</span>
          <input
            className="field__input"
            type="text"
            value={inviteUrl}
            readOnly
            onFocus={(event) => event.target.select()}
          />
        </label>
      ) : null}
    </div>
  );
}
