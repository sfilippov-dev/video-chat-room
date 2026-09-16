/**
 * Замер задержки между участниками на живом соединении (PRD, US-6: «задержка
 * медиа не превышает 500 мс в локальной сети»).
 *
 * Как пользоваться:
 *   1. Открыть приложение и остаться на стартовом экране — НЕ входить в комнату.
 *   2. Вставить весь этот файл в консоль браузера и нажать Enter.
 *   3. Войти в комнату. То же самое проделать во второй вкладке.
 *   4. Раз в две секунды консоль печатает строку на каждого собеседника.
 *      Остановить: latency.stop(). Один замер по требованию: latency.now().
 *
 * Почему до входа. Приложение держит RTCPeerConnection внутри
 * MeshConnectionManager и наружу их не отдаёт — намеренно, отладочных ссылок в
 * window в продакшен-коде быть не должно. Скрипт вместо этого подменяет
 * конструктор RTCPeerConnection и запоминает все созданные соединения, поэтому
 * и обязан отработать раньше, чем приложение создаст первое.
 *
 * Что именно печатается. Задержку медиа целиком (glass-to-glass) getStats не
 * знает: он не видит ни экспозиции матрицы, ни вывода на экран. Он знает две
 * главные её составляющие, и печатаются именно они:
 *
 *   RTT              — время полного оборота пакета по выбранной ICE-паре
 *                      (candidate-pair.currentRoundTripTime).
 *   сеть в одну       — RTT/2: столько пакет летит от собеседника к нам.
 *   буфер            — задержка джиттер-буфера приёмника
 *                      (прирост jitterBufferDelay на прирост кадров/сэмплов).
 *                      Это то, что декодер осознанно придерживает ради
 *                      равномерного воспроизведения; на неё приходится
 *                      основная часть наблюдаемой задержки.
 *   итого            — сумма двух предыдущих: оценка снизу для задержки,
 *                      которую видит собеседник. Именно её сравниваем с 500 мс.
 *
 * Считается отдельно по видео и по аудио: у них разные буферы и разные числа.
 */
(() => {
  const RTT_LIMIT_MS = 500;

  // Повторный запуск не должен городить вторую обёртку поверх первой.
  if (window.latency && window.latency.connections) {
    console.log('Скрипт уже запущен. latency.now() — разовый замер, latency.stop() — остановить.');
    return;
  }

  const Native = window.RTCPeerConnection;
  if (!Native) {
    console.log('В этом браузере нет WebRTC — замерять нечего.');
    return;
  }

  const connections = new Set();

  function Patched(...args) {
    const pc = new Native(...args);
    connections.add(pc);
    return pc;
  }

  Patched.prototype = Native.prototype;
  Patched.generateCertificate = Native.generateCertificate?.bind(Native);
  window.RTCPeerConnection = Patched;
  window.webkitRTCPeerConnection = Patched;

  /** Предыдущие показания буфера: нужны, чтобы считать прирост, а не среднее. */
  const previous = new Map();

  function ms(seconds) {
    return seconds == null ? null : Math.round(seconds * 1000);
  }

  function show(value, unit = ' мс') {
    return value == null ? '—' : value + unit;
  }

  /** Задержка джиттер-буфера за последний интервал, а не за всё соединение. */
  function bufferDelay(key, delay, emitted) {
    if (delay == null || !emitted) return null;

    const before = previous.get(key);
    previous.set(key, { delay, emitted });

    if (!before || emitted <= before.emitted) return null;
    return ms((delay - before.delay) / (emitted - before.emitted));
  }

  async function readConnection(pc, index) {
    if (pc.connectionState === 'closed') {
      connections.delete(pc);
      return null;
    }

    const stats = await pc.getStats();
    const line = { label: `соединение ${index + 1}`, state: pc.connectionState };

    stats.forEach((report) => {
      if (report.type === 'candidate-pair' && report.state === 'succeeded' && report.nominated) {
        line.rtt = ms(report.currentRoundTripTime);
      }

      // Входящий поток — это и есть то, что мы получаем от собеседника.
      if (report.type === 'inbound-rtp' && !report.isRemote) {
        const key = `${index}:${report.kind}:${report.ssrc}`;
        const delay = bufferDelay(
          key,
          report.jitterBufferDelay,
          report.jitterBufferEmittedCount,
        );
        line[report.kind] = { buffer: delay, jitter: ms(report.jitter) };
      }
    });

    return line;
  }

  function print(line) {
    if (!line) return;

    const oneWay = line.rtt == null ? null : Math.round(line.rtt / 2);

    ['video', 'audio'].forEach((kind) => {
      const media = line[kind];
      if (!media) return;

      const total = oneWay == null || media.buffer == null ? null : oneWay + media.buffer;
      const verdict = total == null ? '' : total <= RTT_LIMIT_MS ? '  ✓' : '  ✗ больше 500 мс';

      console.log(
        `${line.label} · ${kind === 'video' ? 'видео' : 'аудио'} · ` +
          `RTT ${show(line.rtt)} · сеть в одну ${show(oneWay)} · ` +
          `буфер ${show(media.buffer)} · джиттер ${show(media.jitter)} · ` +
          `итого ${show(total)}${verdict}`,
      );
    });

    if (!line.video && !line.audio) {
      console.log(`${line.label} · состояние ${line.state} · медиа ещё не идёт`);
    }
  }

  async function now() {
    if (connections.size === 0) {
      console.log('Соединений нет. Скрипт должен быть вставлен ДО входа в комнату — перезагрузите страницу и повторите.');
      return;
    }

    const lines = await Promise.all([...connections].map(readConnection));
    console.log(new Date().toLocaleTimeString('ru-RU'));
    lines.forEach(print);
  }

  const timer = setInterval(now, 2000);

  window.latency = {
    connections,
    now,
    stop() {
      clearInterval(timer);
      window.RTCPeerConnection = Native;
      console.log('Замер остановлен.');
    },
  };

  console.log('Замер готов. Входите в комнату — числа пойдут через пару секунд после соединения.');
})();
