import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

import VideoTile from './VideoTile.jsx';

afterEach(cleanup);

function participant(overrides = {}) {
  return { id: 'p1', name: 'Алексей', micOn: true, camOn: true, ...overrides };
}

describe('VideoTile', () => {
  it('показывает силуэт и имя вместо видео при выключенной камере', () => {
    const { container } = render(
      <VideoTile participant={participant({ camOn: false })} stream={null} isSelf={false} />,
    );

    expect(container.querySelector('.tile__silhouette')).not.toBeNull();
    expect(screen.getByText('Алексей')).toBeTruthy();
  });

  it('показывает перечёркнутый микрофон при выключенном микрофоне', () => {
    render(
      <VideoTile
        participant={participant({ micOn: false, camOn: false })}
        stream={null}
        isSelf={false}
      />,
    );

    expect(screen.getByRole('img', { name: 'Микрофон выключен' })).toBeTruthy();
  });

  it('не рисует иконку микрофона, пока микрофон включён', () => {
    render(
      <VideoTile participant={participant({ camOn: false })} stream={null} isSelf={false} />,
    );

    expect(screen.queryByRole('img', { name: 'Микрофон выключен' })).toBeNull();
  });

  it('рендерит имя участника текстом, а не разметкой (XSS)', () => {
    const payload = '<img src=x onerror="alert(1)">';
    const { container } = render(
      <VideoTile
        participant={participant({ name: payload, camOn: false })}
        stream={null}
        isSelf={false}
      />,
    );

    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText(payload)).toBeTruthy();
  });
});
