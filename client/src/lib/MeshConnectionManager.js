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

    /** @type {Map<string, {pc: RTCPeerConnection, audioSender: RTCRtpSender, videoSender: RTCRtpSender}>} */
    this.connections = new Map();
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
   * Обе m-секции резервируются заранее через addTransceiver, даже когда
   * соответствующей дорожки сейчас нет. Иначе участник, вошедший с выключенной
   * или отсутствующей камерой, не смог бы включить её потом: sender'а не
   * существовало бы, и подложить дорожку через replaceTrack было бы некуда.
   * Заодно это избавляет от пересогласования при каждом включении камеры.
   *
   * Для отвечающей стороны метод полностью синхронный: соединение существует
   * ещё до того, как придёт первый оффер, и терять сигналы неоткуда.
   */
  createConnection(peerId, { asInitiator }) {
    if (this.connections.has(peerId)) return this.connections.get(peerId);

    const pc = new RTCPeerConnection({ iceServers: this.iceServers });

    const audioTransceiver = pc.addTransceiver('audio', { direction: 'sendrecv' });
    const videoTransceiver = pc.addTransceiver('video', { direction: 'sendrecv' });

    const entry = {
      pc,
      audioSender: audioTransceiver.sender,
      videoSender: videoTransceiver.sender,
    };
    this.connections.set(peerId, entry);

    const tracks = this.getLocalTracks();
    if (tracks.audio) audioTransceiver.sender.replaceTrack(tracks.audio);
    if (tracks.video) videoTransceiver.sender.replaceTrack(tracks.video);

    if (asInitiator) {
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
    } catch (error) {
      console.error('[webrtc] не удалось обработать ответ', error);
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
    this.connections.forEach(({ videoSender }) => {
      videoSender.replaceTrack(track).catch((error) => {
        console.error('[webrtc] не удалось подменить видеодорожку', error);
      });
    });
  }

  closeConnection(peerId) {
    const entry = this.connections.get(peerId);
    if (!entry) return;

    entry.pc.close();
    this.connections.delete(peerId);
  }

  closeAll() {
    this.connections.forEach(({ pc }) => pc.close());
    this.connections.clear();
    this.listeners.clear();
  }
}
