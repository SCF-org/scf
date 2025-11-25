/**
 * State Management Integration Tests
 *
 * Tests state management across multiple operations:
 * - Environment-specific state files
 * - State load/save integrity
 * - File hash accuracy
 * - Resource metadata storage
 * - State recovery scenarios
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtempSync, writeFileSync, rmSync, existsSync, readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  loadState,
  saveState,
  deleteState,
  initializeState,
  getOrCreateState,
  stateExists,
  getStateFilePath,
  listStateFiles,
  updateS3Resource,
  updateCloudFrontResource,
  updateACMResource,
  updateRoute53Resource,
  getFilesToUpload,
  updateFileHashes,
  compareFileHashes,
  createFileHashMap,
  getIncrementalStats,
  STATE_VERSION,
} from '../../core/state/index.js';
import type { DeploymentState, FileHashMap } from '../../types/state.js';
import type { FileInfo } from '../../types/deployer.js';

describe('State Management Integration', () => {
  let testDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    testDir = mkdtempSync(join(tmpdir(), 'scf-state-integration-'));
    process.chdir(testDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('Environment-specific State Files', () => {
    it('should create separate state files for different environments', () => {
      // Create states for multiple environments
      const devState = initializeState('my-app', 'dev');
      const prodState = initializeState('my-app', 'prod');
      const stagingState = initializeState('my-app', 'staging');

      saveState(devState, { environment: 'dev' });
      saveState(prodState, { environment: 'prod' });
      saveState(stagingState, { environment: 'staging' });

      // Verify all state files exist
      expect(stateExists({ environment: 'dev' })).toBe(true);
      expect(stateExists({ environment: 'prod' })).toBe(true);
      expect(stateExists({ environment: 'staging' })).toBe(true);

      // List should return all state files
      const stateFiles = listStateFiles();
      expect(stateFiles).toContain('state.dev.json');
      expect(stateFiles).toContain('state.prod.json');
      expect(stateFiles).toContain('state.staging.json');
    });

    it('should load correct environment state', () => {
      // Create states with different resources
      const devState = initializeState('my-app', 'dev');
      devState.resources = {
        s3: { bucketName: 'dev-bucket', region: 'us-east-1' },
      };

      const prodState = initializeState('my-app', 'prod');
      prodState.resources = {
        s3: { bucketName: 'prod-bucket', region: 'ap-northeast-2' },
      };

      saveState(devState, { environment: 'dev' });
      saveState(prodState, { environment: 'prod' });

      // Load and verify each environment
      const loadedDev = loadState({ environment: 'dev' });
      const loadedProd = loadState({ environment: 'prod' });

      expect(loadedDev?.environment).toBe('dev');
      expect(loadedDev?.resources.s3?.bucketName).toBe('dev-bucket');

      expect(loadedProd?.environment).toBe('prod');
      expect(loadedProd?.resources.s3?.bucketName).toBe('prod-bucket');
    });

    it('should delete only the specified environment state', () => {
      // Create multiple environment states
      saveState(initializeState('my-app', 'dev'), { environment: 'dev' });
      saveState(initializeState('my-app', 'prod'), { environment: 'prod' });
      saveState(initializeState('my-app', 'staging'), { environment: 'staging' });

      // Delete only dev
      deleteState({ environment: 'dev' });

      // Verify dev is deleted but others remain
      expect(stateExists({ environment: 'dev' })).toBe(false);
      expect(stateExists({ environment: 'prod' })).toBe(true);
      expect(stateExists({ environment: 'staging' })).toBe(true);
    });
  });

  describe('State Load/Save Integrity', () => {
    it('should maintain data integrity through save/load cycle', () => {
      const originalState: DeploymentState = {
        app: 'integrity-test-app',
        environment: 'default',
        lastDeployed: new Date().toISOString(),
        version: STATE_VERSION,
        resources: {
          s3: {
            bucketName: 'test-bucket-123',
            region: 'ap-northeast-2',
            websiteUrl: 'http://test-bucket-123.s3-website.ap-northeast-2.amazonaws.com',
          },
          cloudfront: {
            distributionId: 'E1234567890',
            domainName: 'd123456.cloudfront.net',
            arn: 'arn:aws:cloudfront::123456789:distribution/E1234567890',
          },
          acm: {
            certificateArn: 'arn:aws:acm:us-east-1:123456789:certificate/abc-123',
            domain: 'example.com',
            validationMethod: 'DNS',
          },
          route53: {
            hostedZoneId: 'Z1234567890',
            domain: 'example.com',
            records: [
              { name: 'example.com', type: 'A', value: 'ALIAS' },
              { name: 'example.com', type: 'AAAA', value: 'ALIAS' },
            ],
          },
        },
        files: {
          'index.html': 'abc123def456',
          'style.css': 'xyz789uvw321',
          'app.js': 'qwe456rty789',
        },
      };

      // Save state
      saveState(originalState);

      // Load state
      const loadedState = loadState();

      // Verify all fields (lastDeployed will be updated, so skip it)
      expect(loadedState?.app).toBe(originalState.app);
      expect(loadedState?.environment).toBe(originalState.environment);
      expect(loadedState?.version).toBe(originalState.version);

      // Verify resources
      expect(loadedState?.resources.s3).toEqual(originalState.resources.s3);
      expect(loadedState?.resources.cloudfront).toEqual(originalState.resources.cloudfront);
      expect(loadedState?.resources.acm).toEqual(originalState.resources.acm);
      expect(loadedState?.resources.route53).toEqual(originalState.resources.route53);

      // Verify files
      expect(loadedState?.files).toEqual(originalState.files);
    });

    it('should handle special characters in file paths', () => {
      const state = initializeState('special-chars-app');
      state.files = {
        'path/to/file.html': 'hash1',
        'assets/images/photo (1).jpg': 'hash2',
        'data/file-with-dashes.json': 'hash3',
        'scripts/app.min.js': 'hash4',
      };

      saveState(state);
      const loaded = loadState();

      expect(loaded?.files['path/to/file.html']).toBe('hash1');
      expect(loaded?.files['assets/images/photo (1).jpg']).toBe('hash2');
      expect(loaded?.files['data/file-with-dashes.json']).toBe('hash3');
      expect(loaded?.files['scripts/app.min.js']).toBe('hash4');
    });

    it('should update version on save', () => {
      const stateWithoutVersion = {
        app: 'version-test',
        environment: 'default',
        lastDeployed: new Date().toISOString(),
        resources: {},
        files: {},
      } as DeploymentState;

      saveState(stateWithoutVersion);
      const loaded = loadState();

      expect(loaded?.version).toBe(STATE_VERSION);
    });
  });

  describe('File Hash Tracking', () => {
    /**
     * Helper to create FileInfo array from hash map
     */
    function createMockFileInfoArray(hashes: Record<string, string>): FileInfo[] {
      return Object.entries(hashes).map(([key, hash]) => ({
        absolutePath: `/fake/path/${key}`,
        relativePath: key,
        key,
        size: 100,
        hash,
        contentType: 'text/html',
        shouldGzip: true,
      }));
    }

    it('should correctly identify changed files', () => {
      // Previous state with file hashes
      const previousHashes: FileHashMap = {
        'index.html': 'old-hash-1',
        'style.css': 'old-hash-2',
        'app.js': 'old-hash-3',
      };

      // Current files with some changes
      const currentFiles = createMockFileInfoArray({
        'index.html': 'old-hash-1', // unchanged
        'style.css': 'new-hash-2', // changed
        'app.js': 'old-hash-3', // unchanged
        'new-file.js': 'new-hash-4', // new
      });

      const changes = compareFileHashes(currentFiles, previousHashes);

      expect(changes.added.map(f => f.path)).toContain('new-file.js');
      expect(changes.modified.map(f => f.path)).toContain('style.css');
      expect(changes.unchanged.map(f => f.path)).toContain('index.html');
      expect(changes.unchanged.map(f => f.path)).toContain('app.js');
    });

    it('should get correct files to upload', () => {
      const previousHashes: FileHashMap = {
        'index.html': 'hash1',
        'style.css': 'hash2',
        'deleted.js': 'hash3', // will be deleted
      };

      // Current files (without deleted.js)
      const currentFiles = createMockFileInfoArray({
        'index.html': 'hash1', // unchanged
        'style.css': 'new-hash2', // modified
        'new.js': 'hash4', // added
      });

      const filesToUpload = getFilesToUpload(currentFiles, previousHashes);

      expect(filesToUpload.map(f => f.key)).toContain('style.css');
      expect(filesToUpload.map(f => f.key)).toContain('new.js');
      expect(filesToUpload.map(f => f.key)).not.toContain('index.html');
    });

    it('should update file hashes correctly', () => {
      const state = initializeState('hash-update-test');
      state.files = {
        'index.html': 'old-hash',
        'style.css': 'css-hash',
      };

      const newFiles = createMockFileInfoArray({
        'index.html': 'new-hash',
        'app.js': 'js-hash',
      });

      const updatedState = updateFileHashes(state, newFiles);

      expect(updatedState.files['index.html']).toBe('new-hash');
      expect(updatedState.files['app.js']).toBe('js-hash');
    });

    it('should handle empty previous state (first deployment)', () => {
      const previousHashes: FileHashMap = {};
      const currentFiles = createMockFileInfoArray({
        'index.html': 'hash1',
        'style.css': 'hash2',
        'app.js': 'hash3',
      });

      const filesToUpload = getFilesToUpload(currentFiles, previousHashes);

      // All files should be uploaded on first deployment
      expect(filesToUpload).toHaveLength(3);
      expect(filesToUpload.map(f => f.key)).toContain('index.html');
      expect(filesToUpload.map(f => f.key)).toContain('style.css');
      expect(filesToUpload.map(f => f.key)).toContain('app.js');
    });

    it('should detect deleted files', () => {
      const previousHashes: FileHashMap = {
        'index.html': 'hash1',
        'deleted.js': 'hash2',
      };

      const currentFiles = createMockFileInfoArray({
        'index.html': 'hash1',
      });

      const changes = compareFileHashes(currentFiles, previousHashes);

      expect(changes.deleted.map(f => f.path)).toContain('deleted.js');
      expect(changes.deleted).toHaveLength(1);
    });

    it('should calculate incremental stats', () => {
      const previousHashes: FileHashMap = {
        'index.html': 'hash1',
        'style.css': 'hash2',
        'deleted.js': 'hash3',
      };

      const currentFiles = createMockFileInfoArray({
        'index.html': 'hash1', // unchanged
        'style.css': 'new-hash', // modified
        'new.js': 'hash4', // added
      });

      const changes = compareFileHashes(currentFiles, previousHashes);
      const stats = getIncrementalStats(changes);

      expect(stats.needsUpload).toBe(2); // 1 added + 1 modified
      expect(stats.canSkip).toBe(1); // 1 unchanged
      expect(stats.needsDelete).toBe(1); // 1 deleted
    });
  });

  describe('Resource Metadata Storage', () => {
    it('should store and retrieve S3 resource metadata', () => {
      const state = initializeState('s3-resource-test');

      const updatedState = updateS3Resource(state, {
        bucketName: 'my-bucket-123',
        region: 'ap-northeast-2',
        websiteUrl: 'http://my-bucket-123.s3-website.ap-northeast-2.amazonaws.com',
      });

      saveState(updatedState);
      const loaded = loadState();

      expect(loaded?.resources.s3?.bucketName).toBe('my-bucket-123');
      expect(loaded?.resources.s3?.region).toBe('ap-northeast-2');
      expect(loaded?.resources.s3?.websiteUrl).toContain('s3-website');
    });

    it('should store and retrieve CloudFront resource metadata', () => {
      const state = initializeState('cf-resource-test');

      const updatedState = updateCloudFrontResource(state, {
        distributionId: 'E1234567890ABC',
        domainName: 'd123456abcdef.cloudfront.net',
        arn: 'arn:aws:cloudfront::123456789:distribution/E1234567890ABC',
      });

      saveState(updatedState);
      const loaded = loadState();

      expect(loaded?.resources.cloudfront?.distributionId).toBe('E1234567890ABC');
      expect(loaded?.resources.cloudfront?.domainName).toContain('cloudfront.net');
      expect(loaded?.resources.cloudfront?.arn).toContain('cloudfront');
    });

    it('should store and retrieve ACM resource metadata', () => {
      const state = initializeState('acm-resource-test');

      const updatedState = updateACMResource(state, {
        certificateArn: 'arn:aws:acm:us-east-1:123456789:certificate/abc-123',
        domain: 'example.com',
        validationMethod: 'DNS',
      });

      saveState(updatedState);
      const loaded = loadState();

      expect(loaded?.resources.acm?.certificateArn).toContain('acm:us-east-1');
      expect(loaded?.resources.acm?.domain).toBe('example.com');
      expect(loaded?.resources.acm?.validationMethod).toBe('DNS');
    });

    it('should store and retrieve Route53 resource metadata', () => {
      const state = initializeState('route53-resource-test');

      const updatedState = updateRoute53Resource(state, {
        hostedZoneId: 'Z1234567890ABC',
        domain: 'example.com',
        records: [
          { name: 'example.com', type: 'A', value: 'ALIAS' },
          { name: 'www.example.com', type: 'CNAME', value: 'd123.cloudfront.net' },
        ],
      });

      saveState(updatedState);
      const loaded = loadState();

      expect(loaded?.resources.route53?.hostedZoneId).toBe('Z1234567890ABC');
      expect(loaded?.resources.route53?.domain).toBe('example.com');
      expect(loaded?.resources.route53?.records).toHaveLength(2);
    });

    it('should store multiple resources in single state', () => {
      let state = initializeState('multi-resource-test');

      // Add all resources progressively
      state = updateS3Resource(state, {
        bucketName: 'test-bucket',
        region: 'ap-northeast-2',
      });

      state = updateCloudFrontResource(state, {
        distributionId: 'E123',
        domainName: 'd123.cloudfront.net',
      });

      state = updateACMResource(state, {
        certificateArn: 'arn:aws:acm:us-east-1:123:certificate/abc',
        domain: 'example.com',
      });

      state = updateRoute53Resource(state, {
        hostedZoneId: 'Z123',
        domain: 'example.com',
      });

      saveState(state);
      const loaded = loadState();

      // All resources should be present
      expect(loaded?.resources.s3).toBeDefined();
      expect(loaded?.resources.cloudfront).toBeDefined();
      expect(loaded?.resources.acm).toBeDefined();
      expect(loaded?.resources.route53).toBeDefined();
    });
  });

  describe('State Recovery Scenarios', () => {
    it('should recover from missing state file', () => {
      // No state file exists
      expect(stateExists()).toBe(false);

      // getOrCreateState should create new state
      const state = getOrCreateState('recovery-app');

      expect(state.app).toBe('recovery-app');
      expect(state.resources).toEqual({});
      expect(state.files).toEqual({});
    });

    it('should handle corrupted state file gracefully', () => {
      // Write corrupted state file to .deploy (the actual DEFAULT_STATE_DIR)
      const stateDir = join(testDir, '.deploy');
      mkdirSync(stateDir, { recursive: true });
      writeFileSync(join(stateDir, 'state.json'), 'not valid json{{{');

      // loadState should throw with meaningful error
      expect(() => loadState()).toThrow('Failed to load state file');
    });

    it('should validate state structure on load', () => {
      // Write incomplete state file to .deploy (the actual DEFAULT_STATE_DIR)
      const stateDir = join(testDir, '.deploy');
      mkdirSync(stateDir, { recursive: true });
      writeFileSync(
        join(stateDir, 'state.json'),
        JSON.stringify({ incomplete: 'state' })
      );

      // loadState should throw with validation error (wrapped in "Failed to load state file")
      expect(() => loadState()).toThrow('Failed to load state file');
    });

    it('should preserve state across process restarts (persistence)', () => {
      // First "session" - create and save state
      const state1 = initializeState('persistent-app');
      state1.files = { 'index.html': 'hash123' };
      state1.resources = { s3: { bucketName: 'my-bucket', region: 'us-east-1' } };
      saveState(state1);

      // Get the state file path for verification
      const statePath = getStateFilePath();
      expect(existsSync(statePath)).toBe(true);

      // Read raw JSON to verify persistence
      const rawContent = readFileSync(statePath, 'utf-8');
      const rawState = JSON.parse(rawContent);

      expect(rawState.app).toBe('persistent-app');
      expect(rawState.files['index.html']).toBe('hash123');
      expect(rawState.resources.s3.bucketName).toBe('my-bucket');

      // Second "session" - load and verify
      const state2 = loadState();
      expect(state2?.app).toBe('persistent-app');
      expect(state2?.files['index.html']).toBe('hash123');
    });

    it('should migrate old state format to new version', () => {
      // This test ensures backward compatibility
      // Write an old format state (without version) to .deploy
      const stateDir = join(testDir, '.deploy');
      mkdirSync(stateDir, { recursive: true });

      const oldFormatState = {
        app: 'old-app',
        environment: 'default',
        lastDeployed: new Date().toISOString(),
        resources: { s3: { bucketName: 'old-bucket', region: 'us-east-1' } },
        files: { 'index.html': 'oldhash' },
        // No version field
      };

      writeFileSync(
        join(stateDir, 'state.json'),
        JSON.stringify(oldFormatState, null, 2)
      );

      // Load should work and add version
      const loaded = loadState();
      expect(loaded?.app).toBe('old-app');
      expect(loaded?.resources.s3?.bucketName).toBe('old-bucket');

      // Save and reload - version should be added
      saveState(loaded!);
      const reloaded = loadState();
      expect(reloaded?.version).toBe(STATE_VERSION);
    });
  });
});
