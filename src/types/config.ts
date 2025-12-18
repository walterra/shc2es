/**
 * Application configuration types
 *
 * Centralized configuration interfaces for all CLI commands.
 * Configuration is loaded and validated in cli.ts, then passed to individual scripts.
 */

/**
 * Log level type
 */
export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

/**
 * Configuration for the poll command.
 *
 * Contains all settings needed to connect to and poll the Bosch Smart Home Controller.
 */
export interface PollConfig {
  /** Smart Home Controller IP address or hostname */
  bshHost: string;
  /** System password for controller authentication */
  bshPassword: string;
  /** Client name for identification (default: 'oss_bosch_smart_home_poll') */
  bshClientName: string;
  /** Client ID for identification (default: 'oss_bosch_smart_home_poll_client') */
  bshClientId: string;
  /** Log level for application logging */
  logLevel: LogLevel;
}

/**
 * Configuration for the ingest command.
 *
 * Contains all settings needed to connect to Elasticsearch and optionally Kibana
 * for data ingestion and dashboard setup.
 */
export interface IngestConfig {
  /** Elasticsearch node URL (e.g., 'https://localhost:9200') */
  esNode: string;
  /** Elasticsearch password for authentication */
  esPassword: string;
  /** Elasticsearch username (default: 'elastic') */
  esUser: string;
  /** Optional path to CA certificate for TLS verification */
  esCaCert?: string;
  /** Whether to verify TLS certificates (default: true, disable only for dev) */
  esTlsVerify: boolean;
  /** Index name prefix (default: 'smart-home-events') */
  esIndexPrefix: string;
  /** Optional Kibana node URL (required for dashboard import) */
  kibanaNode?: string;
}

/**
 * Configuration for the registry command.
 *
 * Contains settings needed to fetch device and room metadata from the controller.
 */
export interface RegistryConfig {
  /** Smart Home Controller IP address or hostname */
  bshHost: string;
}

/**
 * Configuration for the dashboard export command.
 *
 * Contains settings needed to connect to Kibana for exporting dashboards.
 */
export interface DashboardConfig {
  /** Kibana node URL (e.g., 'https://localhost:5601') */
  kibanaNode: string;
  /** Elasticsearch password for Kibana authentication */
  esPassword: string;
  /** Elasticsearch username (default: 'elastic') */
  esUser: string;
  /** Optional path to CA certificate for TLS verification */
  esCaCert?: string;
  /** Whether to verify TLS certificates (default: true, disable only for dev) */
  esTlsVerify: boolean;
}

/**
 * Combined application configuration.
 *
 * Contains configuration for all commands. Individual commands receive
 * only their relevant subset via dependency injection.
 */
export interface AppConfig {
  /** Configuration for poll command */
  poll: PollConfig;
  /** Configuration for ingest command */
  ingest: IngestConfig;
  /** Configuration for registry command */
  registry: RegistryConfig;
  /** Configuration for dashboard command */
  dashboard: DashboardConfig;
}
