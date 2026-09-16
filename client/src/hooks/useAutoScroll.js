import { useEffect, useRef } from 'react';

/**
 * Держит ленту прокрученной к последней записи.
 *
 * Прокрутка выполняется после отрисовки нового сообщения: на момент эффекта
 * высота содержимого уже учитывает добавленную строку, поэтому scrollHeight
 * даёт настоящий низ, а не тот, что был до обновления.
 */
export function useAutoScroll(dependency) {
  const ref = useRef(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    element.scrollTop = element.scrollHeight;
  }, [dependency]);

  return ref;
}
