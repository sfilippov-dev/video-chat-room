import { useEffect, useState } from 'react';

import {
  MicIcon,
  MicOffIcon,
  CameraIcon,
  CameraOffIcon,
  LinkIcon,
  HangUpIcon,
} from './icons.jsx';

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
  onLeave,
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

  const micLabel = micOn ? 'Выключить микрофон' : 'Включить микрофон';
  const camLabel = camOn ? 'Выключить камеру' : 'Включить камеру';

  return (
    <div className="controls">
      <div className="controls__row">
        <IconButton
          label={micLabel}
          unavailableLabel={hasMic ? null : 'Микрофон недоступен'}
          onClick={onToggleMic}
          disabled={!hasMic}
          pressed={micOn}
          off={!micOn}
        >
          {micOn ? <MicIcon className="icon-button__glyph" /> : <MicOffIcon className="icon-button__glyph" />}
        </IconButton>

        <IconButton
          label={camLabel}
          unavailableLabel={hasCam ? null : 'Камера недоступна'}
          onClick={handleToggleCamera}
          disabled={!hasCam || switchingCamera}
          pressed={camOn}
          off={!camOn}
        >
          {camOn ? (
            <CameraIcon className="icon-button__glyph" />
          ) : (
            <CameraOffIcon className="icon-button__glyph" />
          )}
        </IconButton>

        <IconButton label="Копировать ссылку" onClick={handleCopy}>
          <LinkIcon className="icon-button__glyph" />
        </IconButton>

        <span className="controls__divider" aria-hidden="true" />

        <IconButton label="Выйти" onClick={onLeave} tone="danger">
          <HangUpIcon className="icon-button__glyph" />
        </IconButton>
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

/**
 * Круглая кнопка панели: иконка вместо надписи, подпись всплывает.
 *
 * Подпись не пропадает, а меняет носитель. Пока кнопка живая, её показывает
 * собственная всплывашка в стиле интерфейса; выключенная кнопка в Chrome и
 * Safari вообще не получает событий мыши, поэтому там подпись отдаётся
 * браузеру через title. Два механизма никогда не работают одновременно, иначе
 * пользователь увидел бы две подсказки разом. Имя для чтения с экрана всегда
 * берётся из aria-label и от состояния кнопки не зависит.
 */
function IconButton({
  label,
  unavailableLabel = null,
  onClick,
  disabled = false,
  pressed,
  off = false,
  tone = null,
  children,
}) {
  const tip = unavailableLabel ?? label;

  return (
    <button
      className={`icon-button${off ? ' icon-button--off' : ''}${tone ? ` icon-button--${tone}` : ''}`}
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={pressed}
      aria-label={label}
      title={disabled ? tip : undefined}
    >
      {children}
      {disabled ? null : (
        <span className="icon-button__tip" aria-hidden="true">
          {tip}
        </span>
      )}
    </button>
  );
}
