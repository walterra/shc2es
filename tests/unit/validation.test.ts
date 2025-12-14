/**
 * Unit tests for validation module
 */

import * as fs from "fs";
import * as path from "path";
import { createTempDir, cleanupTempDir } from "../utils/test-helpers";
import {
  ValidationError,
  validateRequired,
  validateUrl,
  validateFilePath,
  validateBoolean,
  validateLogLevel,
  validatePollConfig,
  validateIngestConfig,
  validateRegistryConfig,
  validateDashboardConfig,
} from "../../src/validation";

describe("validation module", () => {
  let tempDir: string;
  let testFilePath: string;

  beforeAll(() => {
    tempDir = createTempDir("validation-test-");
    testFilePath = path.join(tempDir, "test-file.txt");
    fs.writeFileSync(testFilePath, "test content");
  });

  afterAll(() => {
    cleanupTempDir(tempDir);
  });

  describe("ValidationError", () => {
    it("should create error with message and variable name", () => {
      const error = new ValidationError("test message", "TEST_VAR");
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe("test message");
      expect(error.variable).toBe("TEST_VAR");
      expect(error.name).toBe("ValidationError");
    });
  });

  describe("validateRequired", () => {
    it("should return value when set", () => {
      expect(validateRequired("TEST", "value")).toBe("value");
    });

    it("should throw when undefined", () => {
      expect(() => validateRequired("TEST", undefined)).toThrow(
        ValidationError,
      );
      expect(() => validateRequired("TEST", undefined)).toThrow(/TEST is required/);
    });

    it("should throw when empty string", () => {
      expect(() => validateRequired("TEST", "")).toThrow(ValidationError);
      expect(() => validateRequired("TEST", "   ")).toThrow(ValidationError);
    });

    it("should include env file hint in error message", () => {
      try {
        validateRequired("TEST", undefined);
        fail("Should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(ValidationError);
        expect((err as Error).message).toMatch(/Set it in/);
      }
    });
  });

  describe("validateUrl", () => {
    it("should validate valid HTTP URLs", () => {
      expect(validateUrl("TEST", "http://localhost:9200")).toBe(
        "http://localhost:9200",
      );
    });

    it("should validate valid HTTPS URLs", () => {
      expect(validateUrl("TEST", "https://example.com:443")).toBe(
        "https://example.com:443",
      );
    });

    it("should trim whitespace", () => {
      expect(validateUrl("TEST", "  https://example.com  ")).toBe(
        "https://example.com",
      );
    });

    it("should throw when missing protocol", () => {
      expect(() => validateUrl("TEST", "localhost:9200")).toThrow(
        ValidationError,
      );
      expect(() => validateUrl("TEST", "localhost:9200")).toThrow(
        /must start with http/,
      );
    });

    it("should throw when invalid URL", () => {
      expect(() => validateUrl("TEST", "http://")).toThrow(ValidationError);
    });

    it("should throw when trailing slash in path", () => {
      expect(() => validateUrl("TEST", "http://localhost:9200/path/")).toThrow(
        ValidationError,
      );
      expect(() => validateUrl("TEST", "http://localhost:9200/path/")).toThrow(
        /trailing slash/,
      );
    });

    it("should allow trailing slash on root", () => {
      expect(validateUrl("TEST", "http://localhost:9200/")).toBe(
        "http://localhost:9200/",
      );
    });

    it("should return undefined when not required and empty", () => {
      expect(validateUrl("TEST", "", { required: false })).toBeUndefined();
      expect(validateUrl("TEST", undefined, { required: false })).toBeUndefined();
    });

    it("should throw when required and empty", () => {
      expect(() => validateUrl("TEST", "", { required: true })).toThrow(
        ValidationError,
      );
    });
  });

  describe("validateFilePath", () => {
    it("should validate existing file path", () => {
      expect(validateFilePath("TEST", testFilePath)).toBe(testFilePath);
    });

    it("should throw when file does not exist", () => {
      const nonExistent = path.join(tempDir, "nonexistent.txt");
      expect(() => validateFilePath("TEST", nonExistent)).toThrow(
        ValidationError,
      );
      expect(() => validateFilePath("TEST", nonExistent)).toThrow(/not found/);
    });

    it("should return undefined when not required and empty", () => {
      expect(
        validateFilePath("TEST", "", { required: false }),
      ).toBeUndefined();
      expect(
        validateFilePath("TEST", undefined, { required: false }),
      ).toBeUndefined();
    });

    it("should throw when required and empty", () => {
      expect(() => validateFilePath("TEST", "", { required: true })).toThrow(
        ValidationError,
      );
    });

    it("should include file path in error message", () => {
      const nonExistent = path.join(tempDir, "nonexistent.txt");
      try {
        validateFilePath("TEST", nonExistent);
        fail("Should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(ValidationError);
        expect((err as Error).message).toContain(nonExistent);
      }
    });
  });

  describe("validateBoolean", () => {
    it("should parse 'true' as true", () => {
      expect(validateBoolean("TEST", "true")).toBe(true);
      expect(validateBoolean("TEST", "TRUE")).toBe(true);
      expect(validateBoolean("TEST", "  true  ")).toBe(true);
    });

    it("should parse '1' and 'yes' as true", () => {
      expect(validateBoolean("TEST", "1")).toBe(true);
      expect(validateBoolean("TEST", "yes")).toBe(true);
    });

    it("should parse 'false' as false", () => {
      expect(validateBoolean("TEST", "false")).toBe(false);
      expect(validateBoolean("TEST", "FALSE")).toBe(false);
      expect(validateBoolean("TEST", "  false  ")).toBe(false);
    });

    it("should parse '0' and 'no' as false", () => {
      expect(validateBoolean("TEST", "0")).toBe(false);
      expect(validateBoolean("TEST", "no")).toBe(false);
    });

    it("should return default when empty", () => {
      expect(validateBoolean("TEST", "", false)).toBe(false);
      expect(validateBoolean("TEST", undefined, true)).toBe(true);
    });

    it("should throw on invalid value", () => {
      expect(() => validateBoolean("TEST", "invalid")).toThrow(
        ValidationError,
      );
      expect(() => validateBoolean("TEST", "invalid")).toThrow(
        /must be 'true' or 'false'/,
      );
    });
  });

  describe("validateLogLevel", () => {
    it("should validate valid log levels", () => {
      expect(validateLogLevel("TEST", "debug")).toBe("debug");
      expect(validateLogLevel("TEST", "info")).toBe("info");
      expect(validateLogLevel("TEST", "warn")).toBe("warn");
      expect(validateLogLevel("TEST", "error")).toBe("error");
      expect(validateLogLevel("TEST", "fatal")).toBe("fatal");
      expect(validateLogLevel("TEST", "trace")).toBe("trace");
    });

    it("should normalize case", () => {
      expect(validateLogLevel("TEST", "DEBUG")).toBe("debug");
      expect(validateLogLevel("TEST", "INFO")).toBe("info");
    });

    it("should trim whitespace", () => {
      expect(validateLogLevel("TEST", "  info  ")).toBe("info");
    });

    it("should return default when empty", () => {
      expect(validateLogLevel("TEST", "", "warn")).toBe("warn");
      expect(validateLogLevel("TEST", undefined, "error")).toBe("error");
    });

    it("should throw on invalid level", () => {
      expect(() => validateLogLevel("TEST", "invalid")).toThrow(
        ValidationError,
      );
      expect(() => validateLogLevel("TEST", "invalid")).toThrow(/must be one of/);
    });
  });

  describe("validatePollConfig", () => {
    const originalEnv = process.env;

    beforeEach(() => {
      jest.resetModules();
      process.env = {};
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it("should validate complete poll config", () => {
      process.env.BSH_HOST = "192.168.1.100";
      process.env.BSH_PASSWORD = "password123";
      process.env.BSH_CLIENT_NAME = "custom-client";
      process.env.BSH_CLIENT_ID = "custom-id";
      process.env.LOG_LEVEL = "debug";

      const config = validatePollConfig();

      expect(config.bshHost).toBe("192.168.1.100");
      expect(config.bshPassword).toBe("password123");
      expect(config.bshClientName).toBe("custom-client");
      expect(config.bshClientId).toBe("custom-id");
      expect(config.logLevel).toBe("debug");
    });

    it("should use defaults for optional values", () => {
      process.env.BSH_HOST = "192.168.1.100";
      process.env.BSH_PASSWORD = "password123";

      const config = validatePollConfig();

      expect(config.bshClientName).toBe("oss_bosch_smart_home_poll");
      expect(config.bshClientId).toBe("oss_bosch_smart_home_poll_client");
      expect(config.logLevel).toBe("info");
    });

    it("should throw when BSH_HOST is missing", () => {
      process.env.BSH_PASSWORD = "password123";

      expect(() => validatePollConfig()).toThrow(ValidationError);
      expect(() => validatePollConfig()).toThrow(/BSH_HOST is required/);
    });

    it("should throw when BSH_PASSWORD is missing", () => {
      process.env.BSH_HOST = "192.168.1.100";

      expect(() => validatePollConfig()).toThrow(ValidationError);
      expect(() => validatePollConfig()).toThrow(/BSH_PASSWORD is required/);
    });
  });

  describe("validateIngestConfig", () => {
    const originalEnv = process.env;

    beforeEach(() => {
      jest.resetModules();
      process.env = {};
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it("should validate complete ingest config", () => {
      process.env.ES_NODE = "https://localhost:9200";
      process.env.ES_PASSWORD = "elastic123";
      process.env.ES_USER = "admin";
      process.env.ES_CA_CERT = testFilePath;
      process.env.ES_TLS_VERIFY = "false";
      process.env.ES_INDEX_PREFIX = "custom-events";
      process.env.KIBANA_NODE = "https://localhost:5601";

      const config = validateIngestConfig();

      expect(config.esNode).toBe("https://localhost:9200");
      expect(config.esPassword).toBe("elastic123");
      expect(config.esUser).toBe("admin");
      expect(config.esCaCert).toBe(testFilePath);
      expect(config.esTlsVerify).toBe(false);
      expect(config.esIndexPrefix).toBe("custom-events");
      expect(config.kibanaNode).toBe("https://localhost:5601");
    });

    it("should use defaults for optional values", () => {
      process.env.ES_NODE = "https://localhost:9200";
      process.env.ES_PASSWORD = "elastic123";
      // Explicitly unset optional vars
      delete process.env.ES_USER;
      delete process.env.ES_CA_CERT;
      delete process.env.ES_TLS_VERIFY;
      delete process.env.ES_INDEX_PREFIX;
      delete process.env.KIBANA_NODE;

      const config = validateIngestConfig();

      expect(config.esUser).toBe("elastic");
      expect(config.esCaCert).toBeUndefined();
      expect(config.esTlsVerify).toBe(true);
      expect(config.esIndexPrefix).toBe("smart-home-events");
      expect(config.kibanaNode).toBeUndefined();
    });

    it("should throw when ES_NODE is missing", () => {
      process.env.ES_PASSWORD = "elastic123";

      expect(() => validateIngestConfig()).toThrow(ValidationError);
      expect(() => validateIngestConfig()).toThrow(/ES_NODE is required/);
    });

    it("should throw when ES_NODE is invalid URL", () => {
      process.env.ES_NODE = "not-a-url";
      process.env.ES_PASSWORD = "elastic123";

      expect(() => validateIngestConfig()).toThrow(ValidationError);
      expect(() => validateIngestConfig()).toThrow(/ES_NODE/);
    });

    it("should throw when ES_CA_CERT file does not exist", () => {
      process.env.ES_NODE = "https://localhost:9200";
      process.env.ES_PASSWORD = "elastic123";
      process.env.ES_CA_CERT = "/nonexistent/file.pem";

      expect(() => validateIngestConfig()).toThrow(ValidationError);
      expect(() => validateIngestConfig()).toThrow(/ES_CA_CERT/);
    });

    it("should require KIBANA_NODE when requireKibana is true", () => {
      process.env.ES_NODE = "https://localhost:9200";
      process.env.ES_PASSWORD = "elastic123";

      expect(() => validateIngestConfig({ requireKibana: true })).toThrow(
        ValidationError,
      );
      expect(() => validateIngestConfig({ requireKibana: true })).toThrow(
        /KIBANA_NODE is required/,
      );
    });
  });

  describe("validateRegistryConfig", () => {
    const originalEnv = process.env;

    beforeEach(() => {
      jest.resetModules();
      process.env = {};
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it("should validate registry config", () => {
      process.env.BSH_HOST = "192.168.1.100";

      const config = validateRegistryConfig();

      expect(config.bshHost).toBe("192.168.1.100");
    });

    it("should throw when BSH_HOST is missing", () => {
      expect(() => validateRegistryConfig()).toThrow(ValidationError);
      expect(() => validateRegistryConfig()).toThrow(/BSH_HOST is required/);
    });
  });

  describe("validateDashboardConfig", () => {
    const originalEnv = process.env;

    beforeEach(() => {
      jest.resetModules();
      process.env = {};
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it("should validate complete dashboard config", () => {
      process.env.KIBANA_NODE = "https://localhost:5601";
      process.env.ES_PASSWORD = "elastic123";
      process.env.ES_USER = "admin";
      process.env.ES_CA_CERT = testFilePath;
      process.env.ES_TLS_VERIFY = "false";

      const config = validateDashboardConfig();

      expect(config.kibanaNode).toBe("https://localhost:5601");
      expect(config.esPassword).toBe("elastic123");
      expect(config.esUser).toBe("admin");
      expect(config.esCaCert).toBe(testFilePath);
      expect(config.esTlsVerify).toBe(false);
    });

    it("should throw when KIBANA_NODE is missing", () => {
      process.env.ES_PASSWORD = "elastic123";

      expect(() => validateDashboardConfig()).toThrow(ValidationError);
      expect(() => validateDashboardConfig()).toThrow(/KIBANA_NODE is required/);
    });

    it("should throw when KIBANA_NODE is invalid URL", () => {
      process.env.KIBANA_NODE = "not-a-url";
      process.env.ES_PASSWORD = "elastic123";

      expect(() => validateDashboardConfig()).toThrow(ValidationError);
      expect(() => validateDashboardConfig()).toThrow(/KIBANA_NODE/);
    });

    it("should throw when ES_PASSWORD is missing", () => {
      process.env.KIBANA_NODE = "https://localhost:5601";

      expect(() => validateDashboardConfig()).toThrow(ValidationError);
      expect(() => validateDashboardConfig()).toThrow(/ES_PASSWORD is required/);
    });
  });
});
