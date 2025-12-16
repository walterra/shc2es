import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';
import jsdoc from 'eslint-plugin-jsdoc';

export default tseslint.config(
  eslint.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        project: './tsconfig.eslint.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      jsdoc,
    },
    rules: {
      // Disallow console.* methods - use structured logging (pino) instead
      'no-console': 'error',

      // JSDoc enforcement rules
      'jsdoc/require-jsdoc': [
        'error',
        {
          require: {
            FunctionDeclaration: true,
            MethodDefinition: false, // Disable for methods - covered by class/interface JSDoc
            ClassDeclaration: true,
            ArrowFunctionExpression: false,
            FunctionExpression: false,
          },
          contexts: [
            'ExportNamedDeclaration[declaration.type="TSInterfaceDeclaration"]',
            'ExportNamedDeclaration[declaration.type="TSTypeAliasDeclaration"]',
            'TSMethodSignature',
          ],
          publicOnly: true, // Only require JSDoc for exported functions
          enableFixer: false,
          checkConstructors: false, // Constructors documented in class JSDoc
        },
      ],
      'jsdoc/require-description': [
        'error',
        {
          contexts: ['any'],
          checkConstructors: false,
          checkGetters: false,
          checkSetters: false,
        },
      ],
      'jsdoc/require-param': 'error',
      'jsdoc/require-param-description': 'error',
      'jsdoc/require-param-name': 'error',
      'jsdoc/require-returns': [
        'error',
        {
          checkGetters: false,
          forceRequireReturn: false,
          forceReturnsWithAsync: false,
        },
      ],
      'jsdoc/require-returns-description': 'error',
      'jsdoc/check-param-names': 'error',
      'jsdoc/check-tag-names': 'error',
      'jsdoc/check-types': 'off', // TypeScript handles this
      'jsdoc/require-example': 'off', // Too strict for all functions, enable selectively if needed
      'jsdoc/no-undefined-types': 'off', // TypeScript handles this
      
      // Ban overused words in JSDoc descriptions
      // TODO: Re-enable as 'error' after fixing existing violations
      'jsdoc/match-description': [
        'warn',
        {
          matchDescription: '^(?!.*\\bcomprehensive\\b).*$',
          message: 'Avoid "comprehensive" - remove adjective or be specific.',
        },
      ],

      // Strict TypeScript rules for type safety
      '@typescript-eslint/no-explicit-any': 'error', // Prevent explicit any types
      '@typescript-eslint/no-unsafe-assignment': 'error', // Prevent assignments from any
      '@typescript-eslint/no-unsafe-call': 'error', // Prevent calling any values
      '@typescript-eslint/no-unsafe-member-access': 'error', // Prevent accessing properties on any
      '@typescript-eslint/no-unsafe-return': 'error', // Prevent returning any from functions
      '@typescript-eslint/explicit-function-return-type': 'error', // Require explicit return types on functions
      '@typescript-eslint/consistent-type-imports': 'error', // Separate type-only imports using import type
    },
  },
  {
    // Allow console.* in CLI entry point - needed for user-facing output
    files: ['src/cli.ts'],
    rules: {
      'no-console': 'off',
    },
  },
  {
    // Test files don't need JSDoc comments
    files: ['**/*.test.ts'],
    rules: {
      'jsdoc/require-jsdoc': 'off',
      'jsdoc/require-description': 'off',
      'jsdoc/require-param': 'off',
      'jsdoc/require-returns': 'off',
    },
  },
  {
    ignores: ['dist/', 'node_modules/', '*.js', '*.mjs'],
  },
  eslintConfigPrettier
);
