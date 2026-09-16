import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { LocalMediaController } from './LocalMediaController.js';

/**
 * Подставные устройства вместо настоящих.
 *
 * jsdom не знает ни MediaStream, ни getUserMedia, и это здесь скорее плюс:
 * проверять нужно не браузер, а учёт дорожек. Главный вопрос ко всему модулю —
 * «осталась ли хоть одна живая видеодорожка» — на подставных устройствах
 * задаётся точно так же, как на настоящих, потому что живость дорожки это
 * readyState, а не картинка с матрицы.
 *
 * Поведение подставок повторяет настоящее в трёх местах, где отличие сломало бы
 * смысл теста: stop() гасит дорожку, но события ended не шлёт (его шлёт только
 * система, когда устройство пропало); getUserMedia с двумя устройствами
 * отказывает целиком, если недоступно любое из них; OverconstrainedError
 * приходит на подробные ограничения, но не на video: true.
 */
class FakeTrack extends EventTarget {
  constructor(kind) {
    super();
    this.kind = kind;
    this.enabled = true;
    this.readyState = 'live';
  }

  stop() {
    this.readyState = 'ended';
  }
}

class FakeStream {
  constructor(tracks = []) {
    this.tracks = [...tracks];
  }

  getTracks() {
    return [...this.tracks];
  }

  getAudioTracks() {
    return this.tracks.filter((track) => track.kind === 'audio');
  }

  getVideoTracks() {
    return this.tracks.filter((track) => track.kind === 'video');
  }

  addTrack(track) {
    if (!this.tracks.includes(track)) this.tracks.push(track);
  }

  removeTrack(track) {
    this.tracks = this.tracks.filter((existing) => existing !== track);
  }
}

function mediaError(name) {
  const error = new Error(name);
  error.name = name;
  return error;
}

/**
 * Состояние устройств на время теста.
 *
 * mic и cam принимают 'ok', имя DOMException («NotAllowedError») или
 * 'only-plain' — камера, которая не умеет запрошенные 1280×720 и отвечает
 * OverconstrainedError на всё, кроме голого video: true.
 *
 * manual откладывает выдачу дорожек: захват повисает в воздухе, пока тест не
 * позовёт release(). Без этого нельзя проверить главный случай гонки — выход из
 * комнаты, пока getUserMedia ещё думает.
 */
function installDevices({ mic = 'ok', cam = 'ok' } = {}) {
  const devices = {
    mic,
    cam,
    manual: false,
    /** Все выданные дорожки, включая уже выброшенные из потока. */
    issued: [],
    pending: [],
    requests: [],
    release() {
      const waiting = devices.pending;
      devices.pending = [];
      waiting.forEach((settle) => settle());
      // Микрозадача, чтобы промисы внутри контроллера успели прокрутиться.
      return Promise.resolve();
    },
    liveTracks(kind) {
      return devices.issued.filter(
        (track) => track.kind === kind && track.readyState === 'live',
      );
    },
  };

  function failureFor(constraints) {
    if (constraints.audio && devices.mic !== 'ok') return mediaError(devices.mic);
    if (!constraints.video) return null;

    if (devices.cam === 'only-plain') {
      // Подробные ограничения камера не тянет, голое video: true — тянет.
      return constraints.video === true ? null : mediaError('OverconstrainedError');
    }

    return devices.cam === 'ok' ? null : mediaError(devices.cam);
  }

  function grant(constraints) {
    const failure = failureFor(constraints);
    if (failure) return Promise.reject(failure);

    const tracks = [];
    if (constraints.audio) tracks.push(new FakeTrack('audio'));
    if (constraints.video) tracks.push(new FakeTrack('video'));
    devices.issued.push(...tracks);

    return Promise.resolve(new FakeStream(tracks));
  }

  const getUserMedia = vi.fn((constraints) => {
    devices.requests.push(constraints);
    if (!devices.manual) return grant(constraints);

    return new Promise((resolve, reject) => {
      devices.pending.push(() => grant(constraints).then(resolve, reject));
    });
  });

  devices.getUserMedia = getUserMedia;

  globalThis.MediaStream = FakeStream;
  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia },
    configurable: true,
  });

  return devices;
}

afterEach(() => {
  delete globalThis.MediaStream;
});

