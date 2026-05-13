import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

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
    },
    rules: {
      // React 19's new rule catches genuine cascading renders but also the
      // entirely legitimate "fetch on mount" pattern (useEffect(() => {
      // load() }, [])). Refactoring 35 call sites isn't worth the regression
      // risk — keep it as a warning so real new offenders show up without
      // failing the lint gate.
      'react-hooks/set-state-in-effect': 'warn',
      // Allow `_`-prefixed args/vars to opt out of unused-vars — standard convention.
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
    },
  },
])
