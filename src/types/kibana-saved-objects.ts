/**
 * TypeScript type definitions for Kibana Saved Objects API.
 *
 * Based on official Kibana Saved Objects API documentation:
 * https://www.elastic.co/docs/api/doc/kibana/group/endpoint-saved-objects
 *
 * These types match the structure returned by Kibana API endpoints:
 * - POST /api/saved_objects/_export
 * - POST /api/saved_objects/_import
 * - GET /api/saved_objects/_find
 */

/**
 * Reference to another saved object.
 * Used to establish relationships between saved objects.
 */
export interface SavedObjectReference {
  /** The type of the referenced saved object (e.g., 'index-pattern', 'dashboard') */
  type: string;
  /** The unique identifier of the referenced saved object */
  id: string;
  /** A name to identify this reference within the parent object */
  name: string;
}

/**
 * Error information for a saved object operation.
 */
export interface SavedObjectError {
  /** Error type (e.g., 'conflict', 'missing_references') */
  error: string;
  /** Human-readable error message */
  message: string;
  /** HTTP status code associated with the error */
  statusCode: number;
}

/**
 * Base saved object structure returned by Kibana APIs.
 *
 * @template T The type of the attributes object (specific to each saved object type)
 */
export interface SavedObject<T = Record<string, unknown>> {
  /** Unique identifier for the saved object */
  id: string;
  /** The type of saved object (e.g., 'dashboard', 'index-pattern', 'visualization') */
  type: string;
  /** The saved object's attributes (type-specific data) */
  attributes: T;
  /** References to other saved objects this object depends on */
  references?: SavedObjectReference[];
  /** Version string for optimistic concurrency control */
  version?: string;
  /** Migration versions for different aspects of the saved object */
  migrationVersion?: Record<string, string>;
  /** Core migration version (Kibana version format) */
  coreMigrationVersion?: string;
  /** Type-specific migration version */
  typeMigrationVersion?: string;
  /** Timestamp when the object was created (ISO 8601 format) */
  created_at?: string;
  /** Timestamp when the object was last updated (ISO 8601 format) */
  updated_at?: string;
  /** Username or identifier of the user who created the object */
  created_by?: string;
  /** Username or identifier of the user who last updated the object */
  updated_by?: string;
  /** Whether the object is managed by Kibana (cannot be directly edited) */
  managed?: boolean;
  /** List of space IDs where this object exists (multi-tenancy) */
  namespaces?: string[];
  /** Original ID if this object was copied from another */
  originId?: string;
  /** Error information if the object has issues */
  error?: SavedObjectError;
}

/**
 * Attributes specific to index-pattern saved objects.
 * Defines the structure of data views in Kibana.
 */
export interface IndexPatternAttributes {
  /** Display name of the index pattern */
  title: string;
  /** Internal name identifier */
  name?: string;
  /** Field name to use for time-based data */
  timeFieldName?: string;
  /** Stringified JSON array of field definitions */
  fields?: string;
  /** Stringified JSON object of field attributes */
  fieldAttrs?: string;
  /** Stringified JSON object of field format mappings */
  fieldFormatMap?: string;
  /** Stringified JSON object of runtime field definitions */
  runtimeFieldMap?: string;
  /** Stringified JSON array of source filters */
  sourceFilters?: string;
  /** Whether to allow hidden fields */
  allowHidden?: boolean;
  /** Additional properties that may be present */
  [key: string]: unknown;
}

/**
 * Attributes specific to dashboard saved objects.
 * Contains dashboard layout and configuration.
 */
export interface DashboardAttributes {
  /** Display title of the dashboard */
  title: string;
  /** Human-readable description of the dashboard */
  description?: string;
  /** Stringified JSON array of panel configurations (visualizations on the dashboard) */
  panelsJSON: string;
  /** Stringified JSON object of dashboard-level options (margins, sync settings, etc.) */
  optionsJSON: string;
  /** Dashboard version number */
  version?: number;
  /** Relative time range (e.g., 'now-7d/d') */
  timeFrom?: string;
  /** Relative time range end (e.g., 'now') */
  timeTo?: string;
  /** Whether to restore time range when opening dashboard */
  timeRestore?: boolean;
  /** Refresh interval configuration */
  refreshInterval?: {
    pause: boolean;
    value: number;
  };
  /** Stringified JSON object containing search metadata */
  kibanaSavedObjectMeta?: {
    searchSourceJSON: string;
  };
  /** Control group input for dashboard controls */
  controlGroupInput?: Record<string, unknown>;
  /** Additional properties that may be present */
  [key: string]: unknown;
}

