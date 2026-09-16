import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import ChatPanel from './ChatPanel.jsx';
import { MESSAGE_TYPES } from '../lib/events.js';

afterEach(cleanup);

/**
 * Время берётся из локальных компонентов даты, а не из фиксированного epoch:
 * иначе результат зависел бы от часового пояса машины, на которой идёт прогон.
 */
function userMessage(overrides = {}) {
  return {
    id: 'm1',
    type: MESSAGE_TYPES.USER,
    authorId: 'p1',
    name: 'Алексей',
    text: 'Привет',
    ts: new Date(2024, 0, 15, 9, 5).getTime(),
    ...overrides,
  };
}

describe('ChatPanel', () => {
  it('не отправляет пустое и пробельное сообщение', async () => {
    const onSend = vi.fn(async () => ({ ok: true }));
    render(<ChatPanel messages={[]} selfId="p1" onSend={onSend} />);

    const button = screen.getByRole('button', { name: 'Отправить' });
    expect(button.disabled).toBe(true);

    await userEvent.type(screen.getByLabelText('Сообщение'), '   {Enter}');

    expect(onSend).not.toHaveBeenCalled();
    expect(button.disabled).toBe(true);
  });

  it('отправляет непустое сообщение и очищает поле', async () => {
    const onSend = vi.fn(async () => ({ ok: true }));
    render(<ChatPanel messages={[]} selfId="p1" onSend={onSend} />);

    const input = screen.getByLabelText('Сообщение');
    await userEvent.type(input, 'Привет{Enter}');

    expect(onSend).toHaveBeenCalledWith('Привет');
    expect(input.value).toBe('');
  });

  it('показывает имя отправителя и время в формате HH:MM', () => {
    render(<ChatPanel messages={[userMessage()]} selfId="p1" onSend={vi.fn()} />);

    expect(screen.getByText('Алексей')).toBeTruthy();
    expect(screen.getByText('09:05')).toBeTruthy();
  });

  it('прокручивает ленту вниз при новом сообщении', () => {
    const { container, rerender } = render(
      <ChatPanel messages={[userMessage()]} selfId="p1" onSend={vi.fn()} />,
    );

    // В jsdom у элементов нет раскладки, поэтому высоту содержимого задаём сами:
    // проверяем саму реакцию на приход сообщения, а не вычисления браузера.
    const list = container.querySelector('.chat__list');
    Object.defineProperty(list, 'scrollHeight', { value: 640, configurable: true });
    list.scrollTop = 0;

    rerender(
      <ChatPanel
        messages={[userMessage(), userMessage({ id: 'm2', text: 'Ещё одно' })]}
        selfId="p1"
        onSend={vi.fn()}
      />,
    );

    expect(list.scrollTop).toBe(640);
  });

  it('рендерит разметку из сообщения текстом, а не узлами DOM (XSS)', () => {
    const payload = '<img src=x onerror="alert(1)">';
    const { container } = render(
      <ChatPanel messages={[userMessage({ text: payload })]} selfId="p1" onSend={vi.fn()} />,
    );

    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText(payload)).toBeTruthy();
  });
});
