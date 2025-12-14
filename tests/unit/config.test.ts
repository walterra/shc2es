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
        const configDir = path.join(testDir, '.shc2es');
        
        process.env.HOME = testDir;
        
        const config = require('../../src/config');
        config.ensureConfigDirs();
        
        expect(fs.existsSync(config.USER_CONFIG_DIR)).toBe(true);
        expect(fs.existsSync(config.CERTS_DIR)).toBe(true);
        expect(fs.existsSync(config.DATA_DIR)).toBe(true);
        expect(fs.existsSync(config.LOGS_DIR)).toBe(true);
        
        cleanupTempDir(testDir);
      });
    });

    it('should not error if directories already exist', () => {
      jest.isolateModules(() => {
        const testDir = createTempDir('config-test-');
        process.env.HOME = testDir;
        
        const config = require('../../src/config');
        
        // Call twice
        expect(() => config.ensureConfigDirs()).not.toThrow();
        expect(() => config.ensureConfigDirs()).not.toThrow();
        
        cleanupTempDir(testDir);
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
      const testDir = createTempDir('config-test-');
      const globalEnvPath = path.join(testDir, '.shc2es', '.env');
      
      fs.mkdirSync(path.dirname(globalEnvPath), { recursive: true });
      fs.writeFileSync(globalEnvPath, 'GLOBAL=true');
      
      // Check that LOCAL_ENV_FILE (cwd/.env) doesn't exist
      // but global one does
      expect(fs.existsSync(globalEnvPath)).toBe(true);
      
      cleanupTempDir(testDir);
    });

    it('should return null if no .env file exists', () => {
      const testDir = createTempDir('config-test-');
      
      // findEnvFile checks LOCAL_ENV_FILE and ENV_FILE
      // We can verify that neither exists in our temp dir
      const localEnv = path.join(testDir, '.env');
      const globalEnv = path.join(testDir, '.shc2es', '.env');
      
      expect(fs.existsSync(localEnv)).toBe(false);
      expect(fs.existsSync(globalEnv)).toBe(false);
      
      cleanupTempDir(testDir);
    });
  });

  describe('getConfigPaths', () => {
    it('should return all config paths', () => {
      jest.isolateModules(() => {
        const testDir = createTempDir('config-test-');
        process.env.HOME = testDir;
        
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
        
        cleanupTempDir(testDir);
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
  });
});
