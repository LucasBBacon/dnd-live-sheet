import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const tsconfigRootDir = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: {
        tsconfigRootDir,
      },
    },
    rules: {
      // tseslint.configs.recommended turns this rule on with no options, so
      // ignoreRestSiblings defaults to false (see @typescript-eslint/eslint-plugin's
      // no-unused-vars rule). That default flags a name bound only to discard a
      // property via `const { a, ...rest } = obj`, which is exactly how the
      // pack-loading fixtures strip `$schema` before validating. Opting in here
      // keeps that idiom lint-clean without turning the rule off.
      '@typescript-eslint/no-unused-vars': ['error', { ignoreRestSiblings: true }],
    },
  },
])
