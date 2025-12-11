# Publishing Setup Checklist

This document outlines the steps needed to publish shc2es on GitHub and npm following 2025 best practices.

## Current State

### Done

- MIT license declared in package.json
- Comprehensive README.md with usage documentation
- TypeScript configuration (tsconfig.json)
- `.env.example` template for environment variables
- Detailed spec documentation (ELASTICSEARCH.md, KIBANA.md, OPEN-TELEMETRY.md)
- CLAUDE.md for development guidance
- LICENSE file created (MIT)
- package.json entry points fixed (`bin` → `dist/cli.js`, removed `main` for pure CLI)
- Build scripts added (`build`, `prepublishOnly`)
- CLI with subcommands created (`shc2es poll|ingest|registry|dashboard`)
- OTEL instrumentation built into CLI (auto-enabled, use `--no-otel` to disable)
- Yarn scripts simplified to use CLI via ts-node
- `files` field added (publishes only dist/, README.md, LICENSE)
- `description` field added
- `keywords` field added

### Blocking Issues

(none)

---

## npm Publishing Checklist

### High Priority (Discoverability & Usability)

- [ ] **Add repository links** (after GitHub repo is created)

  ```json
  {
    "repository": {
      "type": "git",
      "url": "git+https://github.com/USERNAME/shc2es.git"
    },
    "bugs": {
      "url": "https://github.com/USERNAME/shc2es/issues"
    },
    "homepage": "https://github.com/USERNAME/shc2es#readme"
  }
  ```

- [ ] **Add engines field** (Node.js version requirement)
  ```json
  {
    "engines": {
      "node": ">=18.0.0"
    }
  }
  ```

### Medium Priority (Professional Polish)

- [ ] **Create CHANGELOG.md**

  ```markdown
  # Changelog

  All notable changes to this project will be documented in this file.

  The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
  and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

  ## [Unreleased]

  ## [1.0.0] - YYYY-MM-DD

  ### Added

  - Initial release
  - Long polling from Bosch Smart Home Controller II
  - NDJSON event logging
  - Elasticsearch ingestion support
  - OpenTelemetry instrumentation
  ```

- [ ] **Add .nvmrc** (pin Node.js version for contributors)

  ```
  20
  ```

- [ ] **Add type field** (explicit module system)
  ```json
  {
    "type": "commonjs"
  }
  ```

### Pre-Publish Verification

Before running `npm publish`:

```bash
# 1. Build the project
yarn build

# 2. Type check
yarn tsc --noEmit

# 3. Preview package contents
npm pack --dry-run

# 4. Test local installation
npm pack
cd /tmp && npm install /path/to/shc2es-1.0.0.tgz
```

---

## GitHub Repository Checklist

### High Priority (Community Standards)

- [ ] **Create CONTRIBUTING.md**

  ```markdown
  # Contributing to shc2es

  ## Getting Started

  1. Fork the repository
  2. Clone your fork
  3. Install dependencies: `yarn install`
  4. Copy `.env.example` to `.env` and configure

  ## Development

  - Run type checking: `yarn tsc --noEmit`
  - View logs: `yarn logs`

  ## Pull Requests

  - Create a branch for your feature/fix
  - Ensure type checking passes
  - Update documentation if needed
  - Submit PR with clear description

  ## Reporting Issues

  - Check existing issues first
  - Include Node.js version and OS
  - Provide steps to reproduce
  ```

- [ ] **Create SECURITY.md**

  ```markdown
  # Security Policy

  ## Supported Versions

  | Version | Supported          |
  | ------- | ------------------ |
  | 1.x.x   | :white_check_mark: |

  ## Reporting a Vulnerability

  Please report security vulnerabilities by emailing [EMAIL].

  Do NOT create public GitHub issues for security vulnerabilities.

  ## Security Considerations

  - Never commit `.env` files or certificates
  - Client certificates (`certs/`) contain private keys
  - The `data/` directory may contain sensitive home automation data
  ```

- [ ] **Create CODE_OF_CONDUCT.md**

  - Use [Contributor Covenant](https://www.contributor-covenant.org/) v2.1

- [ ] **Add GitHub Actions CI** (`.github/workflows/ci.yml`)

  ```yaml
  name: CI

  on:
    push:
      branches: [main]
    pull_request:
      branches: [main]

  jobs:
    build:
      runs-on: ubuntu-latest
      strategy:
        matrix:
          node-version: [18, 20, 22]

      steps:
        - uses: actions/checkout@v4

        - name: Use Node.js ${{ matrix.node-version }}
          uses: actions/setup-node@v4
          with:
            node-version: ${{ matrix.node-version }}
            cache: "yarn"

        - run: yarn install --frozen-lockfile
        - run: yarn tsc --noEmit
        - run: yarn build
  ```

### Medium Priority (Issue Management)

- [ ] **Add issue templates** (`.github/ISSUE_TEMPLATE/`)

  - `bug_report.md` - Bug report template
  - `feature_request.md` - Feature request template

- [ ] **Add pull request template** (`.github/pull_request_template.md`)

- [ ] **Configure branch protection** (via GitHub Settings)
  - Require PR reviews before merging
  - Require status checks to pass

### Low Priority (Automation)

- [ ] **Add Dependabot** (`.github/dependabot.yml`)

  ```yaml
  version: 2
  updates:
    - package-ecosystem: "npm"
      directory: "/"
      schedule:
        interval: "weekly"
  ```

- [ ] **Add npm publish workflow** (`.github/workflows/publish.yml`)
  - Use [npm Trusted Publishing](https://docs.npmjs.com/trusted-publishers/) with OIDC
  - Trigger on GitHub releases

---

## 2025 Security Best Practices

### npm Security

- [ ] **Use Trusted Publishing** - OIDC-based npm publishing from CI (no stored tokens)
- [ ] **Enable 2FA** on npm account
- [ ] **Use granular read-only tokens** for CI installs
- [ ] **Run `npm audit`** before releases

### Repository Security

- [ ] **Enable Dependabot alerts** (GitHub Settings > Security)
- [ ] **Enable secret scanning** (GitHub Settings > Security)
- [ ] **Consider OpenSSF Scorecard** badge for trust signal

### Sensitive Data

Ensure these are NEVER committed:

- `.env` files (use `.env.example` as template)
- `certs/` directory (generated per-installation)
- `data/` and `logs/` directories

---

## Quick Start Commands

After completing the checklist:

```bash
# 1. Create GitHub repository
gh repo create shc2es --public --source=. --remote=origin

# 2. Push to GitHub
git push -u origin main

# 3. Publish to npm (first time)
npm publish --access public

# 4. Create GitHub release
gh release create v1.0.0 --generate-notes
```

---

## References

- [Snyk - Best Practices for Modern npm Packages](https://snyk.io/blog/best-practices-create-modern-npm-package/)
- [npm Docs - Trusted Publishing](https://docs.npmjs.com/trusted-publishers/)
- [GitHub Open Source Guides](https://opensource.guide/starting-a-project/)
- [OpenSSF Best Practices](https://github.com/ossf/wg-best-practices-os-developers)
- [Keep a Changelog](https://keepachangelog.com/)
- [Semantic Versioning](https://semver.org/)
