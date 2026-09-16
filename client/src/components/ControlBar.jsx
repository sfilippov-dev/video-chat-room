/**
 * Панель управления устройствами.
 *
 * Микрофон переключается мгновенно — через enabled у дорожки, без повторного
 * захвата устройства. Остальные узнают о состоянии не по факту прихода звука,
 * а из события сервера: индикация на плитке не должна ничего домысливать.
 */
export default function ControlBar({ micOn, hasMic, onToggleMic }) {
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
    </div>
  );
}
