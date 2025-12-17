import { defineConfig } from 'eslint/config';
import tseslintParser from '@typescript-eslint/parser';
import tseslintPlugin from '@typescript-eslint/eslint-plugin';
import eslintConfigPrettier from 'eslint-config-prettier';
import eslintPluginPrettier from 'eslint-plugin-prettier';

export default defineConfig([
    {
        files: ['**/*.ts'],
        languageOptions: {
            parser: tseslintParser,
            parserOptions: {
                ecmaVersion: 2020,
                sourceType: 'module',
            },
        },
        plugins: {
            '@typescript-eslint': tseslintPlugin,
            prettier: eslintPluginPrettier,
        },
        rules: {
            ...tseslintPlugin.configs.recommended.rules,
            '@typescript-eslint/explicit-module-boundary-types': 'off',
            '@typescript-eslint/no-explicit-any': 'warn',
            'prettier/prettier': 'error',
        },
    },
    eslintConfigPrettier,
    {
        ignores: ['node_modules/**', 'dist/**', 'coverage/**', '.husky/**'],
    },
]);
