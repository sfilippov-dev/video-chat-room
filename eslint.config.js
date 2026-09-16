import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

/**
 * Один конфиг на оба пакета: правила общие, различаются только глобальные
 * объекты окружения — на сервере это Node, на клиенте браузер.
 *
 * Главная причина держать здесь линтер — правило react/no-danger. Запрет
 * dangerouslySetInnerHTML это единственная защита от XSS в чате и в именах на
 * плитках, и держаться он должен проверкой, а не памятью разработчика.
 */
export default [
  {
    ignores: ['**/node_modules/**', 'client/dist/**', 'server/public/**'],
  },

  js.configs.recommended,

  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },

  // Сервер: Node-окружение.
  {
    files: ['server/**/*.js'],
    languageOptions: {
      globals: globals.node,
    },
  },

  // Клиент: браузер, JSX и хуки.
  {
    files: ['client/**/*.{js,jsx}'],
    plugins: { react, 'react-hooks': reactHooks },
    languageOptions: {
      globals: globals.browser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    settings: {
      react: { version: 'detect' },
    },
    rules: {
      ...react.configs.flat.recommended.rules,
      ...react.configs.flat['jsx-runtime'].rules,
      // Берём два классических правила хуков, а не весь recommended: тот тянет
      // за собой набор React Compiler, под который проект не писался.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      // Ключевое правило проекта: присланный текст обязан остаться текстом.
      'react/no-danger': 'error',
      // Типы пропсов не описываем: PropTypes в проект не вводились.
      'react/prop-types': 'off',
    },
  },

  // Диагностические скрипты: в приложение не входят, исполняются вставкой в
  // консоль браузера — окружение у них браузерное.
  {
    files: ['scripts/**/*.js'],
    languageOptions: {
      globals: globals.browser,
    },
  },

  // Конфиги сборки исполняются в Node, хотя и лежат в клиентском пакете.
  {
    files: ['*.config.js', 'client/*.config.js'],
    languageOptions: {
      globals: globals.node,
    },
  },

  // Тесты обоих пакетов.
  {
    files: ['**/*.test.{js,jsx}', 'server/src/socket/testHarness.js'],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
  },
];
