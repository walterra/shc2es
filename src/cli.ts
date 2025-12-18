#!/usr/bin/env node

// OTEL auto-instrumentation must be loaded BEFORE any other imports
// to properly hook into Node.js modules
const noOtel = process.argv.includes('--no-otel');
if (!noOtel) {
  // Find the command (first non-flag argument after script name)
  const validCommands = ['poll', 'ingest', 'registry', 'dashboard'];
  const command = process.argv.slice(2).find((arg) => !arg.startsWith('-'));
  const serviceSuffix = command && validCommands.includes(command) ? `-${command}` : '';
  process.env.OTEL_SERVICE_NAME = process.env.OTEL_SERVICE_NAME ?? `shc2es${serviceSuffix}`;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@elastic/opentelemetry-node');
}

import { readFileSync } from 'fs';
import { join } from 'path';
import { loadEnv } from './config';
import {
  validatePollConfig,
  validateIngestConfig,
  validateRegistryConfig,
  validateDashboardConfig,
} from './validation';
import type { PollConfig, IngestConfig, RegistryConfig, DashboardConfig } from './types/config';

const COMMANDS: Record<string, { description: string; module: string; usage?: string }> = {
  poll: {
    description: 'Start long polling from Smart Home Controller',
    module: './poll',
  },
  ingest: {
    description: 'Ingest events to Elasticsearch',
    module: './ingest/main',
    usage: '[--setup|--watch|--pattern <glob>]',
  },
  registry: {
    description: 'Fetch device/room registry from controller',
    module: './fetch-registry',
  },
  dashboard: {
    description: 'Export Kibana dashboard',
    module: './export-dashboard',
    usage: '<name>|--list',
  },
};

function printUsage(): void {
  console.log(`
shc2es - Smart Home Controller to Elasticsearch

Usage: shc2es <command> [options]

Commands:
${Object.entries(COMMANDS)
  .map(([name, cmd]) => `  ${name.padEnd(12)} ${cmd.description}`)
  .join('\n')}

Options:
  --help, -h     Show this help message
  --version, -v  Show version
  --no-otel      Disable OpenTelemetry instrumentation

Examples:
  shc2es poll                    Start collecting events
  shc2es ingest --setup          Setup Elasticsearch indices
  shc2es ingest --watch          Watch and ingest in real-time
  shc2es ingest                  Batch import existing data
  shc2es ingest --pattern "events-2025-12-*.ndjson"  Import specific files
  shc2es registry                Fetch device registry
  shc2es dashboard --list        List available dashboards
  shc2es dashboard <name>        Export a dashboard

For command-specific help:
  shc2es <command> --help
`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // Filter out global flags to find the command
  const globalFlags = ['--no-otel', '--help', '-h', '--version', '-v'];
  const filteredArgs = args.filter((arg) => !globalFlags.includes(arg));
  const command = filteredArgs[0];

  // Handle global flags (check version first since it's more specific)
  if (args.includes('--version') || args.includes('-v')) {
    const { version } = JSON.parse(
      readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'),
    ) as { version: string };
    console.log(`shc2es v${version}`);
    process.exit(0);
  }

  if (args.includes('--help') || args.includes('-h') || !command) {
    printUsage();
    process.exit(0);
  }

  if (!(command in COMMANDS)) {
    console.error(`Unknown command: ${command}\n`);
    console.error(`Available commands: ${Object.keys(COMMANDS).join(', ')}`);
    console.error(`Run 'shc2es --help' for usage information.`);
    process.exit(1);
  }

  // Load environment variables before executing any command
  loadEnv();

  // Validate configuration based on command
  // Configuration is loaded once here and passed to command's main() function
  let config: PollConfig | IngestConfig | RegistryConfig | DashboardConfig | undefined;

  switch (command) {
    case 'poll': {
      const result = validatePollConfig();
      if (result.isErr()) {
        console.error(`Configuration error: ${result.error.message}`);
        process.exit(1);
      }
      config = result.value;
      break;
    }
    case 'ingest': {
      // Check if --setup flag is present (requires Kibana)
      const requireKibana = args.includes('--setup');
      const result = validateIngestConfig({ requireKibana });
      if (result.isErr()) {
        console.error(`Configuration error: ${result.error.message}`);
        process.exit(1);
      }
      config = result.value;
      break;
    }
    case 'registry': {
      const result = validateRegistryConfig();
      if (result.isErr()) {
        console.error(`Configuration error: ${result.error.message}`);
        process.exit(1);
      }
      config = result.value;
      break;
    }
    case 'dashboard': {
      const result = validateDashboardConfig();
      if (result.isErr()) {
        console.error(`Configuration error: ${result.error.message}`);
        process.exit(1);
      }
      config = result.value;
      break;
    }
    default:
      // Should never happen due to earlier validation
      console.error(`Unknown command: ${command}`);
      process.exit(1);
  }

  // Remove the command and --no-otel from argv so submodules see correct args
  const subArgs = args.filter((arg) => arg !== command && arg !== '--no-otel');
  process.argv = [process.argv[0] ?? 'node', process.argv[1] ?? '', ...subArgs];

  // Dynamic import of the command module and call its main() function
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const modulePath = COMMANDS[command]!.module;

  // Create exit callback to avoid unbound method issues
  const exit = (code: number): void => {
    process.exit(code);
  };

  // Call main() with config based on command type
  // Each command has a different signature - handle appropriately
  switch (command) {
    case 'poll': {
      const module = (await import(modulePath)) as {
        main?: (
          exit: (code: number) => void,
          config: PollConfig,
          signal?: AbortSignal,
          bridgeFactory?: unknown,
        ) => void | Promise<void>;
      };
      if (typeof module.main === 'function') {
        // Pass config as required second parameter for poll command
        // Poll main() is synchronous (returns void, not Promise<void>)
        // Use void operator to explicitly ignore return value for ESLint
        void module.main(exit, config as PollConfig);
      } else {
        console.error(`Module ${modulePath} does not export a main() function`);
        exit(1);
      }
      break;
    }
    case 'ingest': {
      const module = (await import(modulePath)) as {
        main?: (
          exit: (code: number) => void,
          context?: { config?: Partial<IngestConfig> },
        ) => void | Promise<void>;
      };
      if (typeof module.main === 'function') {
        // Pass config via IngestContext for ingest command
        await module.main(exit, { config: config as IngestConfig });
      } else {
        console.error(`Module ${modulePath} does not export a main() function`);
        exit(1);
      }
      break;
    }
    case 'registry': {
      const module = (await import(modulePath)) as {
        main?: (
          exit: (code: number) => void,
          context: { config: RegistryConfig },
        ) => void | Promise<void>;
      };
      if (typeof module.main === 'function') {
        // Pass config via RegistryContext for registry command
        await module.main(exit, { config: config as RegistryConfig });
      } else {
        console.error(`Module ${modulePath} does not export a main() function`);
        exit(1);
      }
      break;
    }
    case 'dashboard': {
      const module = (await import(modulePath)) as {
        main?: (
          exit: (code: number) => void,
          context: { config: DashboardConfig },
        ) => void | Promise<void>;
      };
      if (typeof module.main === 'function') {
        // Pass config via DashboardContext for dashboard command
        await module.main(exit, { config: config as DashboardConfig });
      } else {
        console.error(`Module ${modulePath} does not export a main() function`);
        exit(1);
      }
      break;
    }
  }
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error('Fatal error:', message);
  process.exit(1);
});
