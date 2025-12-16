/**
 * Unit tests for config module
 */

import * as fs from 'fs';
import * as path from 'path';
import { createTempDir, cleanupTempDir } from '../utils/test-helpers';

// Mock the config module's paths before importing
let tempDir: string;
let mockConfigDir: string;

beforeAll(() => {
  tempDir = createTempDir();
  mockConfigDir = path.join(tempDir, '.shc2es');
});

afterAll(() => {
  cleanupTempDir(tempDir);
});

describe('config module', () => {
  describe('ensureConfigDirs', () => {
    it('should create all required directories', () => {
      // Import config which auto-loads env
      jest.isolateModules(() => {
        // Create a mock environment
        const testDir = createTempDir('config-test-');

        // Mock os.homedir and process.cwd before importing config
        const os = require('os');
        const originalHomedir = os.homedir;
        os.homedir = jest.fn(() => testDir);

        const originalCwd = process.cwd;
        const cwdDir = createTempDir('cwd-test-');
        process.cwd = jest.fn(() => cwdDir);

        const config = require('../../src/config');

        // Directories shouldn't exist yet
        expect(fs.existsSync(config.USER_CONFIG_DIR)).toBe(false);

        config.ensureConfigDirs();

        // Now they should exist
        expect(fs.existsSync(config.USER_CONFIG_DIR)).toBe(true);
        expect(fs.existsSync(config.CERTS_DIR)).toBe(true);
        expect(fs.existsSync(config.DATA_DIR)).toBe(true);
        expect(fs.existsSync(config.LOGS_DIR)).toBe(true);

        os.homedir = originalHomedir;
        process.cwd = originalCwd;
        cleanupTempDir(testDir);
        cleanupTempDir(cwdDir);
      });
    });

    it('should not error if directories already exist', () => {
      jest.isolateModules(() => {
        const testDir = createTempDir('config-test-');

        // Mock os.homedir and process.cwd before importing config
        const os = require('os');
        const originalHomedir = os.homedir;
        os.homedir = jest.fn(() => testDir);

        const originalCwd = process.cwd;
        const cwdDir = createTempDir('cwd-test-');
        process.cwd = jest.fn(() => cwdDir);

        const config = require('../../src/config');

        // Call twice to test idempotency
        expect(() => config.ensureConfigDirs()).not.toThrow();
        expect(() => config.ensureConfigDirs()).not.toThrow();

        os.homedir = originalHomedir;
        process.cwd = originalCwd;
        cleanupTempDir(testDir);
        cleanupTempDir(cwdDir);
      });
    });
  });

  describe('findEnvFile', () => {
    it('should prefer local .env over ~/.shc2es/.env', () => {
      jest.isolateModules(() => {
        const testDir = createTempDir('config-test-');
        const localEnvPath = path.join(testDir, '.env');
        const globalEnvPath = path.join(testDir, '.shc2es', '.env');

        // Create both files
        fs.mkdirSync(path.dirname(globalEnvPath), { recursive: true });
        fs.writeFileSync(localEnvPath, 'LOCAL=true');
        fs.writeFileSync(globalEnvPath, 'GLOBAL=true');

        // Mock process.cwd() to return testDir
        const originalCwd = process.cwd;
        process.cwd = jest.fn(() => testDir);
        process.env.HOME = testDir;

        const config = require('../../src/config');
        const envFile = config.findEnvFile();

        expect(envFile).toBe(localEnvPath);

        process.cwd = originalCwd;
        cleanupTempDir(testDir);
      });
    });

    it('should return global .env if local does not exist', () => {
      jest.isolateModules(() => {
        const testDir = createTempDir('config-test-');
        const globalEnvPath = path.join(testDir, '.shc2es', '.env');

        // Create the global .env but not the local one
        fs.mkdirSync(path.dirname(globalEnvPath), { recursive: true });
        fs.writeFileSync(globalEnvPath, 'GLOBAL=true');

        // Mock os.homedir and process.cwd before importing config
        const os = require('os');
        const originalHomedir = os.homedir;
        os.homedir = jest.fn(() => testDir);

        const originalCwd = process.cwd;
        // Return a different dir for cwd so LOCAL_ENV_FILE doesn't exist
        const cwdDir = createTempDir('cwd-test-');
        process.cwd = jest.fn(() => cwdDir);

        const config = require('../../src/config');
        const envFile = config.findEnvFile();

        // Should return the global env file since local doesn't exist
        expect(envFile).toBe(globalEnvPath);

        os.homedir = originalHomedir;
        process.cwd = originalCwd;
        cleanupTempDir(testDir);
        cleanupTempDir(cwdDir);
      });
    });

    it('should return null if no .env file exists', () => {
      jest.isolateModules(() => {
        const testDir = createTempDir('config-test-');

        // Don't create any .env files
        const os = require('os');
        const originalHomedir = os.homedir;
        os.homedir = jest.fn(() => testDir);

        const originalCwd = process.cwd;
        const cwdDir = createTempDir('cwd-test-');
        process.cwd = jest.fn(() => cwdDir);

        const config = require('../../src/config');
        const envFile = config.findEnvFile();

        // Should return null when no env files exist
        expect(envFile).toBeNull();

        os.homedir = originalHomedir;
        process.cwd = originalCwd;
        cleanupTempDir(testDir);
        cleanupTempDir(cwdDir);
      });
    });
  });

  describe('getConfigPaths', () => {
    it('should return all config paths', () => {
      jest.isolateModules(() => {
        const testDir = createTempDir('config-test-');

        // Mock os.homedir and process.cwd before importing config
        const os = require('os');
        const originalHomedir = os.homedir;
        os.homedir = jest.fn(() => testDir);

        const originalCwd = process.cwd;
        const cwdDir = createTempDir('cwd-test-');
        process.cwd = jest.fn(() => cwdDir);

        const config = require('../../src/config');
        const paths = config.getConfigPaths();

        expect(paths).toHaveProperty('configDir');
        expect(paths).toHaveProperty('certsDir');
        expect(paths).toHaveProperty('dataDir');
        expect(paths).toHaveProperty('logsDir');
        expect(paths).toHaveProperty('envFile');

        expect(paths.configDir).toContain('.shc2es');
        expect(paths.certsDir).toContain('certs');
        expect(paths.dataDir).toContain('data');
        expect(paths.logsDir).toContain('logs');

        os.homedir = originalHomedir;
        process.cwd = originalCwd;
        cleanupTempDir(testDir);
        cleanupTempDir(cwdDir);
      });
    });
  });

  describe('environment loading', () => {
    it('should load variables from .env file', () => {
      jest.isolateModules(() => {
        const testDir = createTempDir('config-test-');
        const envPath = path.join(testDir, '.env');

        fs.writeFileSync(envPath, 'TEST_VAR=test_value\nANOTHER_VAR=another_value');

        const originalCwd = process.cwd;
        process.cwd = jest.fn(() => testDir);

        delete process.env.TEST_VAR;
        delete process.env.ANOTHER_VAR;

        // Require config which auto-loads env
        require('../../src/config');

        expect(process.env.TEST_VAR).toBe('test_value');
        expect(process.env.ANOTHER_VAR).toBe('another_value');

        process.cwd = originalCwd;
        cleanupTempDir(testDir);
      });
    });

    it('should not error when no .env file exists', () => {
      jest.isolateModules(() => {
        const testDir = createTempDir('config-test-');

        const originalCwd = process.cwd;
        process.cwd = jest.fn(() => testDir);
        process.env.HOME = testDir;

        // Require config which auto-loads env
        // Should not throw when no .env exists
        expect(() => require('../../src/config')).not.toThrow();

        process.cwd = originalCwd;
        cleanupTempDir(testDir);
      });
    });

    it('should log config file path in dev mode', () => {
      jest.isolateModules(() => {
        const testDir = createTempDir('config-test-');
        const envPath = path.join(testDir, '.env');

        fs.writeFileSync(envPath, 'TEST_VAR=dev_test');

        const originalCwd = process.cwd;
        const originalArgv = process.argv;
        const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

        process.cwd = jest.fn(() => testDir);
        // Simulate dev mode by adding ts-node to argv
        process.argv = ['node', '/path/to/ts-node', 'script.ts'];

        // Require config which auto-loads env
        require('../../src/config');

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Loaded config from:'));

        consoleSpy.mockRestore();
        process.cwd = originalCwd;
        process.argv = originalArgv;
        cleanupTempDir(testDir);
      });
    });
  });
});
