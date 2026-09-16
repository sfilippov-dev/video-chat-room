import { useEffect, useRef, useState } from 'react';

import { MutedMicIcon, SilhouetteIcon } from './icons.jsx';

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

  /*
   * Подпись с именем рисуется ровно один раз и переезжает вместе с картинкой:
   * поверх видео она лежит плашкой в углу кадра, а в заглушке встаёт в поток
   * под силуэтом. Дублировать имя в обоих местах нельзя — на плитке размером
   * с ладонь одно и то же слово дважды читается как ошибка вёрстки.
   */
  const caption = (
    <span className={`tile__caption${showVideo ? ' tile__caption--overlay' : ''}`}>
      <span className="tile__name">
        {participant.name}
        {isSelf ? ' (вы)' : ''}
      </span>
      {participant.micOn ? null : <MutedMicIcon className="tile__mic" />}
    </span>
  );

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
          <span className="tile__avatar">
            <SilhouetteIcon className="tile__silhouette" />
          </span>
          {caption}
        </div>
      )}

      {connectionFailed ? (
        <p className="tile__error" role="alert">
          <span className="tile__error-dot" aria-hidden="true" />
          Не удалось установить соединение с участником
        </p>
      ) : null}

      {/* Устройство пропало во время звонка: выглядит так же, как ручное
          выключение, но причина другая, и её нужно назвать. */}
      {deviceLost ? (
        <p className="tile__error tile__error--warning" role="alert">
          <span className="tile__error-dot" aria-hidden="true" />
          Устройство недоступно
        </p>
      ) : null}

      {needsGesture && !isSelf ? (
        <button className="button tile__sound" type="button" onClick={handleEnableSound}>
          Включить звук
        </button>
      ) : null}

      {showVideo ? caption : null}
    </div>
  );
}
