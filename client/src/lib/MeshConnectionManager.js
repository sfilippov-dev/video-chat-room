import { EVENTS } from './events.js';

/**
 * Набор P2P-соединений: по одному RTCPeerConnection на каждого собеседника.
 *
 * Топология mesh — каждый с каждым. При четырёх участниках это шесть
 * соединений на комнату и три исходящих потока с каждого клиента: медиа идёт
 * напрямую между браузерами, сервер о нём ничего не знает.
 *
 * Кто кому шлёт оффер, решает сервер, а не клиенты: оффер создаёт тот, кто уже
 * был в комнате, новичок только отвечает. Если бы обе стороны начали
 * согласование одновременно, случился бы glare — оба пира оказались бы в
 * состоянии have-local-offer, setRemoteDescription упал бы с InvalidStateError,
 * и соединение развалилось бы.
 */
export class MeshConnectionManager {
  /**
   * @param {object} options
   * @param {import('socket.io-client').Socket} options.socket
   * @param {RTCIceServer[]} options.iceServers
   * @param {() => {audio: MediaStreamTrack|null, video: MediaStreamTrack|null}} options.getLocalTracks
   */
  constructor({ socket, iceServers, getLocalTracks }) {
    this.socket = socket;
    this.iceServers = iceServers;
    this.getLocalTracks = getLocalTracks;

    /** @type {Map<string, {pc: RTCPeerConnection, audioSender: RTCRtpSender, videoSender: RTCRtpSender, stream: MediaStream}>} */
    this.connections = new Map();

    /**
     * ICE-кандидаты, пришедшие раньше, чем применено удалённое описание.
     * На быстром локальном сервере это обычное дело, а addIceCandidate в таком
     * состоянии бросает исключение — поэтому копим и досылаем.
     */
    this.pendingCandidates = new Map();

    this.listeners = new Map();
  }

