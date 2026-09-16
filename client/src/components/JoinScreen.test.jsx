import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import JoinScreen from './JoinScreen.jsx';
import { MAX_NAME_LENGTH } from '../config.js';

afterEach(cleanup);

describe('JoinScreen', () => {
  it('держит кнопку входа заблокированной, пока имя не введено', async () => {
    render(<JoinScreen mode="create" onSubmit={vi.fn()} />);

    const button = screen.getByRole('button', { name: 'Создать комнату' });
    expect(button.disabled).toBe(true);

    // Одни пробелы именем не считаются: их не отличить от пустого поля.
    await userEvent.type(screen.getByRole('textbox'), '   ');
    expect(button.disabled).toBe(true);

    await userEvent.type(screen.getByRole('textbox'), 'Алексей');
    expect(button.disabled).toBe(false);
  });

  it('отдаёт имя без окружающих пробелов', async () => {
    const onSubmit = vi.fn();
    render(<JoinScreen mode="join" onSubmit={onSubmit} />);

    await userEvent.type(screen.getByRole('textbox'), '  Алексей  ');
    await userEvent.click(screen.getByRole('button', { name: 'Войти' }));

    expect(onSubmit).toHaveBeenCalledWith('Алексей');
  });

  it('не принимает в поле больше 30 символов', async () => {
    render(<JoinScreen mode="create" onSubmit={vi.fn()} />);

    const input = screen.getByRole('textbox');
    await userEvent.type(input, 'а'.repeat(MAX_NAME_LENGTH + 10));

    expect(input.value).toBe('а'.repeat(MAX_NAME_LENGTH));
  });
});