describe('LocalMediaController: захват устройств', () => {
  let devices;

  beforeEach(() => {
    devices = installDevices();
  });

  /**
   * Тот самый баг, ради которого написан этот файл: в StrictMode эффект
   * монтируется дважды, два независимых захвата давали по две живые дорожки на
   * камеру, выключение останавливало одну — и лампочка не гасла.
   */
  it('двойной init() делает один захват и оставляет по одной дорожке на устройство', async () => {
    const media = new LocalMediaController();

    await Promise.all([media.init(), media.init()]);

    expect(devices.getUserMedia).toHaveBeenCalledTimes(1);
    expect(media.stream.getAudioTracks()).toHaveLength(1);
    expect(media.stream.getVideoTracks()).toHaveLength(1);

    // И, главное, после двойного монтирования выключение камеры действительно
    // освобождает устройство: живых видеодорожек не остаётся ни одной.
    await media.toggleCamera();

    expect(devices.liveTracks('video')).toHaveLength(0);
  });

  it('второй захват в обход кэша не оставляет двух дорожек на устройство', async () => {
    const media = new LocalMediaController();
    await media.init();

    const [firstVideo] = media.stream.getVideoTracks();

    // Так выглядел бы захват, проскочивший мимо общего промиса: дорожки
    // приезжают в уже наполненный поток.
    media.initPromise = null;
    await media.init();

    expect(media.stream.getAudioTracks()).toHaveLength(1);
    expect(media.stream.getVideoTracks()).toHaveLength(1);
    expect(firstVideo.readyState).toBe('ended');
    expect(devices.liveTracks('video')).toHaveLength(1);
  });
});

describe('LocalMediaController: тумблер камеры', () => {
  let devices;

  beforeEach(() => {
    devices = installDevices();
  });

  it('выключение останавливает все видеодорожки, живых не остаётся', async () => {
    const media = new LocalMediaController();
    await media.init();

    // Лишняя дорожка в потоке — след любой гонки захвата. Выключение обязано
    // погасить и её: одна забытая живая дорожка держит камеру и лампочку.
    const spare = new FakeTrack('video');
    devices.issued.push(spare);
    media.stream.addTrack(spare);

    await media.toggleCamera();

    expect(media.stream.getVideoTracks()).toHaveLength(0);
    expect(devices.liveTracks('video')).toHaveLength(0);
    expect(media.state.camOn).toBe(false);
  });

  it('обратное включение даёт ровно одну живую дорожку', async () => {
    const media = new LocalMediaController();
    await media.init();
    await media.toggleCamera();

    const onTrack = vi.fn();
    media.on('video-track-changed', onTrack);

    await media.toggleCamera();

    expect(media.stream.getVideoTracks()).toHaveLength(1);
    expect(devices.liveTracks('video')).toHaveLength(1);
    expect(media.state.camOn).toBe(true);
    expect(onTrack).toHaveBeenCalledWith(media.stream.getVideoTracks()[0]);
  });

  it('микрофон переключается через enabled, дорожка остаётся живой', async () => {
    const media = new LocalMediaController();
    await media.init();

    const track = media.audioTrack;
    media.toggleMic();

    expect(media.state.micOn).toBe(false);
    expect(track.enabled).toBe(false);
    expect(track.readyState).toBe('live');
  });
});

describe('LocalMediaController: выход из комнаты во время захвата', () => {
  let devices;

  beforeEach(() => {
    devices = installDevices();
  });

  it('гасит дорожки первичного захвата, приехавшие после stopAll', async () => {
    const media = new LocalMediaController();
    devices.manual = true;

    const capture = media.init();
    media.stopAll();
    await devices.release();
    await capture;

    expect(media.stream.getTracks()).toHaveLength(0);
    expect(devices.liveTracks('audio')).toHaveLength(0);
    expect(devices.liveTracks('video')).toHaveLength(0);
  });

  it('гасит дорожку включения камеры, приехавшую после stopAll', async () => {
    const media = new LocalMediaController();
    await media.init();
    await media.toggleCamera();

    devices.manual = true;
    const turningOn = media.toggleCamera();
    media.stopAll();
    await devices.release();
    await turningOn;

    expect(media.stream.getVideoTracks()).toHaveLength(0);
    expect(devices.liveTracks('video')).toHaveLength(0);
    expect(media.state.camOn).toBe(false);
  });
});

