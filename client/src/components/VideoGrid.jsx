import VideoTile from './VideoTile.jsx';

/**
 * Сетка плиток: один участник занимает всё поле, двое делят его пополам,
 * трое и четверо раскладываются в 2×2. Больше четырёх быть не может — лимит
 * держит сервер.
 */
export default function VideoGrid({ participants, selfId, localStream, remoteStreams, failedPeers }) {
  return (
    <div className={`grid grid--${Math.min(participants.length, 4)}`}>
      {participants.map((participant) => {
        const isSelf = participant.id === selfId;

        return (
          <VideoTile
            key={participant.id}
            participant={participant}
            isSelf={isSelf}
            stream={isSelf ? localStream : remoteStreams.get(participant.id)}
            connectionFailed={failedPeers.has(participant.id)}
          />
        );
      })}
    </div>
  );
}
