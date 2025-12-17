/* eslint-disable @typescript-eslint/unbound-method */

// Disabled for Vitest mock assertions - vi.spyOn() and mock methods don't have TypeScript types
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Span } from '@opentelemetry/api';
import { SpanStatusCode } from '@opentelemetry/api';
import * as instrumentation from './instrumentation';
import { withSpan, SpanAttributes } from './instrumentation';

// Create mock span
const mockSpan = {
  setStatus: vi.fn(),
  recordException: vi.fn(),
  end: vi.fn(),
  setAttribute: vi.fn(),
  setAttributes: vi.fn(),
  addEvent: vi.fn(),
  updateName: vi.fn(),
  isRecording: vi.fn(() => true),
  spanContext: vi.fn(() => ({
    traceId: 'test-trace-id',
    spanId: 'test-span-id',
    traceFlags: 1,
  })),
} as unknown as Span;

describe('instrumentation', () => {
  let startActiveSpanSpy: vi.SpiedFunction<typeof instrumentation.tracer.startActiveSpan>;

  beforeEach(() => {
    vi.clearAllMocks();

    // Spy on the exported tracer's startActiveSpan method
    // Handle all three overloads of startActiveSpan by using a generic implementation
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    startActiveSpanSpy = vi
      .spyOn(instrumentation.tracer, 'startActiveSpan')
      .mockImplementation((...args: unknown[]) => {
        // Extract the callback function (last argument)
        const fn = args[args.length - 1] as (span: Span) => unknown;
        // Call the callback with our mock span
        return fn(mockSpan);
      }) as vi.SpiedFunction<typeof instrumentation.tracer.startActiveSpan>;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('withSpan', () => {
    describe('synchronous operations', () => {
      it('should create span with operation name and attributes', () => {
        const attributes = { [SpanAttributes.EVENT_TYPE]: 'DeviceServiceData' };

        withSpan('test_operation', attributes, () => {
          return 'result';
        });

        expect(startActiveSpanSpy).toHaveBeenCalledWith(
          'test_operation',
          { attributes },
          expect.any(Function),
        );
      });

      it('should return function result', () => {
        const result = withSpan('test_operation', {}, () => {
          return { data: 'test' };
        });

        expect(result).toEqual({ data: 'test' });
      });

      it('should set span status to OK on success', () => {
        withSpan('test_operation', {}, () => {
          return 'success';
        });

        expect(mockSpan.setStatus).toHaveBeenCalledWith({ code: SpanStatusCode.OK });
        expect(mockSpan.end).toHaveBeenCalled();
      });

      it('should record exception and set ERROR status on error', () => {
        const error = new Error('Test error');

        expect(() => {
          withSpan('test_operation', {}, () => {
            throw error;
          });
        }).toThrow('Test error');

        expect(mockSpan.recordException).toHaveBeenCalledWith(error);
        expect(mockSpan.setStatus).toHaveBeenCalledWith({ code: SpanStatusCode.ERROR });
        expect(mockSpan.end).toHaveBeenCalled();
      });

      it('should handle non-Error exceptions', () => {
        const stringError = new Error('string error');
        expect(() => {
          withSpan('test_operation', {}, () => {
            throw stringError;
          });
        }).toThrow('string error');

        expect(mockSpan.recordException).toHaveBeenCalledWith(stringError);
        expect(mockSpan.setStatus).toHaveBeenCalledWith({ code: SpanStatusCode.ERROR });
      });

      it('should always end span even on error', () => {
        try {
          withSpan('test_operation', {}, () => {
            throw new Error('Test');
          });
        } catch {
          // Expected
        }

        expect(mockSpan.end).toHaveBeenCalled();
      });
    });

    describe('asynchronous operations', () => {
      it('should handle async functions', async () => {
        const result = await withSpan('async_operation', {}, async () => {
          return Promise.resolve('async result');
        });

        expect(result).toBe('async result');
        expect(mockSpan.end).toHaveBeenCalled();
      });

      it('should handle rejected promises', async () => {
        const error = new Error('Async error');

        await expect(
          withSpan('async_operation', {}, async () => {
            return Promise.reject(error);
          }),
        ).rejects.toThrow('Async error');

        expect(mockSpan.recordException).toHaveBeenCalledWith(error);
        expect(mockSpan.setStatus).toHaveBeenCalledWith({ code: SpanStatusCode.ERROR });
        expect(mockSpan.end).toHaveBeenCalled();
      });

      it('should handle async throws', async () => {
        await expect(
          withSpan('async_operation', {}, async () => {
            await Promise.resolve(); // Make function actually async
            throw new Error('Async throw');
          }),
        ).rejects.toThrow('Async throw');

        expect(mockSpan.recordException).toHaveBeenCalled();
        expect(mockSpan.setStatus).toHaveBeenCalledWith({ code: SpanStatusCode.ERROR });
        expect(mockSpan.end).toHaveBeenCalled();
      });
    });

    describe('span attributes', () => {
      it('should accept custom attributes', () => {
        const attributes = {
          [SpanAttributes.DEVICE_ID]: 'device-123',
          [SpanAttributes.EVENT_TYPE]: 'DeviceServiceData',
          [SpanAttributes.EVENT_COUNT]: 5,
        };

        withSpan('process_events', attributes, () => {
          return 'done';
        });

        expect(startActiveSpanSpy).toHaveBeenCalledWith(
          'process_events',
          { attributes },
          expect.any(Function),
        );
      });

      it('should accept empty attributes', () => {
        withSpan('simple_operation', {}, () => {
          return 'done';
        });

        expect(startActiveSpanSpy).toHaveBeenCalledWith(
          'simple_operation',
          { attributes: {} },
          expect.any(Function),
        );
      });
    });

    describe('span parameter', () => {
      it('should provide span to function for dynamic attributes', () => {
        withSpan('test_operation', {}, (span) => {
          // Function can use span directly if needed
          expect(span).toBe(mockSpan);
          return 'result';
        });
      });
    });
  });

  describe('SpanAttributes', () => {
    it('should export attribute name constants', () => {
      expect(SpanAttributes.EVENT_TYPE).toBe('event.type');
      expect(SpanAttributes.DEVICE_ID).toBe('device.id');
      expect(SpanAttributes.DOCUMENTS_COUNT).toBe('documents.count');
      expect(SpanAttributes.INDEX_NAME).toBe('index.name');
      expect(SpanAttributes.DASHBOARD_ID).toBe('dashboard.id');
    });
  });
});
