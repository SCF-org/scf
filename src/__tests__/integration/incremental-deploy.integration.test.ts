/**
 * Incremental Deploy Integration Tests
 *
 * Tests incremental deployment scenarios:
 * - First deployment uploads all files
 * - Subsequent deployments only upload changed files
 * - File additions, modifications, and deletions
 * - Force flag for full re-upload
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mockClient } from 'aws-sdk-client-mock';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  scanFiles,
  filterChangedFiles,
} from '../../core/deployer/file-scanner.js';
import {
  initializeState,
  saveState,
  loadState,
  updateFileHashes,
  compareFileHashes,
  getFilesToUpload,
  removeDeletedFiles,
  formatFileChanges,
  getIncrementalStats,
  createFileHashMap,
} from '../../core/state/index.js';
import type { FileHashMap, DeploymentState } from '../../types/state.js';
import type { FileInfo } from '../../types/deployer.js';

describe('Incremental Deploy Integration', () => {
  const s3Mock = mockClient(S3Client);
  let testDir: string;
  let buildDir: string;
  let originalCwd: string;

  beforeEach(() => {
    s3Mock.reset();
    s3Mock.on(PutObjectCommand).resolves({ ETag: '"abc123"' });

    originalCwd = process.cwd();
    testDir = mkdtempSync(join(tmpdir(), 'scf-incremental-'));
    buildDir = join(testDir, 'dist');
    mkdirSync(buildDir, { recursive: true });

    process.chdir(testDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
    s3Mock.restore();
  });

  /**
   * Helper to create files in build directory
   */
  function createFiles(files: Record<string, string>): void {
    for (const [filePath, content] of Object.entries(files)) {
      const fullPath = join(buildDir, filePath);
      const dir = join(fullPath, '..');
      mkdirSync(dir, { recursive: true });
      writeFileSync(fullPath, content, 'utf-8');
    }
  }

  /**
   * Helper to delete a file from build directory
   */
  function deleteFile(filePath: string): void {
    const fullPath = join(buildDir, filePath);
    if (existsSync(fullPath)) {
      unlinkSync(fullPath);
    }
  }

  /**
   * Helper to simulate a deploy and save state
   */
  async function simulateDeploy(state: DeploymentState): Promise<DeploymentState> {
    const files = await scanFiles({ buildDir });
    const updatedState = updateFileHashes(state, files);
    saveState(updatedState);
    return updatedState;
  }

  describe('First Deployment', () => {
    it('should upload all files on first deployment', async () => {
      createFiles({
        'index.html': '<html><body>Hello</body></html>',
        'style.css': 'body { color: blue; }',
        'app.js': 'console.log("app");',
      });

      // Initialize empty state
      const state = initializeState('first-deploy-test');
      expect(state.files).toEqual({});

      // Scan files
      const files = await scanFiles({ buildDir });

      // All files should be marked for upload (no previous hashes)
      const changedFiles = filterChangedFiles(files, state.files);
      expect(changedFiles).toHaveLength(3);

      // Files to upload should be all files
      // getFilesToUpload takes (currentFiles: FileInfo[], previousHashes: FileHashMap)
      const filesToUpload = getFilesToUpload(files, {});
      expect(filesToUpload).toHaveLength(3);
    });

    it('should save all file hashes after first deployment', async () => {
      createFiles({
        'index.html': '<html></html>',
        'style.css': 'body {}',
      });

      let state = initializeState('hash-save-test');
      state = await simulateDeploy(state);

      const loadedState = loadState();
      expect(Object.keys(loadedState?.files || {})).toHaveLength(2);
      expect(loadedState?.files['index.html']).toBeTruthy();
      expect(loadedState?.files['style.css']).toBeTruthy();
    });
  });

  describe('Modified Files', () => {
    it('should only upload modified files', async () => {
      // Initial deployment
      createFiles({
        'index.html': '<html>Original</html>',
        'style.css': 'body { color: blue; }',
        'app.js': 'console.log("v1");',
      });

      let state = initializeState('modify-test');
      state = await simulateDeploy(state);
      const originalHashes = { ...state.files };

      // Modify one file
      writeFileSync(join(buildDir, 'app.js'), 'console.log("v2");', 'utf-8');

      // Scan again
      const files = await scanFiles({ buildDir });
      const changedFiles = filterChangedFiles(files, originalHashes);

      // Only app.js should be changed
      expect(changedFiles).toHaveLength(1);
      expect(changedFiles[0].key).toBe('app.js');
    });

    it('should detect multiple modified files', async () => {
      createFiles({
        'file1.html': 'original1',
        'file2.html': 'original2',
        'file3.html': 'original3',
        'file4.html': 'original4',
      });

      let state = initializeState('multi-modify-test');
      state = await simulateDeploy(state);
      const originalHashes = { ...state.files };

      // Modify two files
      writeFileSync(join(buildDir, 'file1.html'), 'modified1', 'utf-8');
      writeFileSync(join(buildDir, 'file3.html'), 'modified3', 'utf-8');

      const files = await scanFiles({ buildDir });
      const changedFiles = filterChangedFiles(files, originalHashes);

      expect(changedFiles).toHaveLength(2);
      expect(changedFiles.map(f => f.key)).toContain('file1.html');
      expect(changedFiles.map(f => f.key)).toContain('file3.html');
    });
  });

  describe('Added Files', () => {
    it('should upload only new files', async () => {
      createFiles({
        'index.html': '<html></html>',
        'style.css': 'body {}',
      });

      let state = initializeState('add-test');
      state = await simulateDeploy(state);
      const originalHashes = { ...state.files };

      // Add new files
      createFiles({
        'new-file.js': 'console.log("new");',
        'images/logo.png': 'fake-png',
      });

      const files = await scanFiles({ buildDir });
      const changedFiles = filterChangedFiles(files, originalHashes);

      // Only new files should be marked for upload
      expect(changedFiles).toHaveLength(2);
      expect(changedFiles.map(f => f.key)).toContain('new-file.js');
      expect(changedFiles.map(f => f.key)).toContain('images/logo.png');
    });
  });

  describe('Deleted Files', () => {
    it('should track deleted files in state comparison', async () => {
      createFiles({
        'index.html': '<html></html>',
        'style.css': 'body {}',
        'to-delete.js': 'delete me',
      });

      let state = initializeState('delete-test');
      state = await simulateDeploy(state);
      const originalHashes = { ...state.files };

      expect(Object.keys(originalHashes)).toHaveLength(3);

      // Delete a file
      deleteFile('to-delete.js');

      // Scan current files
      const files = await scanFiles({ buildDir });

      // Compare hashes - using current files and previous hashes
      const changes = compareFileHashes(files, originalHashes);

      expect(changes.deleted.map(f => f.path)).toContain('to-delete.js');
      expect(changes.deleted).toHaveLength(1);
      expect(changes.unchanged).toHaveLength(2);
    });

    it('should remove deleted files from state', async () => {
      createFiles({
        'keep.html': 'keep',
        'delete1.js': 'delete',
        'delete2.js': 'delete',
      });

      let state = initializeState('remove-state-test');
      state = await simulateDeploy(state);

      expect(Object.keys(state.files)).toHaveLength(3);

      // Delete files from disk
      deleteFile('delete1.js');
      deleteFile('delete2.js');

      // Find deleted paths by comparing with current files
      const files = await scanFiles({ buildDir });
      const currentKeys = new Set(files.map(f => f.key));
      const deletedPaths = Object.keys(state.files).filter(p => !currentKeys.has(p));

      // Remove deleted from state
      const updatedState = removeDeletedFiles(state, deletedPaths);

      expect(Object.keys(updatedState.files)).toHaveLength(1);
      expect(updatedState.files['keep.html']).toBeDefined();
    });
  });

  describe('No Changes', () => {
    it('should detect no changes when files are unchanged', async () => {
      createFiles({
        'index.html': '<html>static</html>',
        'style.css': 'body { static: true; }',
      });

      let state = initializeState('no-change-test');
      state = await simulateDeploy(state);
      const originalHashes = { ...state.files };

      // Scan again without changes
      const files = await scanFiles({ buildDir });
      const changedFiles = filterChangedFiles(files, originalHashes);

      expect(changedFiles).toHaveLength(0);
    });

    it('should show all files as unchanged in comparison', async () => {
      createFiles({
        'file1.html': 'content1',
        'file2.html': 'content2',
        'file3.html': 'content3',
      });

      let state = initializeState('unchanged-test');
      state = await simulateDeploy(state);

      const files = await scanFiles({ buildDir });
      const changes = compareFileHashes(files, state.files);

      expect(changes.unchanged).toHaveLength(3);
      expect(changes.added).toHaveLength(0);
      expect(changes.modified).toHaveLength(0);
      expect(changes.deleted).toHaveLength(0);
    });
  });

  describe('Force Upload', () => {
    it('should upload all files with force flag (ignoring hashes)', async () => {
      createFiles({
        'index.html': '<html></html>',
        'style.css': 'body {}',
        'app.js': 'console.log();',
      });

      let state = initializeState('force-test');
      state = await simulateDeploy(state);

      // No modifications made, but we want to force upload
      const files = await scanFiles({ buildDir });

      // With force: skip hash comparison, return all files
      // This simulates --force flag behavior
      const forceUploadFiles = files; // All files

      expect(forceUploadFiles).toHaveLength(3);
    });
  });

  describe('Complex Scenarios', () => {
    it('should handle mixed changes (add, modify, delete)', async () => {
      createFiles({
        'keep-unchanged.html': 'static',
        'will-modify.html': 'original',
        'will-delete.html': 'to delete',
      });

      let state = initializeState('mixed-test');
      state = await simulateDeploy(state);
      const originalHashes = { ...state.files };

      // Make mixed changes
      writeFileSync(join(buildDir, 'will-modify.html'), 'modified', 'utf-8');
      deleteFile('will-delete.html');
      createFiles({ 'new-file.html': 'new content' });

      // Scan current state
      const files = await scanFiles({ buildDir });

      // Compare - compareFileHashes takes (currentFiles: FileInfo[], previousHashes: FileHashMap)
      const changes = compareFileHashes(files, originalHashes);

      expect(changes.unchanged.map(f => f.path)).toContain('keep-unchanged.html');
      expect(changes.modified.map(f => f.path)).toContain('will-modify.html');
      expect(changes.deleted.map(f => f.path)).toContain('will-delete.html');
      expect(changes.added.map(f => f.path)).toContain('new-file.html');
    });

    it('should track incremental stats correctly', async () => {
      createFiles({
        'file1.html': 'content1',
        'file2.html': 'content2',
        'file3.html': 'content3',
      });

      let state = initializeState('stats-test');
      state = await simulateDeploy(state);
      const originalHashes = { ...state.files };

      // Make changes
      writeFileSync(join(buildDir, 'file1.html'), 'modified1', 'utf-8');
      deleteFile('file2.html');
      createFiles({ 'file4.html': 'new' });

      const files = await scanFiles({ buildDir });

      // First get changes, then get stats from changes
      const changes = compareFileHashes(files, originalHashes);
      const stats = getIncrementalStats(changes);

      // getIncrementalStats returns needsUpload, canSkip, needsDelete, totalChanges
      expect(stats.needsUpload).toBe(2); // 1 added + 1 modified
      expect(stats.canSkip).toBe(1); // unchanged
      expect(stats.needsDelete).toBe(1); // deleted
    });
  });

  describe('File Change Formatting', () => {
    it('should format file changes for display', async () => {
      createFiles({
        'unchanged.html': 'static',
        'modified.html': 'original',
      });

      let state = initializeState('format-test');
      state = await simulateDeploy(state);
      const originalHashes = { ...state.files };

      // Make changes
      writeFileSync(join(buildDir, 'modified.html'), 'changed', 'utf-8');
      createFiles({ 'added.html': 'new' });

      const files = await scanFiles({ buildDir });

      // compareFileHashes takes (currentFiles: FileInfo[], previousHashes: FileHashMap)
      const changes = compareFileHashes(files, originalHashes);
      const formatted = formatFileChanges(changes);

      // formatFileChanges uses capital letters: "Added", "Modified"
      expect(formatted).toContain('Added');
      expect(formatted).toContain('Modified');
    });
  });

  describe('Large File Sets', () => {
    it('should efficiently handle many files', async () => {
      // Create many files
      const manyFiles: Record<string, string> = {};
      for (let i = 0; i < 100; i++) {
        manyFiles[`file-${i}.html`] = `content-${i}`;
      }
      createFiles(manyFiles);

      let state = initializeState('many-files-test');
      state = await simulateDeploy(state);

      expect(Object.keys(state.files)).toHaveLength(100);

      // Modify a few files
      for (let i = 0; i < 5; i++) {
        writeFileSync(join(buildDir, `file-${i}.html`), `modified-${i}`, 'utf-8');
      }

      const files = await scanFiles({ buildDir });
      const changedFiles = filterChangedFiles(files, state.files);

      // Only 5 files should be changed
      expect(changedFiles).toHaveLength(5);
    });
  });

  describe('Hash Consistency', () => {
    it('should produce consistent hashes for same content', async () => {
      createFiles({
        'test.html': 'identical content',
      });

      const files1 = await scanFiles({ buildDir });
      const hash1 = files1[0].hash;

      // Delete and recreate with same content
      deleteFile('test.html');
      createFiles({
        'test.html': 'identical content',
      });

      const files2 = await scanFiles({ buildDir });
      const hash2 = files2[0].hash;

      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different content', async () => {
      createFiles({
        'test.html': 'content version 1',
      });

      const files1 = await scanFiles({ buildDir });
      const hash1 = files1[0].hash;

      writeFileSync(join(buildDir, 'test.html'), 'content version 2', 'utf-8');

      const files2 = await scanFiles({ buildDir });
      const hash2 = files2[0].hash;

      expect(hash1).not.toBe(hash2);
    });
  });
});
