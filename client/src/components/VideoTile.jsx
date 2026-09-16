import { useEffect, useRef, useState } from 'react';

/**
 * Плитка участника: видео либо заглушка, имя оверлеем, индикатор микрофона.
 *
 * Про autoplay. Жест пользователя у нас уже был — это кнопка входа в комнату,
 * поэтому удалённое аудио играет само. Если браузер всё же отклонил
 * воспроизведение, показываем кнопку «Включить звук» вместо молчаливой
 * тишины, в которой пользователь винит приложение.
 *
 * Про muted на своей плитке. Это не косметика: без него собственный микрофон
 * играет в собственные динамики и даёт эхо и свист.
 */
export default function VideoTile({ participant, stream, isSelf, connectionFailed, deviceLost }) {
  const videoRef = useRef(null);
  const [needsGesture, setNeedsGesture] = useState(false);

  const showVideo = Boolean(stream) && participant.camOn;

  useEffect(() => {
    const element = videoRef.current;
    if (!element) return undefined;

    if (element.srcObject !== stream) {
      element.srcObject = stream ?? null;
    }

    if (stream) {
      const played = element.play();
      if (played?.catch) {
        played.catch(() => setNeedsGesture(true));
      }
    }

    // Плитка исчезает вместе с участником: отпускаем поток, чтобы за ним не
    // тянулся живой объект после выхода собеседника.
    return () => {
      element.srcObject = null;
    };
  }, [stream, showVideo]);

  async function handleEnableSound() {
    try {
      await videoRef.current?.play();
      setNeedsGesture(false);
    } catch {
      setNeedsGesture(true);
    }
  }

  return (
    <div className={`tile${isSelf ? ' tile--self' : ''}`}>
      <video
        ref={videoRef}
        className={`tile__video${showVideo ? '' : ' tile__video--hidden'}`}
        autoPlay
        playsInline
        muted={isSelf}
      />

      {showVideo ? null : (
        <div className="tile__placeholder">
          <Silhouette />
        </div>
      )}

      {connectionFailed ? (
        <p className="tile__error" role="alert">
          Не удалось установить соединение с участником
        </p>
      ) : null}

      {/* Устройство пропало во время звонка: выглядит так же, как ручное
          выключение, но причина другая, и её нужно назвать. */}
      {deviceLost ? (
        <p className="tile__error tile__error--warning" role="alert">
          Устройство недоступно
        </p>
      ) : null}

      {needsGesture && !isSelf ? (
        <button className="button tile__sound" type="button" onClick={handleEnableSound}>
          Включить звук
        </button>
      ) : null}

      <div className="tile__overlay">
        <span className="tile__name">
          {participant.name}
          {isSelf ? ' (вы)' : ''}
        </span>
        {participant.micOn ? null : <MutedMicIcon />}
      </div>
    </div>
  );
}

function Silhouette() {
  return (
    <svg viewBox="0 0 64 64" className="tile__silhouette" aria-hidden="true">
      <circle cx="32" cy="23" r="12" />
      <path d="M8 60c0-13 11-20 24-20s24 7 24 20z" />
    </svg>
  );
}

function MutedMicIcon() {
  return (
    <svg viewBox="0 0 24 24" className="tile__mic" role="img" aria-label="Микрофон выключен">
      <path d="M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3 3 3 0 0 1-3-3V6a3 3 0 0 1 3-3z" />
      <path d="M5 11a7 7 0 0 0 14 0" fill="none" strokeWidth="2" stroke="currentColor" />
      <path d="M12 18v3" fill="none" strokeWidth="2" stroke="currentColor" />
      <path d="M3 3l18 18" fill="none" strokeWidth="2.5" stroke="currentColor" />
    </svg>
  );
}
