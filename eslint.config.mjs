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
        projectService: true,
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
    ignores: ['dist/', 'node_modules/', '*.js', '*.mjs'],
  },
  eslintConfigPrettier
);