/**
 * Metadata line returned at the end of an export operation.
 * This is the last line in the exported NDJSON file.
 */
export interface ExportMetadata {
  /** Number of objects successfully exported */
  exportedCount: number;
  /** Number of missing references that could not be found */
  missingRefCount: number;
  /** List of missing reference details */
  missingReferences: {
    id: string;
    type: string;
  }[];
  /** List of objects that were excluded from export */
  excludedObjects?: {
    id: string;
    type: string;
    reason: string;
  }[];
  /** Number of excluded objects */
  excludedObjectsCount?: number;
}

/**
 * Error information for a failed import operation.
 */
export interface ImportError {
  /** Type of the saved object that failed to import */
  type: string;
  /** ID of the saved object that failed to import */
  id: string;
  /** Error details */
  error: {
    /** Error type (e.g., 'conflict', 'missing_references', 'unsupported_type') */
    type: string;
    /** Human-readable error reason */
    reason: string;
  };
  /** Additional metadata about the error */
  meta?: {
    /** Title of the object (if available) */
    title?: string;
    /** Icon type (if available) */
    icon?: string;
  };
  /** Whether overwrite was attempted */
  overwrite?: boolean;
}

/**
 * Response from a saved objects import operation.
 * POST /api/saved_objects/_import
 */
export interface ImportResponse {
  /** Whether the import operation was fully successful */
  success: boolean;
  /** Number of objects successfully imported */
  successCount: number;
  /** List of errors encountered during import (only present if success is false) */
  errors?: ImportError[];
  /** List of successfully imported objects with metadata */
  successResults?: {
    type: string;
    id: string;
    meta?: {
      title?: string;
      icon?: string;
    };
    /** New ID if object was created as a copy (createNewCopies=true) */
    destinationId?: string;
    /** Whether the object was overwritten */
    overwrite?: boolean;
  }[];
}

/**
 * Response from a saved objects find/search operation.
 * GET /api/saved_objects/_find
 *
 * @template T The type of attributes in the returned saved objects
 */
export interface FindResponse<T = Record<string, unknown>> {
  /** Array of saved objects matching the search criteria */
  saved_objects: SavedObject<T>[];
  /** Total number of matching objects (across all pages) */
  total: number;
  /** Number of results per page */
  per_page?: number;
  /** Current page number (1-indexed) */
  page?: number;
}

/**
 * Type guard to check if an object is export metadata (last line of export NDJSON).
 *
 * @param obj - Object to check
 * @returns True if the object is ExportMetadata
 */
export function isExportMetadata(obj: unknown): obj is ExportMetadata {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "exportedCount" in obj &&
    typeof (obj as ExportMetadata).exportedCount === "number"
  );
}

/**
 * Type guard to check if a saved object is a dashboard.
 *
 * @param obj - Saved object to check
 * @returns True if the saved object is a dashboard
 */
export function isDashboard(
  obj: SavedObject,
): obj is SavedObject<DashboardAttributes> {
  return obj.type === "dashboard";
}

/**
 * Type guard to check if a saved object is an index pattern.
 *
 * @param obj - Saved object to check
 * @returns True if the saved object is an index pattern
 */
export function isIndexPattern(
  obj: SavedObject,
): obj is SavedObject<IndexPatternAttributes> {
  return obj.type === "index-pattern";
}

/**
 * Union type of all saved objects we handle in this application.
 * Use this with type guards to narrow to specific types.
 */
export type KibanaSavedObject =
  | SavedObject<DashboardAttributes>
  | SavedObject<IndexPatternAttributes>
  | SavedObject; // Fallback for other types (lens, visualization, etc.)