  on(event, handler) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event).add(handler);
    return () => this.listeners.get(event)?.delete(handler);
  }

  emit(event, ...args) {
    this.listeners.get(event)?.forEach((handler) => handler(...args));
  }

  has(peerId) {
    return this.connections.has(peerId);
  }

  /**
   * Создаёт соединение с участником.
   *
   * Инициатор резервирует обе m-секции заранее через addTransceiver, даже
   * когда соответствующей дорожки сейчас нет: иначе участник, вошедший с
   * выключенной или отсутствующей камерой, не смог бы включить её потом —
   * sender'а не существовало бы, и подложить дорожку через replaceTrack было
   * бы некуда. Заодно это избавляет от пересогласования при включении камеры.
   *
   * Отвечающая сторона transceiver'ы заранее НЕ создаёт. Проверено на живом
   * соединении: созданные до оффера transceiver'ы остаются неассоциированными
   * (mid равен null), браузер строит из оффера свои — recvonly, — и дорожки,
   * подложенные в заготовленные senders, не уходят никуда. Поэтому отвечающий
   * присоединяет свои дорожки к секциям из оффера в handleOffer.
   *
   * Для отвечающей стороны метод полностью синхронный: соединение существует
   * ещё до того, как придёт первый оффер, и терять сигналы неоткуда.
   */
  createConnection(peerId, { asInitiator }) {
    if (this.connections.has(peerId)) return this.connections.get(peerId);

    const pc = new RTCPeerConnection({ iceServers: this.iceServers });

    // Один и тот же MediaStream на всё время жизни соединения: дорожки
    // собеседника приходят по одной, а плитке нужен стабильный источник.
    const entry = {
      pc,
      audioSender: null,
      videoSender: null,
      stream: new MediaStream(),
    };
    this.connections.set(peerId, entry);
    this.pendingCandidates.set(peerId, []);

    pc.addEventListener('icecandidate', (event) => {
      if (!event.candidate) return;
      this.socket.emit(EVENTS.SIGNAL_ICE, { targetId: peerId, candidate: event.candidate });
    });

    pc.addEventListener('track', (event) => {
      entry.stream.addTrack(event.track);
      this.emit('remote-stream', peerId, entry.stream);
    });

    if (asInitiator) {
      const tracks = this.getLocalTracks();
      const audioTransceiver = pc.addTransceiver('audio', { direction: 'sendrecv' });
      const videoTransceiver = pc.addTransceiver('video', { direction: 'sendrecv' });

      entry.audioSender = audioTransceiver.sender;
      entry.videoSender = videoTransceiver.sender;

      if (tracks.audio) audioTransceiver.sender.replaceTrack(tracks.audio);
      if (tracks.video) videoTransceiver.sender.replaceTrack(tracks.video);

      this.sendOffer(peerId, entry).catch((error) => {
        console.error('[webrtc] не удалось создать оффер', error);
      });
    }

    return entry;
  }

  async sendOffer(peerId, entry) {
    const offer = await entry.pc.createOffer();
    await entry.pc.setLocalDescription(offer);

    this.socket.emit(EVENTS.SIGNAL_OFFER, {
      targetId: peerId,
      sdp: entry.pc.localDescription,
    });
  }

  /** Оффер от старожила: отвечаем, инициативы не проявляем. */
  async handleOffer(fromId, sdp) {
    const entry = this.connections.get(fromId) ?? this.createConnection(fromId, { asInitiator: false });

    try {
      await entry.pc.setRemoteDescription(sdp);
      await this.flushCandidates(fromId, entry);
      this.attachLocalTracks(entry);

      const answer = await entry.pc.createAnswer();
      await entry.pc.setLocalDescription(answer);

      this.socket.emit(EVENTS.SIGNAL_ANSWER, {
        targetId: fromId,
        sdp: entry.pc.localDescription,
      });
    } catch (error) {
      console.error('[webrtc] не удалось обработать оффер', error);
    }
  }

  async handleAnswer(fromId, sdp) {
    const entry = this.connections.get(fromId);
    if (!entry) return;

    try {
      await entry.pc.setRemoteDescription(sdp);
      await this.flushCandidates(fromId, entry);
    } catch (error) {
      console.error('[webrtc] не удалось обработать ответ', error);
    }
  }

  /**
   * Присоединяет свои дорожки к секциям, пришедшим в оффере.
   *
   * Секции создал браузер при setRemoteDescription, и по умолчанию они
   * recvonly — только приём. Переводим их в sendrecv и подкладываем свои
   * дорожки ДО createAnswer, чтобы направление попало в ответ.
   *
   * Дорожки может не быть вовсе: камеру не разрешили или её нет. Секция всё
   * равно объявляется как sendrecv — это и есть резерв, в который позже ляжет
   * включённая камера через replaceTrack, без всякого пересогласования.
   */
  attachLocalTracks(entry) {
    const tracks = this.getLocalTracks();

    entry.pc.getTransceivers().forEach((transceiver) => {
      const kind = transceiver.receiver.track?.kind;
      if (kind !== 'audio' && kind !== 'video') return;

      transceiver.direction = 'sendrecv';

      if (kind === 'audio') {
        entry.audioSender = transceiver.sender;
        transceiver.sender.replaceTrack(tracks.audio ?? null);
      } else {
        entry.videoSender = transceiver.sender;
        transceiver.sender.replaceTrack(tracks.video ?? null);
      }
    });
  }

  /**
   * Кандидат применяется только поверх удалённого описания. Пока его нет,
   * складываем кандидатов в очередь — потерянный кандидат означает
   * несостоявшееся соединение.
   */
  async handleIce(fromId, candidate) {
    const entry = this.connections.get(fromId);
    if (!entry) return;

    if (!entry.pc.remoteDescription) {
      this.pendingCandidates.get(fromId)?.push(candidate);
      return;
    }

    try {
      await entry.pc.addIceCandidate(candidate);
    } catch (error) {
      console.error('[webrtc] не удалось добавить ICE-кандидата', error);
    }
  }

  async flushCandidates(peerId, entry) {
    const queued = this.pendingCandidates.get(peerId) ?? [];
    this.pendingCandidates.set(peerId, []);

    for (const candidate of queued) {
      try {
        await entry.pc.addIceCandidate(candidate);
      } catch (error) {
        console.error('[webrtc] не удалось добавить отложенного ICE-кандидата', error);
      }
    }
  }

  /**
   * Подменяет исходящую видеодорожку во всех соединениях.
   *
   * replaceTrack, а не removeTrack с addTrack: подмена источника внутри уже
   * согласованного transceiver'а не меняет SDP, поэтому не нужен ни новый
   * оффер, ни ответ — ни на одном из соединений. Меньше сигналинга и ни одного
   * нового окна для гонки согласования.
   */
  replaceVideoTrack(track) {
    this.connections.forEach((entry) => {
      // Sender'а может не быть только у отвечающей стороны до прихода первого
      // оффера. Дорожка подхватится в attachLocalTracks при согласовании.
      entry.videoSender?.replaceTrack(track).catch((error) => {
        console.error('[webrtc] не удалось подменить видеодорожку', error);
      });
    });
  }

  closeConnection(peerId) {
    const entry = this.connections.get(peerId);
    if (!entry) return;

    entry.pc.close();
    this.connections.delete(peerId);
    this.pendingCandidates.delete(peerId);
  }

  closeAll() {
    this.connections.forEach(({ pc }) => pc.close());
    this.connections.clear();
    this.pendingCandidates.clear();
    this.listeners.clear();
  }
}
