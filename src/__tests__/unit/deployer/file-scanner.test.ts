import { describe, it, expect } from '@jest/globals';
import {
  scanFiles,
  calculateFileHash,
  filterChangedFiles,
  groupFilesByCompression,
} from '../../../core/deployer/file-scanner.js';
import { join } from 'node:path';
import type { FileInfo } from '../../../types/deployer.js';

describe('File Scanner', () => {
  const fixturesDir = join(process.cwd(), 'src/__tests__/fixtures/files');

  describe('scanFiles', () => {
    it('should scan all files in directory', async () => {
      const files = await scanFiles({ buildDir: fixturesDir });

      expect(files.length).toBeGreaterThan(0);
      expect(files.some((f) => f.relativePath.includes('index.html'))).toBe(true);
      expect(files.some((f) => f.relativePath.includes('styles.css'))).toBe(true);
      expect(files.some((f) => f.relativePath.includes('main.js'))).toBe(true);
    });

    it('should calculate SHA-256 hash for each file', async () => {
      const files = await scanFiles({ buildDir: fixturesDir });

      for (const file of files) {
        expect(file.hash).toBeDefined();
        expect(file.hash.length).toBe(64); // SHA-256 is 64 hex characters
      }
    });

    it('should detect content types correctly', async () => {
      const files = await scanFiles({ buildDir: fixturesDir });

      const htmlFile = files.find((f) => f.relativePath.includes('index.html'));
      expect(htmlFile?.contentType).toBe('text/html');

      const cssFile = files.find((f) => f.relativePath.includes('styles.css'));
      expect(cssFile?.contentType).toBe('text/css');

      const jsFile = files.find((f) => f.relativePath.includes('main.js'));
      expect(jsFile?.contentType).toMatch(/javascript/);
    });

    it('should mark text files for gzip compression', async () => {
      const files = await scanFiles({ buildDir: fixturesDir });

      const htmlFile = files.find((f) => f.relativePath.includes('index.html'));
      expect(htmlFile?.shouldGzip).toBe(true);

      const cssFile = files.find((f) => f.relativePath.includes('styles.css'));
      expect(cssFile?.shouldGzip).toBe(true);

      const jsFile = files.find((f) => f.relativePath.includes('main.js'));
      expect(jsFile?.shouldGzip).toBe(true);
    });

    it('should not mark binary files for gzip compression', async () => {
      const files = await scanFiles({ buildDir: fixturesDir });

      const pngFile = files.find((f) => f.relativePath.includes('logo.png'));
      if (pngFile) {
        expect(pngFile.shouldGzip).toBe(false);
      }
    });

    it('should convert paths to S3 keys with forward slashes', async () => {
      const files = await scanFiles({ buildDir: fixturesDir });

      for (const file of files) {
        // S3 keys should use forward slashes
        expect(file.key).not.toContain('\\');
        // Should not start with slash
        expect(file.key).not.toMatch(/^\//);
      }
    });

    it('should exclude files matching exclude patterns', async () => {
      const files = await scanFiles({
        buildDir: fixturesDir,
        exclude: ['*.png'],
      });

      const pngFile = files.find((f) => f.relativePath.includes('.png'));
      expect(pngFile).toBeUndefined();
    });

    it('should include file size', async () => {
      const files = await scanFiles({ buildDir: fixturesDir });

      for (const file of files) {
        expect(file.size).toBeGreaterThanOrEqual(0);
        expect(typeof file.size).toBe('number');
      }
    });

    it('should include absolute and relative paths', async () => {
      const files = await scanFiles({ buildDir: fixturesDir });

      for (const file of files) {
        expect(file.absolutePath).toContain(fixturesDir);
        expect(file.relativePath).not.toContain(fixturesDir);
      }
    });

    it('should handle empty directory', async () => {
      const { mkdtempSync } = await import('node:fs');
      const { tmpdir } = await import('node:os');
      const emptyDir = mkdtempSync(join(tmpdir(), 'scf-test-empty-'));

      const files = await scanFiles({ buildDir: emptyDir });
      expect(files).toEqual([]);

      // Cleanup
      const { rmSync } = await import('node:fs');
      rmSync(emptyDir, { recursive: true });
    });
  });

  describe('calculateFileHash', () => {
    it('should calculate SHA-256 hash for a file', async () => {
      const filePath = join(fixturesDir, 'index.html');
      const hash = await calculateFileHash(filePath);

      expect(hash).toBeDefined();
      expect(hash.length).toBe(64);
      expect(hash).toMatch(/^[a-f0-9]+$/);
    });

    it('should return same hash for same file content', async () => {
      const filePath = join(fixturesDir, 'index.html');
      const hash1 = await calculateFileHash(filePath);
      const hash2 = await calculateFileHash(filePath);

      expect(hash1).toBe(hash2);
    });

    it('should return different hashes for different files', async () => {
      const file1 = join(fixturesDir, 'index.html');
      const file2 = join(fixturesDir, 'main.js');

      const hash1 = await calculateFileHash(file1);
      const hash2 = await calculateFileHash(file2);

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('filterChangedFiles', () => {
    const mockFiles: FileInfo[] = [
      {
        absolutePath: '/path/to/file1.html',
        relativePath: 'file1.html',
        key: 'file1.html',
        size: 100,
        hash: 'hash1',
        contentType: 'text/html',
        shouldGzip: true,
      },
      {
        absolutePath: '/path/to/file2.css',
        relativePath: 'file2.css',
        key: 'file2.css',
        size: 200,
        hash: 'hash2',
        contentType: 'text/css',
        shouldGzip: true,
      },
      {
        absolutePath: '/path/to/file3.js',
        relativePath: 'file3.js',
        key: 'file3.js',
        size: 300,
        hash: 'hash3',
        contentType: 'application/javascript',
        shouldGzip: true,
      },
    ];

    it('should return all files when no existing hashes', () => {
      const changed = filterChangedFiles(mockFiles, {});
      expect(changed.length).toBe(3);
      expect(changed).toEqual(mockFiles);
    });

    it('should return only changed files', () => {
      const existingHashes = {
        'file1.html': 'hash1', // Same hash - not changed
        'file2.css': 'old-hash', // Different hash - changed
        // file3.js not in existing - new file
      };

      const changed = filterChangedFiles(mockFiles, existingHashes);
      expect(changed.length).toBe(2);
      expect(changed.find((f) => f.key === 'file1.html')).toBeUndefined();
      expect(changed.find((f) => f.key === 'file2.css')).toBeDefined();
      expect(changed.find((f) => f.key === 'file3.js')).toBeDefined();
    });

    it('should return empty array when all files unchanged', () => {
      const existingHashes = {
        'file1.html': 'hash1',
        'file2.css': 'hash2',
        'file3.js': 'hash3',
      };

      const changed = filterChangedFiles(mockFiles, existingHashes);
      expect(changed).toEqual([]);
    });

    it('should treat new files as changed', () => {
      const existingHashes = {
        'other-file.html': 'some-hash',
      };

      const changed = filterChangedFiles(mockFiles, existingHashes);
      expect(changed.length).toBe(3);
    });
  });

  describe('groupFilesByCompression', () => {
    const mockFiles: FileInfo[] = [
      {
        absolutePath: '/path/to/file1.html',
        relativePath: 'file1.html',
        key: 'file1.html',
        size: 100,
        hash: 'hash1',
        contentType: 'text/html',
        shouldGzip: true,
      },
      {
        absolutePath: '/path/to/file2.png',
        relativePath: 'file2.png',
        key: 'file2.png',
        size: 200,
        hash: 'hash2',
        contentType: 'image/png',
        shouldGzip: false,
      },
      {
        absolutePath: '/path/to/file3.js',
        relativePath: 'file3.js',
        key: 'file3.js',
        size: 300,
        hash: 'hash3',
        contentType: 'application/javascript',
        shouldGzip: true,
      },
      {
        absolutePath: '/path/to/file4.jpg',
        relativePath: 'file4.jpg',
        key: 'file4.jpg',
        size: 400,
        hash: 'hash4',
        contentType: 'image/jpeg',
        shouldGzip: false,
      },
    ];

    it('should group files by compression flag', () => {
      const { gzipped, plain } = groupFilesByCompression(mockFiles);

      expect(gzipped.length).toBe(2);
      expect(plain.length).toBe(2);
    });

    it('should correctly identify gzipped files', () => {
      const { gzipped } = groupFilesByCompression(mockFiles);

      expect(gzipped.find((f) => f.key === 'file1.html')).toBeDefined();
      expect(gzipped.find((f) => f.key === 'file3.js')).toBeDefined();
    });

    it('should correctly identify plain files', () => {
      const { plain } = groupFilesByCompression(mockFiles);

      expect(plain.find((f) => f.key === 'file2.png')).toBeDefined();
      expect(plain.find((f) => f.key === 'file4.jpg')).toBeDefined();
    });

    it('should handle all gzipped files', () => {
      const allGzipped = mockFiles.map((f) => ({ ...f, shouldGzip: true }));
      const { gzipped, plain } = groupFilesByCompression(allGzipped);

      expect(gzipped.length).toBe(4);
      expect(plain.length).toBe(0);
    });

    it('should handle all plain files', () => {
      const allPlain = mockFiles.map((f) => ({ ...f, shouldGzip: false }));
      const { gzipped, plain } = groupFilesByCompression(allPlain);

      expect(gzipped.length).toBe(0);
      expect(plain.length).toBe(4);
    });

    it('should handle empty array', () => {
      const { gzipped, plain } = groupFilesByCompression([]);

      expect(gzipped).toEqual([]);
      expect(plain).toEqual([]);
    });
  });

  describe('Content Type Detection', () => {
    it('should detect common file types', async () => {
      const testCases = [
        { file: 'index.html', expected: 'text/html' },
        { file: 'styles.css', expected: 'text/css' },
        { file: 'main.js', expected: /javascript/ },
      ];

      const files = await scanFiles({ buildDir: fixturesDir });

      for (const testCase of testCases) {
        const file = files.find((f) => f.relativePath.includes(testCase.file));
        if (file) {
          if (typeof testCase.expected === 'string') {
            expect(file.contentType).toBe(testCase.expected);
          } else {
            expect(file.contentType).toMatch(testCase.expected);
          }
        }
      }
    });
  });

  describe('Gzip Detection', () => {
    it('should identify gzippable text files', async () => {
      const files = await scanFiles({ buildDir: fixturesDir });

      const textFiles = ['.html', '.css', '.js'];
      for (const file of files) {
        const isTextFile = textFiles.some((ext) => file.relativePath.endsWith(ext));
        if (isTextFile) {
          expect(file.shouldGzip).toBe(true);
        }
      }
    });

    it('should not gzip binary files', async () => {
      const files = await scanFiles({ buildDir: fixturesDir });

      const binaryFiles = ['.png', '.jpg', '.jpeg', '.gif', '.zip', '.pdf'];
      for (const file of files) {
        const isBinaryFile = binaryFiles.some((ext) => file.relativePath.endsWith(ext));
        if (isBinaryFile) {
          expect(file.shouldGzip).toBe(false);
        }
      }
    });
  });
});
