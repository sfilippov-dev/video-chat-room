import { useState } from 'react';

/**
 * Панель управления устройствами.
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
export default function ControlBar({ micOn, hasMic, camOn, hasCam, onToggleMic, onToggleCamera }) {
  const [switchingCamera, setSwitchingCamera] = useState(false);

  async function handleToggleCamera() {
    setSwitchingCamera(true);
    try {
      await onToggleCamera();
    } finally {
      setSwitchingCamera(false);
    }
  }

  return (
    <div className="controls">
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
    </div>
  );
}
