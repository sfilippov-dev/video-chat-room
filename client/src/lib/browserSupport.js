/**
 * Проверка окружения до входа в комнату: пользователь должен получить внятное
 * сообщение, а не белый экран и молчащую камеру.
 */
export function checkBrowserSupport() {
  const hasPeerConnection = typeof window !== 'undefined' && 'RTCPeerConnection' in window;
  const hasMediaDevices = Boolean(navigator.mediaDevices?.getUserMedia);

  if (!hasPeerConnection) {
    return { supported: false, reason: 'webrtc' };
  }

  // getUserMedia доступен только в защищённом контексте: HTTPS или localhost.
  // Если открыть приложение по IP в локальной сети без HTTPS, объекта просто
  // не будет — и это самая частая причина «камера не запрашивается».
  if (!hasMediaDevices) {
    return { supported: false, reason: window.isSecureContext ? 'media-devices' : 'insecure' };
  }

  return { supported: true, reason: null };
}
