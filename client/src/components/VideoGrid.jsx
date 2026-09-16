import VideoTile from './VideoTile.jsx';

/**
 * Сетка плиток: один участник занимает всё поле, двое делят его пополам,
 * трое и четверо раскладываются в 2×2. Больше четырёх быть не может — лимит
 * держит сервер.
 */
export default function VideoGrid({
  participants,
  selfId,
  localStream,
  remoteStreams,
  failedPeers,
  mediaState,
}) {
  return (
    <div className={`grid grid--${Math.min(participants.length, 4)}`}>
      {participants.map((participant) => {
        const isSelf = participant.id === selfId;

        // Своё состояние устройств берём у себя, а не из эха сервера: щёлкнув
        // тумблером, пользователь должен увидеть результат сразу, а не после
        // round-trip'а.
        const shown = isSelf
          ? { ...participant, micOn: mediaState.micOn, camOn: mediaState.camOn }
          : participant;

        return (
          <VideoTile
            key={participant.id}
            participant={shown}
            isSelf={isSelf}
            stream={isSelf ? localStream : remoteStreams.get(participant.id)}
            connectionFailed={failedPeers.has(participant.id)}
            deviceLost={isSelf && mediaState.deviceLost}
          />
        );
      })}
    </div>
  );
}
