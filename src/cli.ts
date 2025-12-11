#!/usr/bin/env node

// OTEL auto-instrumentation must be loaded BEFORE any other imports
// to properly hook into Node.js modules
const noOtel = process.argv.includes("--no-otel");
if (!noOtel) {
  // Find the command (first non-flag argument after script name)
  const validCommands = ["poll", "ingest", "registry", "dashboard"];
  const command = process.argv.slice(2).find((arg) => !arg.startsWith("-"));
  const serviceSuffix =
    command && validCommands.includes(command) ? `-${command}` : "";
  process.env.OTEL_SERVICE_NAME =
    process.env.OTEL_SERVICE_NAME ?? `shc2es${serviceSuffix}`;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("@elastic/opentelemetry-node");
}

import "dotenv/config";
import { readFileSync } from "fs";
import { join } from "path";

const COMMANDS: Record<
  string,
  { description: string; module: string; usage?: string }
> = {
  poll: {
    description: "Start long polling from Smart Home Controller",
    module: "./poll",
  },
  ingest: {
    description: "Ingest events to Elasticsearch",
    module: "./ingest",
    usage: "[--setup|--watch]",
  },
  registry: {
    description: "Fetch device/room registry from controller",
    module: "./fetch-registry",
  },
  dashboard: {
    description: "Export Kibana dashboard",
    module: "./export-dashboard",
    usage: "<name>|--list",
  },
};

function printUsage(): void {
  console.log(`
shc2es - Smart Home Controller to Elasticsearch

Usage: shc2es <command> [options]

Commands:
${Object.entries(COMMANDS)
  .map(([name, cmd]) => `  ${name.padEnd(12)} ${cmd.description}`)
  .join("\n")}

Options:
  --help, -h     Show this help message
  --version, -v  Show version
  --no-otel      Disable OpenTelemetry instrumentation

Examples:
  shc2es poll                    Start collecting events
  shc2es ingest --setup          Setup Elasticsearch indices
  shc2es ingest --watch          Watch and ingest in real-time
  shc2es ingest                  Batch import existing data
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
  const globalFlags = ["--no-otel", "--help", "-h", "--version", "-v"];
  const filteredArgs = args.filter((arg) => !globalFlags.includes(arg));
  const command = filteredArgs[0];

  // Handle global flags (check version first since it's more specific)
  if (args.includes("--version") || args.includes("-v")) {
    const { version } = JSON.parse(
      readFileSync(join(__dirname, "..", "package.json"), "utf-8"),
    ) as { version: string };
    console.log(`shc2es v${version}`);
    process.exit(0);
  }

  if (args.includes("--help") || args.includes("-h") || !command) {
    printUsage();
    process.exit(0);
  }

  if (!(command in COMMANDS)) {
    console.error(`Unknown command: ${command}\n`);
    console.error(`Available commands: ${Object.keys(COMMANDS).join(", ")}`);
    console.error(`Run 'shc2es --help' for usage information.`);
    process.exit(1);
  }

  // Remove the command and --no-otel from argv so submodules see correct args
  const subArgs = args.filter((arg) => arg !== command && arg !== "--no-otel");
  process.argv = [process.argv[0], process.argv[1], ...subArgs];

  // Dynamic import of the command module
  const modulePath = COMMANDS[command].module;
  await import(modulePath);
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error("Fatal error:", message);
  process.exit(1);
});
