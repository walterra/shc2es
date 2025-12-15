# Repository Best Practices

This document itemizes the best practices implemented in this repository, generalized for use as a reference in other projects.

## Table of Contents

- [Project Setup](#project-setup)
- [TypeScript Configuration](#typescript-configuration)
- [Package Management](#package-management)
- [Code Quality & Linting](#code-quality--linting)
- [Testing Infrastructure](#testing-infrastructure)
- [Logging & Observability](#logging--observability)
- [Security Practices](#security-practices)
- [Documentation](#documentation)
- [CI/CD & Automation](#cicd--automation)
- [Version Management](#version-management)
- [CLI Design](#cli-design)
- [Configuration Management](#configuration-management)

---

## Project Setup

### Node.js Version Management

**✅ Best Practice**: Use `.nvmrc` to specify Node.js version

```
20
```

**Benefits**:
- Consistent development environment across team
- CI/CD uses same version as local development
- Easy onboarding for new contributors

**Implementation**:
```json
// package.json
{
  "engines": {
    "node": ">=20.0.0"
  }
}
```

### Directory Structure

**✅ Best Practice**: Separate user data from application code

```
src/               # Application source code
dist/              # Compiled output (gitignored)
tests/             # Test files
  unit/            # Unit tests
  integration/     # Integration tests
  mocks/           # Mock implementations
  utils/           # Test helpers
  setup.ts         # Global test setup
spec/              # Design documents and specifications
docs/              # User documentation
~/.app-name/       # User configuration and data
  .env             # Environment variables
  data/            # Generated data files
  logs/            # Application logs
  certs/           # Certificates and keys
```

**Implementation**:
```typescript
// config.ts
import * as os from 'os';
import * as path from 'path';

export const USER_CONFIG_DIR = path.join(os.homedir(), '.app-name');
export const DATA_DIR = path.join(USER_CONFIG_DIR, 'data');
export const LOGS_DIR = path.join(USER_CONFIG_DIR, 'logs');
export const CERTS_DIR = path.join(USER_CONFIG_DIR, 'certs');
```

### Essential Files

**✅ Best Practice**: Include all standard open source files

- `LICENSE` - Software license (e.g., MIT)
- `README.md` - User-facing documentation
- `CONTRIBUTING.md` - Contribution guidelines
- `SECURITY.md` - Security policy and reporting
- `CODE_OF_CONDUCT.md` - Community standards
- `CHANGELOG.md` - Version history
- `.gitignore` - Files to exclude from version control
- `.env.example` - Environment variable template

---

## TypeScript Configuration

### Strict Mode Configuration

**✅ Best Practice**: Enable all strict type checking

```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

**Benefits**:
- Catch bugs at compile time
- Better IDE autocomplete
- Self-documenting code
- Easier refactoring

### Build Scripts

**✅ Best Practice**: Separate build from publish

```json
{
  "scripts": {
    "build": "tsc",
    "prepublishOnly": "yarn build && yarn tsc --noEmit"
  }
}
```

---

## Package Management

### Yarn Configuration

**✅ Best Practice**: Use Yarn Classic with frozen lockfile in CI

```json
{
  "scripts": {
    "install": "yarn install",
    "ci": "yarn install --frozen-lockfile"
  }
}
```

**Benefits**:
- Reproducible builds
- Faster CI runs
- Prevents accidental dependency updates

### Package.json Metadata

**✅ Best Practice**: Complete metadata for discoverability

```json
{
  "name": "package-name",
  "version": "1.0.0",
  "description": "Clear, concise description",
  "keywords": ["keyword1", "keyword2"],
  "author": "Name <email>",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/user/repo.git"
  },
  "bugs": {
    "url": "https://github.com/user/repo/issues"
  },
  "homepage": "https://github.com/user/repo#readme",
  "engines": {
    "node": ">=20.0.0"
  }
}
```

### Files Field

**✅ Best Practice**: Explicitly include files for npm package

```json
{
  "files": [
    "dist",
    "docs",
    "README.md",
    "LICENSE"
  ]
}
```

**Benefits**:
- Smaller package size
- No accidental inclusion of sensitive files
- Faster installs for users

---

## Code Quality & Linting

### ESLint Flat Config (2024+)

**✅ Best Practice**: Use modern flat config with TypeScript strict rules

```javascript
// eslint.config.mjs
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';

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
  },
  {
    ignores: ['dist/', 'node_modules/', '*.js', '*.mjs'],
  },
  eslintConfigPrettier
);
```

**Benefits**:
- Catches common errors and anti-patterns
- Enforces consistent code style
- TypeScript-aware linting
- Compatible with Prettier

### Prettier Integration

**✅ Best Practice**: Format code automatically

```json
{
  "scripts": {
    "format": "prettier --write src/",
    "format:check": "prettier --check src/"
  }
}
```

**CI Integration**:
```yaml
# .github/workflows/ci.yml
- name: Check formatting
  run: yarn format:check
```

---

## Testing Infrastructure

### Jest Configuration

**✅ Best Practice**: Comprehensive test setup with coverage thresholds

```javascript
// jest.config.js
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: [
    '**/__tests__/**/*.ts',
    '**/?(*.)+(spec|test).ts'
  ],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/cli.ts', // CLI scripts tested via E2E
  ],
  coverageThreshold: {
    global: {
      branches: 60,
      functions: 70,
      lines: 70,
      statements: 70
    }
  },
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,
  verbose: true,
};
```

### Test Organization

**✅ Best Practice**: Structured test directory with utilities

```
tests/
├── unit/              # Fast, isolated tests
├── integration/       # Tests with external dependencies
├── mocks/             # Shared mock implementations
├── utils/             # Test helpers and utilities
└── setup.ts           # Global test configuration
```

### Test Scripts

**✅ Best Practice**: Multiple test modes for different workflows

```json
{
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "test:ci": "jest --ci --coverage --maxWorkers=2"
  }
}
```

### Test Environment Setup

**✅ Best Practice**: Disable side effects during testing

```typescript
// tests/setup.ts
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
process.env.OTEL_SDK_DISABLED = 'true';
```

---

## Logging & Observability

### Dual Logging Streams

**✅ Best Practice**: Separate application logs from data logs

```typescript
// logger.ts
import pino from 'pino';

// Application logs (debugging the app)
export const appLogger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  transport: {
    targets: [
      { target: 'pino-pretty', level: 'info' },
      { target: 'pino/file', options: { destination: 'app.log' } }
    ]
  }
});

// Data logs (business events)
export const dataLogger = pino({
  level: 'info',
  transport: {
    target: 'pino/file',
    options: { destination: 'data.ndjson' }
  }
});
```

**Benefits**:
- Debug tool behavior separately from collected data
- Different retention policies for each stream
- Data logs can be ingested into analytics systems

### Structured Logging

**✅ Best Practice**: Use JSON structured logging with Pino

```typescript
import { appLogger } from './logger';

appLogger.info({ 
  userId: '123', 
  action: 'login' 
}, 'User logged in');
```

**Benefits**:
- Machine-readable logs
- Easy filtering and searching
- Integration with log aggregation tools

### OpenTelemetry Integration

**✅ Best Practice**: Built-in observability with EDOT

```typescript
// cli.ts
const noOtel = process.argv.includes('--no-otel');
if (!noOtel) {
  process.env.OTEL_SERVICE_NAME = process.env.OTEL_SERVICE_NAME ?? 'app-name';
  require('@elastic/opentelemetry-node');
}
```

**Configuration**:
```bash
# .env
OTEL_SERVICE_NAME=app-name
OTEL_RESOURCE_ATTRIBUTES=service.version=1.0.0,deployment.environment=production
OTEL_EXPORTER_OTLP_ENDPOINT=https://your-apm-server
```

**Benefits**:
- Automatic tracing and metrics
- Correlation between logs, traces, and metrics
- Performance monitoring out of the box

---

## Security Practices

### Environment Variables

**✅ Best Practice**: Never commit secrets, use .env.example

```bash
# .env.example
API_KEY=your_key_here
DATABASE_URL=postgres://user:pass@localhost/db
```

**gitignore**:
```
.env
.env.local
.env.*.local
```

### TLS Configuration

**✅ Best Practice**: Secure by default, configurable for development

```typescript
// config.ts
export function buildTlsConfig() {
  const tlsVerify = process.env.ES_TLS_VERIFY !== 'false';
  const caCert = process.env.ES_CA_CERT;
  
  if (!tlsVerify) {
    console.warn('⚠️  TLS verification disabled - use only in development!');
  }
  
  return {
    rejectUnauthorized: tlsVerify,
    ca: caCert ? readFileSync(caCert) : undefined
  };
}
```

**Environment Variables**:
```bash
# Production (secure)
ES_TLS_VERIFY=true
ES_CA_CERT=/path/to/ca.pem

# Development (self-signed certs)
ES_TLS_VERIFY=false
```

### Sensitive Data Storage

**✅ Best Practice**: Store certificates in user home directory

```typescript
// config.ts
export const CERTS_DIR = path.join(os.homedir(), '.app-name', 'certs');
export const CERT_FILE = path.join(CERTS_DIR, 'client-cert.pem');
export const KEY_FILE = path.join(CERTS_DIR, 'client-key.pem');
```

**gitignore**:
```
certs/
*.pem
*.key
```

### Security Scanning

**✅ Best Practice**: Enable GitHub security features

```yaml
# .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
    cooldown:
      default-days: 14
```

**Enable in GitHub Settings**:
- Dependabot alerts
- Secret scanning
- Code scanning (optional)

---

## Documentation

### README Structure

**✅ Best Practice**: Quick start within 5 minutes

```markdown
# Project Name

One-line description

## Quick Start

```bash
# Installation
npm install -g package-name

# Configuration
cp .env.example ~/.package-name/.env
# Edit ~/.package-name/.env

# Run
package-name start
```

## Features
## Installation
## Configuration
## Usage
## Documentation
## Contributing
## License
```

### Developer Documentation

**✅ Best Practice**: Separate AI agent guidance from user docs

- `README.md` - User-facing documentation
- `CLAUDE.md` - AI assistant guidance (commands, debugging, restrictions)
- `CONTRIBUTING.md` - Developer contribution guide
- `spec/` - Design documents and architecture decisions

### Inline Documentation

**✅ Best Practice**: Document why, not what

```typescript
// ❌ Bad - Obvious what it does
// Set timeout to 30 seconds
const TIMEOUT = 30000;

// ✅ Good - Explains why
// Bosch controller may take up to 25s to respond during device pairing,
// so we set a 30s timeout to avoid false negatives
const TIMEOUT = 30000;
```

---

## CI/CD & Automation

### GitHub Actions CI

**✅ Best Practice**: Test on multiple Node.js versions

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [20.x, 22.x]
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Use Node.js ${{ matrix.node-version }}
        uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
          cache: 'yarn'
      
      - name: Install dependencies
        run: yarn install --frozen-lockfile
      
      - name: Run linter
        run: yarn lint
      
      - name: Check formatting
        run: yarn format:check
      
      - name: Type check
        run: yarn tsc --noEmit
      
      - name: Build
        run: yarn build
      
      - name: Run tests
        run: yarn test:ci
```

### Automated Releases

**✅ Best Practice**: Use changesets for version management

```yaml
# .github/workflows/release.yml
name: Release

on:
  push:
    branches: [main]

jobs:
  release:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write
      id-token: write
    
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      
      - name: Install Dependencies
        run: yarn install --frozen-lockfile
      
      - name: Create Release Pull Request or Publish
        uses: changesets/action@v1
        with:
          publish: yarn release
          createGithubReleases: true
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
```

### OpenSSF Scorecard

**✅ Best Practice**: Security best practices scoring

```yaml
# .github/workflows/scorecard.yml
name: OpenSSF Scorecard

on:
  branch_protection_rule:
  schedule:
    - cron: '0 2 * * 0'
  push:
    branches: [main]

permissions: read-all

jobs:
  analysis:
    runs-on: ubuntu-latest
    permissions:
      security-events: write
      id-token: write
    
    steps:
      - uses: actions/checkout@v4
      - uses: ossf/scorecard-action@v2
        with:
          results_file: results.sarif
          publish_results: true
      
      - uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: results.sarif
```

---

## Version Management

### Changesets

**✅ Best Practice**: File-based version management

```bash
# Create changeset manually (avoid interactive mode)
cat > .changeset/my-feature.md << EOF
---
"package-name": minor
---

Add new feature description (user-facing, for CHANGELOG)
EOF
```

**Guidelines**:
- **patch**: Bug fixes, dependency updates
- **minor**: New features, backward compatible
- **major**: Breaking changes

**Good changeset messages**:
- ✅ "Add Jest testing infrastructure with 70% coverage thresholds"
- ✅ "Fix timeout causing fatal errors in long polling"
- ❌ "Updated config.ts, logger.ts, and poll.ts" (too implementation-focused)

### Changelog

**✅ Best Practice**: Keep a Changelog format

```markdown
# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

## [1.0.0] - 2025-01-15

### Added
- Initial release
- CLI with poll, ingest, registry commands

### Changed
- Improved error handling

### Fixed
- Connection timeout issues
```

---

## CLI Design

### Command Structure

**✅ Best Practice**: Clear subcommands with help text

```typescript
// cli.ts
const COMMANDS: Record<string, {
  description: string;
  module: string;
  usage?: string;
}> = {
  poll: {
    description: 'Start long polling from source',
    module: './poll',
  },
  ingest: {
    description: 'Ingest data to destination',
    module: './ingest',
    usage: '[--setup|--watch|--pattern <glob>]',
  },
};

function printUsage(): void {
  console.log(`
Usage: app-name <command> [options]

Commands:
${Object.entries(COMMANDS).map(([cmd, { description, usage }]) =>
  `  ${cmd.padEnd(12)} ${description}${usage ? `\n               ${usage}` : ''}`
).join('\n')}
  `);
}
```

### Package.json Bin

**✅ Best Practice**: CLI entry point in dist/

```json
{
  "bin": {
    "app-name": "dist/cli.js"
  },
  "scripts": {
    "build": "tsc"
  }
}
```

**CLI file**:
```typescript
#!/usr/bin/env node

// Instrumentation must load first
require('@elastic/opentelemetry-node');

// CLI implementation
```

### Developer Scripts

**✅ Best Practice**: Use ts-node for development, built CLI for production

```json
{
  "scripts": {
    "poll": "ts-node src/cli.ts poll",
    "poll:prod": "node dist/cli.js poll"
  }
}
```

---

## Configuration Management

### Centralized Config

**✅ Best Practice**: Single source of truth for configuration

```typescript
// config.ts
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as os from 'os';

// Load environment variables
export const USER_CONFIG_DIR = path.join(os.homedir(), '.app-name');
export const ENV_FILE = path.join(USER_CONFIG_DIR, '.env');

export function loadConfig() {
  // Load from user config dir first
  dotenv.config({ path: ENV_FILE });
  
  // Fall back to project .env for development
  dotenv.config();
}

// Validate required variables
export function validateConfig() {
  const required = ['API_KEY', 'HOST'];
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

// Export typed config
export const config = {
  apiKey: process.env.API_KEY!,
  host: process.env.HOST!,
  port: parseInt(process.env.PORT ?? '3000', 10),
  logLevel: process.env.LOG_LEVEL ?? 'info',
};
```

### Environment Variables

**✅ Best Practice**: Hierarchical configuration loading

```
1. ~/.app-name/.env     (user config, highest priority)
2. .env.local           (local overrides)
3. .env                 (project defaults)
4. hardcoded defaults   (fallbacks)
```

### Directory Initialization

**✅ Best Practice**: Create config directories on first run

```typescript
// config.ts
import * as fs from 'fs';

export function ensureConfigDirs() {
  [USER_CONFIG_DIR, CERTS_DIR, DATA_DIR, LOGS_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
}

// Call at module load
ensureConfigDirs();
```

---

## Summary Checklist

Use this checklist when setting up a new project:

### Essential Setup
- [ ] Create `.nvmrc` file
- [ ] Add `LICENSE` file
- [ ] Create `README.md` with Quick Start
- [ ] Add `.gitignore` (include .env, dist/, node_modules/)
- [ ] Create `.env.example`
- [ ] Configure TypeScript with strict mode
- [ ] Set up ESLint with flat config
- [ ] Configure Prettier
- [ ] Add `CONTRIBUTING.md`
- [ ] Add `SECURITY.md`
- [ ] Add `CODE_OF_CONDUCT.md`

### Package Configuration
- [ ] Complete package.json metadata (description, keywords, author, license)
- [ ] Add repository, bugs, homepage fields
- [ ] Specify Node.js version in engines
- [ ] Add files field to control published files
- [ ] Configure build scripts (build, prepublishOnly)

### Testing
- [ ] Set up Jest with ts-jest
- [ ] Create tests/ directory structure
- [ ] Configure coverage thresholds
- [ ] Add test scripts (test, test:watch, test:coverage, test:ci)
- [ ] Create test utilities and mocks

### CI/CD
- [ ] Create GitHub Actions CI workflow
- [ ] Test on multiple Node.js versions
- [ ] Add automated formatting and linting checks
- [ ] Configure Dependabot
- [ ] Set up automated releases with changesets
- [ ] Add OpenSSF Scorecard (optional)

### Security
- [ ] Never commit .env files
- [ ] Enable Dependabot alerts
- [ ] Enable secret scanning
- [ ] Store sensitive data in user home directory
- [ ] Make TLS verification configurable but secure by default

### Documentation
- [ ] Write clear README with 5-minute Quick Start
- [ ] Document environment variables
- [ ] Create CLAUDE.md for AI assistance (optional)
- [ ] Add inline comments explaining "why"
- [ ] Keep CHANGELOG.md up to date

### Observability (Optional)
- [ ] Set up structured logging with Pino
- [ ] Integrate OpenTelemetry
- [ ] Separate app logs from data logs
- [ ] Add log viewing helper scripts

---

## References

- [Snyk - Modern npm Package Best Practices](https://snyk.io/blog/best-practices-create-modern-npm-package/)
- [GitHub Open Source Guides](https://opensource.guide/)
- [OpenSSF Best Practices](https://github.com/ossf/wg-best-practices-os-developers)
- [Keep a Changelog](https://keepachangelog.com/)
- [Semantic Versioning](https://semver.org/)
- [TypeScript ESLint](https://typescript-eslint.io/)
- [Jest Best Practices](https://jestjs.io/docs/configuration)
- [Pino Logging](https://getpino.io/)
- [OpenTelemetry Node.js](https://opentelemetry.io/docs/languages/js/)
