# Publishing Setup Checklist

This document outlines the steps needed to publish shc2es on GitHub and npm following 2025 best practices.

## Current State

### Done

- MIT license declared in package.json
- README.md with usage documentation
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
- `repository`, `bugs`, `homepage` fields added
- `engines` field added (node >=20.0.0)
- `.nvmrc` file added (version 20)
- CHANGELOG.md created
- CONTRIBUTING.md created
- SECURITY.md created
- CODE_OF_CONDUCT.md created (simplified for single-maintainer project)
- GitHub Actions CI workflow added
- Dependabot configured (weekly npm updates, 14-day cooldown)
- Changesets configured for release management
- Release workflow added (auto-creates Release PR, OIDC publishing)
- ESLint with flat config (`eslint.config.mjs`) - `strictTypeChecked` + `stylisticTypeChecked`
- Prettier for formatting (`eslint-config-prettier`)
- `yarn audit` configured for security checks
- TLS certificate verification made configurable (defaults to secure/enabled)
  - `src/ingest.ts` - Removed global `NODE_TLS_REJECT_UNAUTHORIZED`, uses `buildTlsConfig()` with undici Agent
  - `src/export-dashboard.ts` - Uses `buildTlsConfig()` with undici Agent (no global disable)
  - `otel-collector-config.yml` - Uses `OTEL_TLS_VERIFY` (inverted via docker-compose to `OTEL_TLS_SKIP_VERIFY`)
  - `.env.example` updated with TLS variables (`ES_TLS_VERIFY`, `ES_CA_CERT`, `OTEL_TLS_VERIFY`, `OTEL_CA_FILE`)
  - `README.md` updated with TLS configuration section and Quick Start warning
- **Trusted Publishing** - OIDC-based npm publishing from CI (no stored tokens)
- **2FA enabled** on npm account
- **Granular read-only tokens** for CI installs
- **Dependabot alerts** enabled (GitHub Settings > Security)
- **Secret scanning** enabled (GitHub Settings > Security)
- **OpenSSF Scorecard** GitHub Action + badge added

### Blocking Issues

(none)

---

## npm Publishing Checklist

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

### Medium Priority (Issue Management)

- [ ] **Add issue templates** (`.github/ISSUE_TEMPLATE/`)

  - `bug_report.md` - Bug report template
  - `feature_request.md` - Feature request template

- [ ] **Add pull request template** (`.github/pull_request_template.md`)

- [ ] **Configure branch protection** (via GitHub Settings)
  - Require PR reviews before merging
  - Require status checks to pass

---

## 2025 Security Best Practices

### Sensitive Data

Ensure these are NEVER committed:

- `.env` files (use `.env.example` as template)
- `certs/` directory (generated per-installation)
- `data/` and `logs/` directories

### TLS Certificate Verification

**Current State:** TLS certificate verification is now configurable via environment variables, defaulting to **secure** (verification enabled).

| File                        | Method                            | Configuration                     |
| --------------------------- | --------------------------------- | --------------------------------- |
| `src/ingest.ts`             | `buildTlsConfig()` + undici Agent | `ES_TLS_VERIFY`, `ES_CA_CERT`     |
| `src/export-dashboard.ts`   | `buildTlsConfig()` + undici Agent | `ES_TLS_VERIFY`, `ES_CA_CERT`     |
| `otel-collector-config.yml` | Environment variable substitution | `OTEL_TLS_VERIFY`, `OTEL_CA_FILE` |

**Environment Variables:**

```bash
# Elasticsearch/Kibana TLS (used by ingest.ts, export-dashboard.ts)
ES_TLS_VERIFY=false           # Disable cert verification (for self-signed certs)
ES_CA_CERT=/path/to/ca.pem    # Custom CA certificate for verification

# OTEL Collector TLS (used by otel-collector-config.yml)
OTEL_TLS_VERIFY=false         # Disable cert verification (for self-signed certs)
OTEL_CA_FILE=/path/to/ca.pem  # Custom CA certificate for verification
```

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

## NPM

To enable OIDC publishing on npmjs.com (after first manual publish):

1. Go to package settings on npmjs.com
2. Add trusted publisher:

   - User: walterra
   - Repo: shc2es
   - Workflow: release.yml

## References

- [Snyk - Best Practices for Modern npm Packages](https://snyk.io/blog/best-practices-create-modern-npm-package/)
- [npm Docs - Trusted Publishing](https://docs.npmjs.com/trusted-publishers/)
- [GitHub Open Source Guides](https://opensource.guide/starting-a-project/)
- [OpenSSF Best Practices](https://github.com/ossf/wg-best-practices-os-developers)
- [Keep a Changelog](https://keepachangelog.com/)
- [Semantic Versioning](https://semver.org/)
