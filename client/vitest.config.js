import { defineConfig, mergeConfig } from 'vitest/config';

import viteConfig from './vite.config.js';

/**
 * Тесты берут ту же сборку, что и приложение (JSX через плагин React), но
 * запускаются в jsdom: компоненты работают с DOM, а не с реальным браузером.
 */
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      // .js наравне с .jsx: модули из src/lib компонентами не являются, но
      // jsdom нужен и им — LocalMediaController работает с MediaStream.
      include: ['src/**/*.test.{js,jsx}'],
      restoreMocks: true,
    },
  }),
);
