import { VIDEO_CONSTRAINTS } from '../config.js';

/**
 * Локальные устройства: захват, тумблеры, реакция на пропажу устройства.
 *
 * Контроллер ничего не знает ни про сокет, ни про соединения — он сообщает о
 * своих изменениях событиями, а подписчики решают, что с этим делать.
 *
 * Главное решение проекта живёт здесь (см. toggleCamera): выключение камеры
 * останавливает дорожку, а не заглушает её, потому что требование — чтобы
 * гасла аппаратная лампочка. Микрофон сделан наоборот, через enabled.
 */
export class LocalMediaController {
  constructor() {
    /** Один и тот же объект на всю сессию: self-view не пересоздаёт srcObject. */
    this.stream = new MediaStream();

    this.micOn = false;
    this.camOn = false;
    this.hasMic = false;
    this.hasCam = false;
    this.error = null;
    /** Устройство пропало уже во время звонка — это отдельный случай отказа. */
    this.deviceLost = false;

    this.listeners = new Map();

    /** Захват в полёте: повторный init() не должен запускать второй. */
    this.initPromise = null;

    /**
     * Номер поколения захвата. Растёт при каждом stopAll и отсекает дорожки,
     * которые приехали от getUserMedia уже после выхода из комнаты: принять
     * такую — значит оставить камеру занятой навсегда.
     */
    this.generation = 0;
  }

