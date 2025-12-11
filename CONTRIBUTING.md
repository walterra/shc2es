# Contributing to shc2es

Note this project is in it's early days! If you want to contribute, reach out first in a Github issue to discuss!

## Getting Started

1. Fork the repository
2. Clone your fork
3. Install dependencies: `yarn install`
4. Copy `.env.example` to `.env` and configure

## Development

- Run type checking: `yarn tsc --noEmit`
- Build: `yarn build`
- View logs: `yarn logs`

### CLI Commands (Development)

```bash
yarn poll              # Start long polling (with OTEL)
yarn poll:no-otel      # Start long polling (without OTEL)
yarn ingest            # Batch import to Elasticsearch
yarn ingest:setup      # Setup Elasticsearch indices
yarn ingest:watch      # Watch and ingest in real-time
yarn registry          # Fetch device registry
yarn dashboard:export  # Export Kibana dashboard
```

## Pull Requests

- Create a branch for your feature/fix
- Ensure type checking passes (`yarn tsc --noEmit`)
- Update documentation if needed
- Submit PR with clear description

## Reporting Issues

- Check existing issues first
- Include Node.js version and OS
- Provide steps to reproduce

## Code Style

- TypeScript strict mode enabled
- Use meaningful variable names
- Keep functions focused and small