describe('LocalMediaController: устройство пропало во время звонка', () => {
  beforeEach(() => {
    installDevices();
  });

  it('снимает видеодорожку по ended и сообщает соединениям о пустом видео', async () => {
    const media = new LocalMediaController();
    await media.init();

    const onTrack = vi.fn();
    const onState = vi.fn();
    media.on('video-track-changed', onTrack);
    media.on('state-changed', onState);

    media.stream.getVideoTracks()[0].dispatchEvent(new Event('ended'));

    expect(media.stream.getVideoTracks()).toHaveLength(0);
    expect(media.state.camOn).toBe(false);
    expect(media.state.hasCam).toBe(false);
    expect(media.state.deviceLost).toBe(true);
    expect(media.state.error).toMatch(/недоступно/);
    // null, а не замерший последний кадр у собеседников.
    expect(onTrack).toHaveBeenCalledWith(null);
    expect(onState).toHaveBeenCalled();
  });

  it('снимает аудиодорожку по ended, не трогая видео', async () => {
    const media = new LocalMediaController();
    await media.init();

    const onTrack = vi.fn();
    media.on('video-track-changed', onTrack);

    media.stream.getAudioTracks()[0].dispatchEvent(new Event('ended'));

    expect(media.stream.getAudioTracks()).toHaveLength(0);
    expect(media.state.micOn).toBe(false);
    expect(media.state.hasMic).toBe(false);
    expect(media.state.deviceLost).toBe(true);
    expect(media.state.camOn).toBe(true);
    expect(onTrack).not.toHaveBeenCalled();
  });

  it('не реагирует на ended дорожки, уже выброшенной из потока', async () => {
    const media = new LocalMediaController();
    await media.init();

    const [video] = media.stream.getVideoTracks();
    await media.toggleCamera();

    // Выключение камеры — тоже остановка дорожки. Если система пришлёт по ней
    // ended, это не потеря устройства, и плашки об этом быть не должно.
    video.dispatchEvent(new Event('ended'));

    expect(media.state.deviceLost).toBe(false);
    expect(media.state.error).toBeNull();
  });
});

describe('LocalMediaController: последовательная деградация', () => {
  it('оба устройства доступны — один запрос, оба включены', async () => {
    const devices = installDevices();
    const media = new LocalMediaController();

    const state = await media.init();

    expect(devices.getUserMedia).toHaveBeenCalledTimes(1);
    expect(state).toMatchObject({ micOn: true, camOn: true, hasMic: true, hasCam: true });
    expect(state.error).toBeNull();
  });

  it('нет камеры — вход с одним микрофоном и объяснением', async () => {
    const devices = installDevices({ cam: 'NotFoundError' });
    const media = new LocalMediaController();

    const state = await media.init();

    // Запрос на оба, затем каждое устройство отдельно.
    expect(devices.getUserMedia).toHaveBeenCalledTimes(3);
    expect(state).toMatchObject({ micOn: true, hasMic: true, camOn: false, hasCam: false });
    expect(state.error).toMatch(/не найдены/);
  });

  it('микрофон занят другим приложением — вход с одной камерой', async () => {
    installDevices({ mic: 'NotReadableError' });
    const media = new LocalMediaController();

    const state = await media.init();

    expect(state).toMatchObject({ camOn: true, hasCam: true, micOn: false, hasMic: false });
    expect(state.error).toMatch(/занято другим приложением/);
  });

  it('доступ запрещён — вход без устройств и без единой живой дорожки', async () => {
    const devices = installDevices({ mic: 'NotAllowedError', cam: 'NotAllowedError' });
    const media = new LocalMediaController();

    const state = await media.init();

    expect(state).toMatchObject({ micOn: false, camOn: false, hasMic: false, hasCam: false });
    expect(state.error).toMatch(/не разрешён/);
    expect(media.stream.getTracks()).toHaveLength(0);
    expect(devices.issued).toHaveLength(0);
  });

  it('камера не тянет 720p — ограничения ослабляются, видео остаётся', async () => {
    const devices = installDevices({ cam: 'only-plain' });
    const media = new LocalMediaController();

    const state = await media.init();

    expect(state).toMatchObject({ micOn: true, camOn: true, hasCam: true });
    expect(state.error).toBeNull();
    // Последним ушёл запрос с голым video: true.
    expect(devices.requests.at(-1)).toEqual({ audio: false, video: true });
  });
});