  on(event, handler) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event).add(handler);
    return () => this.listeners.get(event)?.delete(handler);
  }

  emit(event, payload) {
    this.listeners.get(event)?.forEach((handler) => handler(payload));
  }

  get state() {
    return {
      micOn: this.micOn,
      camOn: this.camOn,
      hasMic: this.hasMic,
      hasCam: this.hasCam,
      error: this.error,
      deviceLost: this.deviceLost,
    };
  }

  get audioTrack() {
    return this.stream.getAudioTracks()[0] ?? null;
  }

  get videoTrack() {
    return this.stream.getVideoTracks()[0] ?? null;
  }

  /**
   * Захват устройств с последовательной деградацией.
   *
   * Пользователь обязан попасть в комнату при любом исходе: отказ в доступе,
   * отсутствие камеры или занятый другим приложением микрофон не должны
   * выкидывать его из приложения — он просто входит с выключенными
   * устройствами и видит объяснение.
   *
   * Повторный вызов возвращает тот же промис и второго getUserMedia не делает.
   * Это не оптимизация: React в StrictMode монтирует эффект дважды, и два
   * независимых захвата дали бы по две живые дорожки на каждое устройство.
   * Выключение камеры остановило бы только первую — вторая продолжала бы
   * держать камеру, и аппаратная лампочка не погасла бы.
   */
  init() {
    if (!this.initPromise) this.initPromise = this.acquire(this.generation);
    return this.initPromise;
  }

  async acquire(generation) {
    const both = await this.request({ audio: true, video: VIDEO_CONSTRAINTS });
    if (both.ok) {
      this.adoptTracks(both.stream, generation);
      this.emit('state-changed', this.state);
      return this.state;
    }

    // Пробуем устройства по отдельности: отсутствие камеры не повод остаться
    // ещё и без звука.
    const [audio, video] = await Promise.all([
      this.request({ audio: true, video: false }),
      this.requestVideo(),
    ]);

    if (audio.ok) this.adoptTracks(audio.stream, generation);
    if (video.ok) this.adoptTracks(video.stream, generation);

    if (!audio.ok && !video.ok) {
      this.error = describeMediaError(both.error ?? audio.error ?? video.error);
    } else if (!audio.ok || !video.ok) {
      this.error = describeMediaError((audio.ok ? video : audio).error);
    }

    this.emit('state-changed', this.state);
    return this.state;
  }

  async request(constraints) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      return { ok: true, stream, error: null };
    } catch (error) {
      return { ok: false, stream: null, error };
    }
  }

  /**
   * Видео с ослаблением ограничений: если камера не умеет 720p, берём то,
   * что она может, вместо того чтобы остаться без видео вовсе.
   */
  async requestVideo() {
    const result = await this.request({ audio: false, video: VIDEO_CONSTRAINTS });
    if (result.ok || result.error?.name !== 'OverconstrainedError') return result;

    return this.request({ audio: false, video: true });
  }

  adoptTracks(stream, generation) {
    // Захват завершился уже после выхода из комнаты: такие дорожки не
    // принимаем, а гасим сразу — иначе устройство останется занятым.
    if (generation !== this.generation) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }

    stream.getTracks().forEach((track) => {
      this.attachTrack(track);

      if (track.kind === 'audio') {
        this.hasMic = true;
        this.micOn = true;
      } else {
        this.hasCam = true;
        this.camOn = true;
      }
    });
  }

  /**
   * Кладёт дорожку в общий поток, гарантируя одну дорожку на устройство.
   *
   * Если дорожка того же типа уже есть, старая останавливается и выбрасывается.
   * Две живые дорожки с одной камеры — это ровно тот случай, когда выключение
   * останавливает одну, а устройство остаётся занятым второй.
   */
  attachTrack(track) {
    this.stream
      .getTracks()
      .filter((existing) => existing.kind === track.kind && existing !== track)
      .forEach((existing) => {
        this.stream.removeTrack(existing);
        existing.stop();
      });

    this.stream.addTrack(track);
    this.watchTrack(track);
  }

  /** Останавливает и выбрасывает все видеодорожки — ни одной live не остаётся. */
  stopVideoTracks() {
    this.stream.getVideoTracks().forEach((track) => {
      this.stream.removeTrack(track);
      track.stop();
    });
  }

  /**
   * Потеря устройства во время звонка (требование 20 PRD).
   *
   * Событие ended прилетает, когда камеру выдернули из порта, устройство
   * перехватило другое приложение или система отозвала доступ. Поток нужно
   * корректно погасить: дорожку убрать, соединениям сообщить, состояние
   * сбросить. Автоматически перезахватывать устройство мы не пытаемся —
   * по PRD восстановление выполняет пользователь через настройки браузера
   * или системы.
   */
  watchTrack(track) {
    track.addEventListener('ended', () => {
      if (!this.stream.getTracks().includes(track)) return;

      this.stream.removeTrack(track);

      if (track.kind === 'audio') {
        this.hasMic = false;
        this.micOn = false;
      } else {
        this.hasCam = false;
        this.camOn = false;
        // Убираем дорожку из всех соединений, иначе собеседники будут
        // смотреть на застывший кадр вместо заглушки.
        this.emit('video-track-changed', null);
      }

      this.deviceLost = true;
      this.error = 'Устройство стало недоступно. Проверьте его в настройках браузера или системы.';
      this.emit('state-changed', this.state);
    });
  }

  /**
   * Микрофон: мгновенное переключение без пересоздания дорожки.
   *
   * Асимметрия с камерой намеренная. Требования гасить индикатор микрофона
   * нет, а цена симметричного решения высока: каждое включение стоило бы
   * повторного getUserMedia — сотни миллисекунд задержки и риск получить
   * занятое устройство. Микрофоном щёлкают в разы чаще, чем камерой, и
   * задержка на кнопке mute ощущается как поломка.
   */
  toggleMic() {
    const track = this.audioTrack;
    if (!track) return this.state;

    this.micOn = !this.micOn;
    track.enabled = this.micOn;

    this.emit('state-changed', this.state);
    return this.state;
  }

  /**
   * Камера: выключение останавливает дорожку и гасит аппаратную лампочку,
   * включение захватывает устройство заново.
   *
   * enabled = false здесь не подходит: дорожка осталась бы живой, устройство
   * занятым, а лампочка горящей — пользователь справедливо считал бы, что его
   * продолжают снимать.
   */
  async toggleCamera() {
    if (this.camOn) {
      this.stopVideoTracks();

      this.camOn = false;
      this.emit('video-track-changed', null);
      this.emit('state-changed', this.state);
      return this.state;
    }

    const generation = this.generation;
    const result = await this.requestVideo();
    if (!result.ok) {
      this.error = describeMediaError(result.error);
      this.emit('state-changed', this.state);
      return this.state;
    }

    const [track] = result.stream.getVideoTracks();

    // Пока камера захватывалась, пользователь мог выйти из комнаты. Показывать
    // эту дорожку уже некому, а жить она будет и дальше — гасим.
    if (generation !== this.generation) {
      track.stop();
      return this.state;
    }

    this.attachTrack(track);

    this.hasCam = true;
    this.camOn = true;
    this.error = null;
    this.deviceLost = false;

    this.emit('video-track-changed', track);
    this.emit('state-changed', this.state);
    return this.state;
  }

  /**
   * Освобождает все устройства. Вызывается при выходе из комнаты и при отказе
   * в слоте: у отвергнутого пятого участника лампочка гореть не должна.
   */
  stopAll() {
    // Смена поколения отсекает захваты, которые сейчас в полёте: их дорожки
    // приедут уже после выхода и будут остановлены, а не подложены в поток.
    this.generation += 1;
    this.initPromise = null;

    this.stream.getTracks().forEach((track) => {
      this.stream.removeTrack(track);
      track.stop();
    });

    this.micOn = false;
    this.camOn = false;
    this.emit('state-changed', this.state);
  }
}

/** Понятный текст вместо кода DOMException. */
export function describeMediaError(error) {
  switch (error?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Доступ к камере и микрофону не разрешён. Вы в комнате, но вас не видно и не слышно — выдайте доступ в настройках браузера и перезайдите.';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return 'Камера или микрофон не найдены. Вы в комнате, отсутствующие устройства выключены.';
    case 'NotReadableError':
    case 'TrackStartError':
      return 'Устройство занято другим приложением. Закройте его и перезайдите в комнату.';
    case 'OverconstrainedError':
      return 'Камера не поддерживает запрошенные параметры.';
    default:
      return 'Не удалось получить доступ к камере и микрофону.';
  }
}
