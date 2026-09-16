import { describe, it, expect } from 'vitest';

import { validateName, validateMessage, validateRoomId } from './validation.js';
import { ERROR_CODES } from './socket/events.js';

describe('validateName', () => {
  it('принимает обычное имя и обрезает пробелы по краям', () => {
    expect(validateName('  Алексей  ')).toEqual({ ok: true, value: 'Алексей' });
  });

  it('принимает латиницу, цифры, дефис и подчёркивание', () => {
    expect(validateName('Alex_2-й').ok).toBe(true);
  });

  it('отклоняет пустое имя', () => {
    expect(validateName('')).toEqual({ ok: false, code: ERROR_CODES.INVALID_NAME });
  });

  it('отклоняет имя из одних пробелов', () => {
    expect(validateName('    ')).toEqual({ ok: false, code: ERROR_CODES.INVALID_NAME });
  });

  it('обрезает имя длиннее 30 символов', () => {
    const result = validateName('А'.repeat(45));
    expect(result.ok).toBe(true);
    expect(result.value).toHaveLength(30);
  });

  it('отклоняет спецсимволы и разметку', () => {
    expect(validateName('<script>alert(1)</script>').ok).toBe(false);
    expect(validateName('Вася<b>').ok).toBe(false);
    expect(validateName('a"b').ok).toBe(false);
    expect(validateName('drop;table').ok).toBe(false);
  });

  it('отклоняет эмодзи', () => {
    expect(validateName('Вася 🙂').ok).toBe(false);
  });

  it('отклоняет не-строку', () => {
    expect(validateName(null).ok).toBe(false);
    expect(validateName({ toString: () => 'Вася' }).ok).toBe(false);
  });

  it('не разрывает суррогатную пару при обрезке', () => {
    // 29 букв + эмодзи из суррогатной пары: обрезка не должна оставить
    // половину пары, имя целиком отклоняется по алфавиту.
    const result = validateName(`${'а'.repeat(29)}🙂`);
    expect(result.ok).toBe(false);
  });
});

describe('validateMessage', () => {
  it('принимает непустой текст и обрезает пробелы', () => {
    expect(validateMessage('  привет  ')).toEqual({ ok: true, value: 'привет' });
  });

  it('отклоняет пустое сообщение', () => {
    expect(validateMessage('')).toEqual({ ok: false, code: ERROR_CODES.EMPTY_MESSAGE });
  });

  it('отклоняет сообщение из одних пробелов', () => {
    expect(validateMessage('   \n\t ')).toEqual({ ok: false, code: ERROR_CODES.EMPTY_MESSAGE });
  });

  it('отклоняет слишком длинное сообщение', () => {
    expect(validateMessage('a'.repeat(1001))).toEqual({
      ok: false,
      code: ERROR_CODES.MESSAGE_TOO_LONG,
    });
  });

  it('пропускает разметку как обычный текст — экранирование это задача рендера', () => {
    const result = validateMessage('<img src=x onerror="alert(1)">');
    expect(result).toEqual({ ok: true, value: '<img src=x onerror="alert(1)">' });
  });
});

describe('validateRoomId', () => {
  it('принимает UUID', () => {
    const id = '6f1c2b7e-6d2f-4a0e-9d8a-1c2b3d4e5f60';
    expect(validateRoomId(id)).toEqual({ ok: true, value: id });
  });

  it('отклоняет пустой и слишком длинный идентификатор', () => {
    expect(validateRoomId('').ok).toBe(false);
    expect(validateRoomId('a'.repeat(65)).ok).toBe(false);
  });

  it('отклоняет посторонние символы', () => {
    expect(validateRoomId('room/../etc').ok).toBe(false);
    expect(validateRoomId('комната').ok).toBe(false);
    expect(validateRoomId('room id').ok).toBe(false);
  });

  it('пропускает __proto__ — комнаты лежат в Map, прототипных ключей у неё нет', () => {
    expect(validateRoomId('__proto__').ok).toBe(true);
  });
});
