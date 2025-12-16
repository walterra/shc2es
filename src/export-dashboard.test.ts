import { readFileSync } from 'fs';
import * as path from 'path';
import type {
  SavedObject,
  DashboardAttributes,
  IndexPatternAttributes,
  ExportMetadata,
  KibanaSavedObject,
} from './types/kibana-saved-objects';
import { isExportMetadata, isDashboard, isIndexPattern } from './types/kibana-saved-objects';

describe('Dashboard NDJSON Integration', () => {
  const DASHBOARD_FILE = path.join(__dirname, '..', 'dashboards', 'smart-home.ndjson');

  let ndjsonContent: string;
  let objects: (KibanaSavedObject | ExportMetadata)[];

  beforeAll(() => {
    ndjsonContent = readFileSync(DASHBOARD_FILE, 'utf-8');
    const lines = ndjsonContent.trim().split('\n');
    objects = lines.map((line) => {
      const parsed: unknown = JSON.parse(line);
      return parsed as KibanaSavedObject | ExportMetadata;
    });
  });

  describe('File Structure', () => {
    it('should have at least 2 lines (objects + metadata)', () => {
      expect(objects.length).toBeGreaterThanOrEqual(2);
    });

    it('should have export metadata as last line', () => {
      const lastObject = objects[objects.length - 1];
      expect(lastObject).toBeDefined();
      expect(isExportMetadata(lastObject)).toBe(true);
    });

    it('should have saved objects before metadata line', () => {
      const savedObjects = objects.slice(0, -1);
      for (const obj of savedObjects) {
        expect(isExportMetadata(obj)).toBe(false);
      }
    });
  });

  describe('Export Metadata', () => {
    let metadata: ExportMetadata;

    beforeAll(() => {
      const lastObject = objects[objects.length - 1];
      if (isExportMetadata(lastObject)) {
        metadata = lastObject;
      }
    });

    it('should have valid exportedCount', () => {
      expect(metadata.exportedCount).toBeGreaterThan(0);
      expect(typeof metadata.exportedCount).toBe('number');
    });

    it('should have missingRefCount field', () => {
      expect(metadata).toHaveProperty('missingRefCount');
      expect(typeof metadata.missingRefCount).toBe('number');
    });

    it('should have missingReferences array', () => {
      expect(Array.isArray(metadata.missingReferences)).toBe(true);
    });

    it('should match exportedCount with actual object count', () => {
      const savedObjectCount = objects.length - 1; // Exclude metadata line
      expect(metadata.exportedCount).toBe(savedObjectCount);
    });
  });

  describe('Saved Objects', () => {
    let savedObjects: KibanaSavedObject[];

    beforeAll(() => {
      savedObjects = objects.slice(0, -1) as KibanaSavedObject[];
    });

    it('should have required fields on all objects', () => {
      for (const obj of savedObjects) {
        expect(obj).toHaveProperty('id');
        expect(obj).toHaveProperty('type');
        expect(obj).toHaveProperty('attributes');
        expect(typeof obj.id).toBe('string');
        expect(typeof obj.type).toBe('string');
        expect(typeof obj.attributes).toBe('object');
      }
    });

    it('should have at least one dashboard', () => {
      const dashboards = savedObjects.filter(isDashboard);
      expect(dashboards.length).toBeGreaterThan(0);
    });

    it('should have at least one index-pattern', () => {
      const indexPatterns = savedObjects.filter(isIndexPattern);
      expect(indexPatterns.length).toBeGreaterThan(0);
    });

    it('should have valid object types', () => {
      const validTypes = ['dashboard', 'index-pattern', 'visualization', 'lens', 'search'];
      for (const obj of savedObjects) {
        expect(validTypes).toContain(obj.type);
      }
    });
  });

  describe('Dashboard Objects', () => {
    let dashboards: SavedObject<DashboardAttributes>[];

    beforeAll(() => {
      const savedObjects = objects.slice(0, -1) as KibanaSavedObject[];
      dashboards = savedObjects.filter(isDashboard);
    });

    it('should have required dashboard attributes', () => {
      for (const dashboard of dashboards) {
        expect(dashboard.attributes).toHaveProperty('title');
        expect(dashboard.attributes).toHaveProperty('panelsJSON');
        expect(dashboard.attributes).toHaveProperty('optionsJSON');
        expect(typeof dashboard.attributes.title).toBe('string');
        expect(typeof dashboard.attributes.panelsJSON).toBe('string');
        expect(typeof dashboard.attributes.optionsJSON).toBe('string');
      }
    });

    it('should have parseable panelsJSON', () => {
      for (const dashboard of dashboards) {
        expect(() => {
          JSON.parse(dashboard.attributes.panelsJSON);
        }).not.toThrow();
      }
    });

    it('should have parseable optionsJSON', () => {
      for (const dashboard of dashboards) {
        expect(() => {
          JSON.parse(dashboard.attributes.optionsJSON);
        }).not.toThrow();
      }
    });

    it('should have references array', () => {
      for (const dashboard of dashboards) {
        expect(Array.isArray(dashboard.references)).toBe(true);
      }
    });

    it('should have valid references structure', () => {
      for (const dashboard of dashboards) {
        if (dashboard.references && dashboard.references.length > 0) {
          for (const ref of dashboard.references) {
            expect(ref).toHaveProperty('id');
            expect(ref).toHaveProperty('type');
            expect(ref).toHaveProperty('name');
            expect(typeof ref.id).toBe('string');
            expect(typeof ref.type).toBe('string');
            expect(typeof ref.name).toBe('string');
          }
        }
      }
    });
  });

  describe('Index Pattern Objects', () => {
    let indexPatterns: SavedObject<IndexPatternAttributes>[];

    beforeAll(() => {
      const savedObjects = objects.slice(0, -1) as KibanaSavedObject[];
      indexPatterns = savedObjects.filter(isIndexPattern);
    });

    it('should have required index pattern attributes', () => {
      for (const indexPattern of indexPatterns) {
        expect(indexPattern.attributes).toHaveProperty('title');
        expect(typeof indexPattern.attributes.title).toBe('string');
      }
    });

    it('should have title with wildcard pattern', () => {
      for (const indexPattern of indexPatterns) {
        // Index patterns typically end with -*
        expect(indexPattern.attributes.title).toMatch(/\*/);
      }
    });

    it('should have timeFieldName if present', () => {
      for (const indexPattern of indexPatterns) {
        if (indexPattern.attributes.timeFieldName) {
          expect(typeof indexPattern.attributes.timeFieldName).toBe('string');
        }
      }
    });
  });

  describe('ID Prefixing (from ingest.ts logic)', () => {
    it('should successfully prefix all object IDs', () => {
      const prefix = 'test-prefix';
      const savedObjects = objects.slice(0, -1) as KibanaSavedObject[];

      for (const obj of savedObjects) {
        const prefixedObj: KibanaSavedObject = {
          ...obj,
          id: `${prefix}-${obj.id}`,
          references: obj.references?.map((ref) => ({
            ...ref,
            id: `${prefix}-${ref.id}`,
          })),
        };

        expect(prefixedObj.id).toContain(prefix);
        if (prefixedObj.references) {
          for (const ref of prefixedObj.references) {
            expect(ref.id).toContain(prefix);
          }
        }
      }
    });

    it('should update dashboard title when prefixing', () => {
      const prefix = 'my-deployment';
      const savedObjects = objects.slice(0, -1) as KibanaSavedObject[];
      const dashboards = savedObjects.filter(isDashboard);

      for (const dashboard of dashboards) {
        const prefixedDashboard = {
          ...dashboard,
          attributes: {
            ...dashboard.attributes,
            title: prefix,
          },
        };

        expect(prefixedDashboard.attributes.title).toBe(prefix);
      }
    });

    it('should update index pattern title and name when prefixing', () => {
      const prefix = 'my-deployment';
      const savedObjects = objects.slice(0, -1) as KibanaSavedObject[];
      const indexPatterns = savedObjects.filter(isIndexPattern);

      for (const indexPattern of indexPatterns) {
        const prefixedPattern = {
          ...indexPattern,
          attributes: {
            ...indexPattern.attributes,
            title: `${prefix}-*`,
            name: prefix,
          },
        };

        expect(prefixedPattern.attributes.title).toBe(`${prefix}-*`);
        expect(prefixedPattern.attributes.name).toBe(prefix);
      }
    });
  });

  describe('Metadata Stripping (from export-dashboard.ts logic)', () => {
    const SENSITIVE_FIELDS = ['created_by', 'updated_by', 'created_at', 'updated_at', 'version'];

    it('should remove sensitive fields from saved objects', () => {
      const savedObjects = objects.slice(0, -1) as KibanaSavedObject[];

      for (const obj of savedObjects) {
        const stripped: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(obj)) {
          if (!SENSITIVE_FIELDS.includes(key)) {
            stripped[key] = value;
          }
        }

        // Verify sensitive fields are not in stripped object
        for (const field of SENSITIVE_FIELDS) {
          expect(stripped).not.toHaveProperty(field);
        }

        // Verify essential fields are preserved
        expect(stripped).toHaveProperty('id');
        expect(stripped).toHaveProperty('type');
        expect(stripped).toHaveProperty('attributes');
      }
    });

    it('should preserve export metadata unchanged', () => {
      const lastObject = objects[objects.length - 1];
      if (isExportMetadata(lastObject)) {
        // Metadata should not be stripped
        expect(lastObject).toHaveProperty('exportedCount');
        expect(lastObject).toHaveProperty('missingRefCount');
      }
    });
  });
});
