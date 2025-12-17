import { describe, it, expect } from 'vitest';
import type {
  SavedObject,
  DashboardAttributes,
  IndexPatternAttributes,
  ExportMetadata,
  ImportResponse,
  FindResponse,
} from './kibana-saved-objects';
import { isExportMetadata, isDashboard, isIndexPattern } from './kibana-saved-objects';

describe('Kibana Saved Objects Types', () => {
  describe('Type Guards', () => {
    describe('isExportMetadata', () => {
      it('should return true for valid export metadata', () => {
        const metadata: ExportMetadata = {
          exportedCount: 5,
          missingRefCount: 0,
          missingReferences: [],
        };

        expect(isExportMetadata(metadata)).toBe(true);
      });

      it('should return false for saved object', () => {
        const savedObject: SavedObject = {
          id: 'test-id',
          type: 'dashboard',
          attributes: { title: 'Test' },
        };

        expect(isExportMetadata(savedObject)).toBe(false);
      });

      it('should return false for null', () => {
        expect(isExportMetadata(null)).toBe(false);
      });

      it('should return false for undefined', () => {
        expect(isExportMetadata(undefined)).toBe(false);
      });

      it('should return false for non-object values', () => {
        expect(isExportMetadata('string')).toBe(false);
        expect(isExportMetadata(123)).toBe(false);
        expect(isExportMetadata(true)).toBe(false);
      });

      it('should return false for object without exportedCount', () => {
        expect(isExportMetadata({ foo: 'bar' })).toBe(false);
      });
    });

    describe('isDashboard', () => {
      it('should return true for dashboard saved object', () => {
        const dashboard: SavedObject<DashboardAttributes> = {
          id: 'dashboard-1',
          type: 'dashboard',
          attributes: {
            title: 'My Dashboard',
            panelsJSON: '[]',
            optionsJSON: '{}',
          },
        };

        expect(isDashboard(dashboard)).toBe(true);
      });

      it('should return false for non-dashboard saved object', () => {
        const indexPattern: SavedObject<IndexPatternAttributes> = {
          id: 'index-pattern-1',
          type: 'index-pattern',
          attributes: {
            title: 'my-index-*',
          },
        };

        expect(isDashboard(indexPattern)).toBe(false);
      });
    });

    describe('isIndexPattern', () => {
      it('should return true for index-pattern saved object', () => {
        const indexPattern: SavedObject<IndexPatternAttributes> = {
          id: 'index-pattern-1',
          type: 'index-pattern',
          attributes: {
            title: 'my-index-*',
            timeFieldName: '@timestamp',
          },
        };

        expect(isIndexPattern(indexPattern)).toBe(true);
      });

      it('should return false for non-index-pattern saved object', () => {
        const dashboard: SavedObject<DashboardAttributes> = {
          id: 'dashboard-1',
          type: 'dashboard',
          attributes: {
            title: 'My Dashboard',
            panelsJSON: '[]',
            optionsJSON: '{}',
          },
        };

        expect(isIndexPattern(dashboard)).toBe(false);
      });
    });
  });

  describe('Type Narrowing', () => {
    it('should narrow SavedObject type using isDashboard', () => {
      const obj: SavedObject = {
        id: 'test',
        type: 'dashboard',
        attributes: {
          title: 'Test Dashboard',
          panelsJSON: '[]',
          optionsJSON: '{}',
        },
      };

      if (isDashboard(obj)) {
        // TypeScript should know obj.attributes has DashboardAttributes
        expect(obj.attributes.title).toBe('Test Dashboard');
        expect(obj.attributes.panelsJSON).toBe('[]');
      } else {
        expect.fail('Should have identified as dashboard');
      }
    });

    it('should narrow SavedObject type using isIndexPattern', () => {
      const obj: SavedObject = {
        id: 'test',
        type: 'index-pattern',
        attributes: {
          title: 'my-index-*',
          timeFieldName: '@timestamp',
        },
      };

      if (isIndexPattern(obj)) {
        // TypeScript should know obj.attributes has IndexPatternAttributes
        expect(obj.attributes.title).toBe('my-index-*');
        expect(obj.attributes.timeFieldName).toBe('@timestamp');
      } else {
        expect.fail('Should have identified as index-pattern');
      }
    });
  });

  describe('API Response Types', () => {
    describe('ImportResponse', () => {
      it('should accept successful import response', () => {
        const response: ImportResponse = {
          success: true,
          successCount: 3,
          successResults: [
            {
              type: 'dashboard',
              id: 'dashboard-1',
              meta: { title: 'My Dashboard' },
            },
          ],
        };

        expect(response.success).toBe(true);
        expect(response.successCount).toBe(3);
      });

      it('should accept failed import response with errors', () => {
        const response: ImportResponse = {
          success: false,
          successCount: 0,
          errors: [
            {
              type: 'dashboard',
              id: 'dashboard-1',
              error: {
                type: 'conflict',
                reason: 'Object already exists',
              },
            },
          ],
        };

        expect(response.success).toBe(false);
        expect(response.errors).toHaveLength(1);
        expect(response.errors?.[0]?.error.type).toBe('conflict');
      });
    });

    describe('FindResponse', () => {
      it('should accept find response with dashboards', () => {
        const response: FindResponse<DashboardAttributes> = {
          saved_objects: [
            {
              id: 'dashboard-1',
              type: 'dashboard',
              attributes: {
                title: 'Dashboard 1',
                panelsJSON: '[]',
                optionsJSON: '{}',
              },
            },
          ],
          total: 1,
          per_page: 20,
          page: 1,
        };

        expect(response.saved_objects).toHaveLength(1);
        expect(response.total).toBe(1);
        expect(response.saved_objects[0]?.attributes.title).toBe('Dashboard 1');
      });
    });

    describe('ExportMetadata', () => {
      it('should accept export metadata with all fields', () => {
        const metadata: ExportMetadata = {
          exportedCount: 5,
          missingRefCount: 2,
          missingReferences: [
            { id: 'ref-1', type: 'index-pattern' },
            { id: 'ref-2', type: 'visualization' },
          ],
          excludedObjects: [
            {
              id: 'excluded-1',
              type: 'dashboard',
              reason: 'Not exportable',
            },
          ],
          excludedObjectsCount: 1,
        };

        expect(metadata.exportedCount).toBe(5);
        expect(metadata.missingReferences).toHaveLength(2);
        expect(metadata.excludedObjects).toHaveLength(1);
      });

      it('should accept minimal export metadata', () => {
        const metadata: ExportMetadata = {
          exportedCount: 3,
          missingRefCount: 0,
          missingReferences: [],
        };

        expect(metadata.exportedCount).toBe(3);
        expect(metadata.missingRefCount).toBe(0);
      });
    });
  });

  describe('SavedObject Structure', () => {
    it('should accept saved object with all optional fields', () => {
      const savedObject: SavedObject<DashboardAttributes> = {
        id: 'dashboard-1',
        type: 'dashboard',
        attributes: {
          title: 'Complete Dashboard',
          panelsJSON: '[]',
          optionsJSON: '{}',
          description: 'A test dashboard',
          version: 1,
        },
        references: [
          {
            id: 'index-pattern-1',
            name: 'kibanaSavedObjectMeta.searchSourceJSON.index',
            type: 'index-pattern',
          },
        ],
        version: 'WzEsMV0=',
        coreMigrationVersion: '8.8.0',
        typeMigrationVersion: '10.3.0',
        created_at: '2023-01-01T00:00:00.000Z',
        updated_at: '2023-01-02T00:00:00.000Z',
        created_by: 'user1',
        updated_by: 'user2',
        managed: false,
      };

      expect(savedObject.id).toBe('dashboard-1');
      expect(savedObject.references).toHaveLength(1);
      expect(savedObject.created_at).toBe('2023-01-01T00:00:00.000Z');
    });

    it('should accept saved object with minimal fields', () => {
      const savedObject: SavedObject = {
        id: 'minimal-1',
        type: 'visualization',
        attributes: {},
      };

      expect(savedObject.id).toBe('minimal-1');
      expect(savedObject.type).toBe('visualization');
    });
  });
});
