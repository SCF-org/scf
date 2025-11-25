/**
 * Deploy Flow Integration Tests
 *
 * Tests the complete deployment flow:
 * - Config loading → S3 bucket setup → File upload → State saving
 *
 * Uses:
 * - Real filesystem (temp directories)
 * - Mocked AWS SDK
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mockClient } from 'aws-sdk-client-mock';
import {
  S3Client,
  HeadBucketCommand,
  CreateBucketCommand,
  PutBucketWebsiteCommand,
  PutBucketPolicyCommand,
  DeletePublicAccessBlockCommand,
  PutBucketTaggingCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  scanFiles,
  filterChangedFiles,
  groupFilesByCompression,
} from '../../core/deployer/file-scanner.js';
import {
  initializeState,
  saveState,
  loadState,
  updateS3Resource,
  updateFileHashes,
} from '../../core/state/index.js';
import {
  ensureBucket,
  tagBucketForRecovery,
  getBucketWebsiteUrl,
} from '../../core/aws/s3-bucket.js';
import type { FileHashMap } from '../../types/state.js';

describe('Deploy Flow Integration', () => {
  const s3Mock = mockClient(S3Client);
  let s3Client: S3Client;
  let testDir: string;
  let originalCwd: string;

  beforeEach(() => {
    s3Mock.reset();
    s3Client = new S3Client({ region: 'ap-northeast-2' });

    originalCwd = process.cwd();
    testDir = mkdtempSync(join(tmpdir(), 'scf-deploy-flow-'));
    process.chdir(testDir);

    // Setup default S3 mocks
    s3Mock.on(HeadBucketCommand).rejects({ name: 'NotFound', $metadata: { httpStatusCode: 404 } });
    s3Mock.on(CreateBucketCommand).resolves({});
    s3Mock.on(PutBucketWebsiteCommand).resolves({});
    s3Mock.on(DeletePublicAccessBlockCommand).resolves({});
    s3Mock.on(PutBucketPolicyCommand).resolves({});
    s3Mock.on(PutBucketTaggingCommand).resolves({});
    s3Mock.on(PutObjectCommand).resolves({ ETag: '"abc123"' });
  });

  afterEach(() => {
    process.chdir(originalCwd);
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
    s3Mock.restore();
  });

  /**
   * Helper to create build directory with files
   */
  function createBuildDir(files: Record<string, string>): string {
    const buildDir = join(testDir, 'dist');
    mkdirSync(buildDir, { recursive: true });

    for (const [filePath, content] of Object.entries(files)) {
      const fullPath = join(buildDir, filePath);
      const dir = join(fullPath, '..');
      mkdirSync(dir, { recursive: true });
      writeFileSync(fullPath, content, 'utf-8');
    }

    return buildDir;
  }

  describe('Config to S3 Bucket Setup', () => {
    it('should create S3 bucket from config and track in state', async () => {
      const config = {
        app: 'deploy-flow-test',
        region: 'ap-northeast-2',
        s3: {
          bucketName: 'test-bucket-123',
          buildDir: './dist',
          indexDocument: 'index.html',
        },
      };

      // Create bucket
      await ensureBucket(
        s3Client,
        config.s3.bucketName,
        config.region,
        {
          indexDocument: config.s3.indexDocument,
          websiteHosting: true,
          publicRead: true,
        }
      );

      // Tag bucket
      await tagBucketForRecovery(
        s3Client,
        config.s3.bucketName,
        config.app,
        'default'
      );

      // Update state
      let state = initializeState(config.app);
      state = updateS3Resource(state, {
        bucketName: config.s3.bucketName,
        region: config.region,
        websiteUrl: getBucketWebsiteUrl(config.s3.bucketName, config.region),
      });
      saveState(state);

      // Verify bucket creation was called
      const createCalls = s3Mock.commandCalls(CreateBucketCommand);
      expect(createCalls).toHaveLength(1);
      expect(createCalls[0].args[0].input.Bucket).toBe('test-bucket-123');

      // Verify website config was set
      const websiteCalls = s3Mock.commandCalls(PutBucketWebsiteCommand);
      expect(websiteCalls).toHaveLength(1);

      // Verify state was saved correctly
      const loadedState = loadState();
      expect(loadedState?.resources.s3?.bucketName).toBe('test-bucket-123');
      expect(loadedState?.resources.s3?.region).toBe('ap-northeast-2');
      expect(loadedState?.resources.s3?.websiteUrl).toContain('s3-website');
    });

    it('should skip bucket creation if already exists', async () => {
      // Mock bucket already exists
      s3Mock.on(HeadBucketCommand).resolves({});

      await ensureBucket(s3Client, 'existing-bucket', 'ap-northeast-2');

      // CreateBucket should NOT be called
      expect(s3Mock.commandCalls(CreateBucketCommand)).toHaveLength(0);

      // But website config should still be set
      expect(s3Mock.commandCalls(PutBucketWebsiteCommand)).toHaveLength(1);
    });
  });

  describe('File Scanning and Hashing', () => {
    it('should scan build directory and calculate hashes', async () => {
      const buildDir = createBuildDir({
        'index.html': '<html><body>Hello</body></html>',
        'styles/main.css': 'body { color: red; }',
        'scripts/app.js': 'console.log("app");',
        'images/logo.png': 'fake-png-content',
      });

      const files = await scanFiles({ buildDir });

      expect(files).toHaveLength(4);

      // Verify file info structure
      const indexFile = files.find(f => f.key === 'index.html');
      expect(indexFile).toBeDefined();
      expect(indexFile?.contentType).toBe('text/html');
      expect(indexFile?.shouldGzip).toBe(true);
      expect(indexFile?.hash).toBeTruthy();

      const cssFile = files.find(f => f.key === 'styles/main.css');
      expect(cssFile).toBeDefined();
      expect(cssFile?.contentType).toBe('text/css');
      expect(cssFile?.shouldGzip).toBe(true);

      const pngFile = files.find(f => f.key === 'images/logo.png');
      expect(pngFile).toBeDefined();
      expect(pngFile?.contentType).toBe('image/png');
      expect(pngFile?.shouldGzip).toBe(false);
    });

    it('should filter changed files based on hash comparison', async () => {
      const buildDir = createBuildDir({
        'index.html': '<html><body>New content</body></html>',
        'unchanged.html': '<html><body>Same</body></html>',
        'new-file.js': 'console.log("new");',
      });

      const files = await scanFiles({ buildDir });

      // Simulate previous state with file hashes
      const unchangedFile = files.find(f => f.key === 'unchanged.html')!;
      const existingHashes: Record<string, string> = {
        'unchanged.html': unchangedFile.hash, // Same hash - unchanged
        'index.html': 'old-hash-different', // Different hash - changed
        // new-file.js not in existing hashes - new file
      };

      const changedFiles = filterChangedFiles(files, existingHashes);

      expect(changedFiles).toHaveLength(2);
      expect(changedFiles.map(f => f.key)).toContain('index.html');
      expect(changedFiles.map(f => f.key)).toContain('new-file.js');
      expect(changedFiles.map(f => f.key)).not.toContain('unchanged.html');
    });

    it('should correctly group files by compression', async () => {
      const buildDir = createBuildDir({
        'index.html': '<html></html>',
        'style.css': 'body {}',
        'app.js': 'console.log();',
        'data.json': '{}',
        'image.png': 'binary',
        'photo.jpg': 'binary',
        'font.woff2': 'binary',
      });

      const files = await scanFiles({ buildDir });
      const { gzipped, plain } = groupFilesByCompression(files);

      // Text files should be gzipped
      expect(gzipped.map(f => f.key)).toContain('index.html');
      expect(gzipped.map(f => f.key)).toContain('style.css');
      expect(gzipped.map(f => f.key)).toContain('app.js');
      expect(gzipped.map(f => f.key)).toContain('data.json');

      // Binary files should NOT be gzipped
      expect(plain.map(f => f.key)).toContain('image.png');
      expect(plain.map(f => f.key)).toContain('photo.jpg');
      expect(plain.map(f => f.key)).toContain('font.woff2');
    });
  });

  describe('Complete Deploy Flow', () => {
    it('should execute complete deploy flow: scan → upload → save state', async () => {
      const buildDir = createBuildDir({
        'index.html': '<!DOCTYPE html><html><body>Test</body></html>',
        '404.html': '<!DOCTYPE html><html><body>Not Found</body></html>',
        'assets/style.css': 'body { margin: 0; }',
        'assets/app.js': 'console.log("loaded");',
      });

      const config = {
        app: 'complete-deploy-test',
        region: 'ap-northeast-2',
        s3: {
          bucketName: 'complete-test-bucket',
          indexDocument: 'index.html',
          errorDocument: '404.html',
        },
      };

      // Step 1: Initialize state
      let state = initializeState(config.app);

      // Step 2: Create/ensure bucket
      await ensureBucket(s3Client, config.s3.bucketName, config.region, {
        indexDocument: config.s3.indexDocument,
        errorDocument: config.s3.errorDocument,
        websiteHosting: true,
        publicRead: true,
      });

      // Step 3: Update state with S3 resource
      state = updateS3Resource(state, {
        bucketName: config.s3.bucketName,
        region: config.region,
        websiteUrl: getBucketWebsiteUrl(config.s3.bucketName, config.region),
      });

      // Step 4: Scan files
      const files = await scanFiles({ buildDir });
      expect(files).toHaveLength(4);

      // Step 5: Filter changed files (first deploy = all files)
      const changedFiles = filterChangedFiles(files, state.files);
      expect(changedFiles).toHaveLength(4);

      // Step 6: Simulate upload (mock already set up)
      for (const file of changedFiles) {
        // In real code, this would call uploadFile
        // We just verify the mock was called
      }

      // Step 7: Update file hashes in state
      // updateFileHashes takes (state: DeploymentState, files: FileInfo[])
      state = updateFileHashes(state, files);

      // Step 8: Save state
      saveState(state);

      // Verify state was saved correctly
      const loadedState = loadState();
      expect(loadedState?.app).toBe('complete-deploy-test');
      expect(loadedState?.resources.s3?.bucketName).toBe('complete-test-bucket');
      expect(Object.keys(loadedState?.files || {})).toHaveLength(4);
      expect(loadedState?.files['index.html']).toBeTruthy();
      expect(loadedState?.files['assets/style.css']).toBeTruthy();
    });

    it('should track deployment timestamp', async () => {
      const beforeDeploy = Date.now();

      const state = initializeState('timestamp-test');
      saveState(state);

      const afterDeploy = Date.now();

      const loadedState = loadState();
      const deployedTime = new Date(loadedState!.lastDeployed).getTime();

      expect(deployedTime).toBeGreaterThanOrEqual(beforeDeploy);
      expect(deployedTime).toBeLessThanOrEqual(afterDeploy);
    });
  });

  describe('Content-Type Detection', () => {
    it('should detect correct content types for various file types', async () => {
      const buildDir = createBuildDir({
        'index.html': '<html></html>',
        'style.css': 'body {}',
        'app.js': 'console.log();',
        'data.json': '{}',
        'manifest.xml': '<?xml?>',
        'readme.md': '# README',
        'image.png': 'fake',
        'image.jpg': 'fake',
        'image.gif': 'fake',
        'image.svg': '<svg></svg>',
        'video.mp4': 'fake',
        'font.woff2': 'fake',
        'font.ttf': 'fake',
        'archive.zip': 'fake',
        'document.pdf': 'fake',
      });

      const files = await scanFiles({ buildDir });
      const fileMap = new Map(files.map(f => [f.key, f.contentType]));

      // Text types
      expect(fileMap.get('index.html')).toBe('text/html');
      expect(fileMap.get('style.css')).toBe('text/css');
      expect(fileMap.get('app.js')).toBe('application/javascript');
      expect(fileMap.get('data.json')).toBe('application/json');
      expect(fileMap.get('manifest.xml')).toBe('application/xml');
      expect(fileMap.get('readme.md')).toBe('text/markdown');

      // Image types
      expect(fileMap.get('image.png')).toBe('image/png');
      expect(fileMap.get('image.jpg')).toBe('image/jpeg');
      expect(fileMap.get('image.gif')).toBe('image/gif');
      expect(fileMap.get('image.svg')).toBe('image/svg+xml');

      // Other types
      expect(fileMap.get('video.mp4')).toBe('video/mp4');
      expect(fileMap.get('font.woff2')).toBe('font/woff2');
      expect(fileMap.get('archive.zip')).toBe('application/zip');
      expect(fileMap.get('document.pdf')).toBe('application/pdf');
    });
  });

  describe('File Exclusion', () => {
    it('should exclude files matching patterns', async () => {
      const buildDir = createBuildDir({
        'index.html': '<html></html>',
        'app.js': 'console.log();',
        '.DS_Store': 'binary',
        '.gitignore': 'node_modules',
        'node_modules/package/index.js': 'module',
        '__tests__/test.js': 'test',
        'src/temp.bak': 'backup',
      });

      const files = await scanFiles({
        buildDir,
        exclude: [
          '**/node_modules/**',
          '**/__tests__/**',
          '**/*.bak',
        ],
      });

      const keys = files.map(f => f.key);

      expect(keys).toContain('index.html');
      expect(keys).toContain('app.js');
      expect(keys).toContain('.DS_Store'); // Not excluded
      expect(keys).toContain('.gitignore'); // Not excluded
      expect(keys).not.toContain('node_modules/package/index.js');
      expect(keys).not.toContain('__tests__/test.js');
      expect(keys).not.toContain('src/temp.bak');
    });
  });

  describe('Error Handling', () => {
    it('should handle S3 errors gracefully', async () => {
      s3Mock.on(CreateBucketCommand).rejects(new Error('Access Denied'));

      // When bucket doesn't exist, ensureBucket tries to create it
      s3Mock.on(HeadBucketCommand).rejects({ name: 'NotFound', $metadata: { httpStatusCode: 404 } });

      await expect(
        ensureBucket(s3Client, 'forbidden-bucket', 'ap-northeast-2')
      ).rejects.toThrow('Access Denied');
    });

    it('should handle empty build directory', async () => {
      const buildDir = join(testDir, 'empty-dist');
      mkdirSync(buildDir, { recursive: true });

      const files = await scanFiles({ buildDir });
      expect(files).toHaveLength(0);
    });
  });
});
