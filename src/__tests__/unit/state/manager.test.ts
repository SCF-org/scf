import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  getStateFilePath,
  stateExists,
  loadState,
  saveState,
  deleteState,
  initializeState,
  getOrCreateState,
  listStateFiles,
  getStateDir,
  ensureStateDir,
  DEFAULT_STATE_DIR,
  STATE_VERSION,
} from '../../../core/state/manager.js';
import type { DeploymentState } from '../../../types/state.js';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('State Manager', () => {
  let testDir: string;
  let originalCwd: string;

  beforeEach(() => {
    // Save original working directory
    originalCwd = process.cwd();

    // Create a unique temporary directory for each test
    testDir = mkdtempSync(join(tmpdir(), 'scf-state-test-'));

    // Change to test directory
    process.chdir(testDir);
  });

  afterEach(() => {
    // Restore original working directory
    process.chdir(originalCwd);

    // Clean up test directory
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('getStateFilePath', () => {
    it('should return default state file path', () => {
      const filePath = getStateFilePath();
      expect(filePath).toContain(DEFAULT_STATE_DIR);
      expect(filePath).toContain('state.json');
    });

    it('should return environment-specific state file path', () => {
      const filePath = getStateFilePath({ environment: 'prod' });
      expect(filePath).toContain('state.prod.json');
    });

    it('should use custom state directory', () => {
      const filePath = getStateFilePath({ stateDir: '.custom' });
      expect(filePath).toContain('.custom');
    });

    it('should combine custom directory and environment', () => {
      const filePath = getStateFilePath({
        stateDir: '.custom',
        environment: 'dev',
      });
      expect(filePath).toContain('.custom');
      expect(filePath).toContain('state.dev.json');
    });
  });

  describe('stateExists', () => {
    it('should return false when state file does not exist', () => {
      expect(stateExists()).toBe(false);
    });

    it('should return true when state file exists', () => {
      const mockState: DeploymentState = {
        app: 'test-app',
        environment: 'default',
        lastDeployed: new Date().toISOString(),
        resources: {},
        files: {},
        version: STATE_VERSION,
      };

      saveState(mockState);
      expect(stateExists()).toBe(true);
    });

    it('should check environment-specific state file', () => {
      const mockState: DeploymentState = {
        app: 'test-app',
        environment: 'prod',
        lastDeployed: new Date().toISOString(),
        resources: {},
        files: {},
        version: STATE_VERSION,
      };

      saveState(mockState, { environment: 'prod' });
      expect(stateExists({ environment: 'prod' })).toBe(true);
      expect(stateExists({ environment: 'dev' })).toBe(false);
    });
  });

  describe('initializeState', () => {
    it('should create empty state with defaults', () => {
      const state = initializeState('test-app');

      expect(state.app).toBe('test-app');
      expect(state.environment).toBe('default');
      expect(state.resources).toEqual({});
      expect(state.files).toEqual({});
      expect(state.version).toBe(STATE_VERSION);
      expect(state.lastDeployed).toBeDefined();
    });

    it('should create state with custom environment', () => {
      const state = initializeState('test-app', 'prod');

      expect(state.app).toBe('test-app');
      expect(state.environment).toBe('prod');
    });

    it('should include lastDeployed timestamp', () => {
      const state = initializeState('test-app');
      const timestamp = new Date(state.lastDeployed);

      expect(timestamp.getTime()).toBeLessThanOrEqual(Date.now());
      expect(timestamp.getTime()).toBeGreaterThan(Date.now() - 1000); // Within last second
    });
  });

  describe('saveState', () => {
    it('should save state to file', () => {
      const state: DeploymentState = {
        app: 'test-app',
        environment: 'default',
        lastDeployed: new Date().toISOString(),
        resources: {
          s3: {
            bucketName: 'test-bucket',
            region: 'us-east-1',
          },
        },
        files: {
          'index.html': 'hash1',
        },
        version: STATE_VERSION,
      };

      saveState(state);

      const filePath = getStateFilePath();
      expect(existsSync(filePath)).toBe(true);
    });

    it('should create state directory if it does not exist', () => {
      const state = initializeState('test-app');
      saveState(state);

      const stateDir = getStateDir();
      expect(existsSync(stateDir)).toBe(true);
    });

    it('should add version if not present', () => {
      const stateWithoutVersion = {
        app: 'test-app',
        environment: 'default',
        lastDeployed: new Date().toISOString(),
        resources: {},
        files: {},
      } as unknown as DeploymentState;

      saveState(stateWithoutVersion);
      const loaded = loadState();

      expect(loaded?.version).toBe(STATE_VERSION);
    });

    it('should update lastDeployed timestamp', () => {
      const oldTimestamp = new Date(Date.now() - 10000).toISOString();
      const state: DeploymentState = {
        app: 'test-app',
        environment: 'default',
        lastDeployed: oldTimestamp,
        resources: {},
        files: {},
        version: STATE_VERSION,
      };

      saveState(state);
      const loaded = loadState();

      expect(loaded?.lastDeployed).not.toBe(oldTimestamp);
      expect(new Date(loaded!.lastDeployed).getTime()).toBeGreaterThan(
        new Date(oldTimestamp).getTime()
      );
    });

    it('should save environment-specific state', () => {
      const state = initializeState('test-app', 'prod');
      saveState(state, { environment: 'prod' });

      const filePath = getStateFilePath({ environment: 'prod' });
      expect(existsSync(filePath)).toBe(true);
    });

    it('should format JSON with indentation', async () => {
      const { readFileSync } = await import('node:fs');
      const state = initializeState('test-app');
      saveState(state);

      const filePath = getStateFilePath();
      const content = readFileSync(filePath, 'utf-8');

      expect(content).toContain('\n');
      expect(content).toContain('  '); // Should have 2-space indentation
    });
  });

  describe('loadState', () => {
    it('should return null when state file does not exist', () => {
      const state = loadState();
      expect(state).toBeNull();
    });

    it('should load saved state', () => {
      const mockState: DeploymentState = {
        app: 'test-app',
        environment: 'default',
        lastDeployed: new Date().toISOString(),
        resources: {
          s3: {
            bucketName: 'test-bucket',
            region: 'us-east-1',
          },
        },
        files: {
          'index.html': 'hash1',
        },
        version: STATE_VERSION,
      };

      saveState(mockState);
      const loaded = loadState();

      expect(loaded?.app).toBe('test-app');
      expect(loaded?.resources).toEqual(mockState.resources);
      expect(loaded?.files).toEqual(mockState.files);
    });

    it('should throw error for invalid state file', async () => {
      const { writeFileSync, mkdirSync } = await import('node:fs');
      const stateDir = getStateDir();
      mkdirSync(stateDir, { recursive: true });

      const filePath = getStateFilePath();
      writeFileSync(filePath, 'invalid json');

      expect(() => loadState()).toThrow('Failed to load state file');
    });

    it('should throw error for invalid state structure', async () => {
      const { writeFileSync, mkdirSync } = await import('node:fs');
      const stateDir = getStateDir();
      mkdirSync(stateDir, { recursive: true });

      const filePath = getStateFilePath();
      writeFileSync(filePath, JSON.stringify({ invalid: 'structure' }));

      expect(() => loadState()).toThrow('Invalid state file structure');
    });

    it('should validate required fields', async () => {
      const { writeFileSync, mkdirSync } = await import('node:fs');
      const stateDir = getStateDir();
      mkdirSync(stateDir, { recursive: true });

      const filePath = getStateFilePath();
      writeFileSync(
        filePath,
        JSON.stringify({
          app: 'test-app',
          // Missing environment and resources
        })
      );

      expect(() => loadState()).toThrow('Invalid state file structure');
    });
  });

  describe('deleteState', () => {
    it('should return false when state file does not exist', () => {
      const result = deleteState();
      expect(result).toBe(false);
    });

    it('should delete state file', () => {
      const state = initializeState('test-app');
      saveState(state);

      const filePath = getStateFilePath();
      expect(existsSync(filePath)).toBe(true);

      const result = deleteState();
      expect(result).toBe(true);
      expect(existsSync(filePath)).toBe(false);
    });

    it('should remove state directory if empty', () => {
      const state = initializeState('test-app');
      saveState(state);

      const stateDir = getStateDir();
      expect(existsSync(stateDir)).toBe(true);

      deleteState();
      expect(existsSync(stateDir)).toBe(false);
    });

    it('should not remove state directory if other files exist', async () => {
      const { writeFileSync } = await import('node:fs');

      const state1 = initializeState('test-app', 'dev');
      const state2 = initializeState('test-app', 'prod');

      saveState(state1, { environment: 'dev' });
      saveState(state2, { environment: 'prod' });

      const stateDir = getStateDir();
      expect(existsSync(stateDir)).toBe(true);

      deleteState({ environment: 'dev' });

      // State directory should still exist
      expect(existsSync(stateDir)).toBe(true);

      // But dev state file should be gone
      const devFilePath = getStateFilePath({ environment: 'dev' });
      expect(existsSync(devFilePath)).toBe(false);

      // Prod state file should still exist
      const prodFilePath = getStateFilePath({ environment: 'prod' });
      expect(existsSync(prodFilePath)).toBe(true);
    });
  });

  describe('getOrCreateState', () => {
    it('should create new state when none exists', () => {
      const state = getOrCreateState('test-app');

      expect(state.app).toBe('test-app');
      expect(state.environment).toBe('default');
      expect(state.resources).toEqual({});
    });

    it('should return existing state when it exists', () => {
      const mockState = initializeState('test-app');
      mockState.files = { 'index.html': 'hash1' };
      saveState(mockState);

      const state = getOrCreateState('test-app');

      expect(state.files).toEqual({ 'index.html': 'hash1' });
    });

    it('should respect environment parameter', () => {
      const state = getOrCreateState('test-app', { environment: 'prod' });
      expect(state.environment).toBe('prod');
    });
  });

  describe('listStateFiles', () => {
    it('should return empty array when state directory does not exist', () => {
      const files = listStateFiles();
      expect(files).toEqual([]);
    });

    it('should list all state files', () => {
      const state1 = initializeState('test-app', 'dev');
      const state2 = initializeState('test-app', 'prod');
      const state3 = initializeState('test-app', 'default');

      saveState(state1, { environment: 'dev' });
      saveState(state2, { environment: 'prod' });
      saveState(state3);

      const files = listStateFiles();

      expect(files.length).toBe(3);
      expect(files).toContain('state.json');
      expect(files).toContain('state.dev.json');
      expect(files).toContain('state.prod.json');
    });

    it('should only list state JSON files', async () => {
      const { writeFileSync } = await import('node:fs');

      const state = initializeState('test-app');
      saveState(state);

      const stateDir = getStateDir();
      writeFileSync(join(stateDir, 'other.json'), '{}');
      writeFileSync(join(stateDir, 'state.txt'), 'text');

      const files = listStateFiles();

      expect(files).toContain('state.json');
      expect(files).not.toContain('other.json');
      expect(files).not.toContain('state.txt');
    });
  });

  describe('ensureStateDir', () => {
    it('should create state directory if it does not exist', () => {
      const stateDir = getStateDir();
      expect(existsSync(stateDir)).toBe(false);

      ensureStateDir();

      expect(existsSync(stateDir)).toBe(true);
    });

    it('should not error if directory already exists', () => {
      ensureStateDir();
      expect(() => ensureStateDir()).not.toThrow();
    });

    it('should work with custom state directory', () => {
      const customDir = '.custom-state';
      const stateDirPath = join(process.cwd(), customDir);

      expect(existsSync(stateDirPath)).toBe(false);

      ensureStateDir(customDir);

      expect(existsSync(stateDirPath)).toBe(true);
    });
  });
});
