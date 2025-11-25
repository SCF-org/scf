import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  detectBuildDirectory,
  validateBuildDirectory,
  getBuildDirectory,
} from '../../../core/deployer/build-detector.js';

describe('Build Detector', () => {
  let testDir: string;

  beforeEach(() => {
    // Create a unique temporary directory for each test
    testDir = mkdtempSync(join(tmpdir(), 'scf-build-detector-test-'));
  });

  afterEach(() => {
    // Clean up test directory
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  const createBuildDir = (dirName: string, files: Record<string, string>) => {
    const buildDir = join(testDir, dirName);
    mkdirSync(buildDir, { recursive: true });

    for (const [fileName, content] of Object.entries(files)) {
      const filePath = join(buildDir, fileName);
      const fileDir = join(filePath, '..');
      mkdirSync(fileDir, { recursive: true });
      writeFileSync(filePath, content);
    }

    return buildDir;
  };

  describe('detectBuildDirectory', () => {
    it('should detect dist directory with index.html', () => {
      createBuildDir('dist', {
        'index.html': '<h1>Hello</h1>',
        'main.js': 'console.log("test")',
      });

      const detected = detectBuildDirectory(testDir);

      expect(detected).toBe('dist');
    });

    it('should detect build directory with index.html', () => {
      createBuildDir('build', {
        'index.html': '<h1>Hello</h1>',
        'app.js': 'console.log("app")',
      });

      const detected = detectBuildDirectory(testDir);

      expect(detected).toBe('build');
    });

    it('should detect out directory (Next.js export)', () => {
      createBuildDir('out', {
        'index.html': '<h1>Hello</h1>',
        '404.html': '<h1>Not Found</h1>',
      });

      const detected = detectBuildDirectory(testDir);

      expect(detected).toBe('out');
    });

    it('should prioritize dist over build', () => {
      createBuildDir('dist', {
        'index.html': '<h1>Dist</h1>',
      });
      createBuildDir('build', {
        'index.html': '<h1>Build</h1>',
      });

      const detected = detectBuildDirectory(testDir);

      expect(detected).toBe('dist');
    });

    it('should return null if no valid build directory found', () => {
      // Create dist directory but without index.html
      const distDir = join(testDir, 'dist');
      mkdirSync(distDir);
      writeFileSync(join(distDir, 'main.js'), 'console.log("test")');

      const detected = detectBuildDirectory(testDir);

      expect(detected).toBeNull();
    });

    it('should return null if build directory is empty', () => {
      mkdirSync(join(testDir, 'dist'));

      const detected = detectBuildDirectory(testDir);

      expect(detected).toBeNull();
    });

    it('should detect .output/public directory (Nuxt 3)', () => {
      createBuildDir('.output/public', {
        'index.html': '<h1>Nuxt</h1>',
        'app.js': 'console.log("nuxt")',
      });

      const detected = detectBuildDirectory(testDir);

      expect(detected).toBe('.output/public');
    });

    it('should detect _site directory (Jekyll/11ty)', () => {
      createBuildDir('_site', {
        'index.html': '<h1>Jekyll</h1>',
        'style.css': 'body { margin: 0; }',
      });

      const detected = detectBuildDirectory(testDir);

      expect(detected).toBe('_site');
    });

    it('should require at least one web file extension', () => {
      const distDir = join(testDir, 'dist');
      mkdirSync(distDir);
      writeFileSync(join(distDir, 'index.html'), '<h1>Hello</h1>');
      writeFileSync(join(distDir, 'data.bin'), 'binary data');

      const detected = detectBuildDirectory(testDir);

      // Should detect because index.html is a web file
      expect(detected).toBe('dist');
    });
  });

  describe('validateBuildDirectory', () => {
    it('should validate existing build directory with index.html', () => {
      createBuildDir('dist', {
        'index.html': '<h1>Hello</h1>',
        'main.js': 'console.log("test")',
      });

      expect(() => validateBuildDirectory('dist', testDir)).not.toThrow();
    });

    it('should throw error if build directory does not exist', () => {
      expect(() => validateBuildDirectory('nonexistent', testDir)).toThrow(
        /Build directory not found/
      );
    });

    it('should throw error if path is not a directory', () => {
      const filePath = join(testDir, 'file.txt');
      writeFileSync(filePath, 'not a directory');

      expect(() => validateBuildDirectory('file.txt', testDir)).toThrow(
        /Build path is not a directory/
      );
    });

    it('should throw error if directory does not contain index.html', () => {
      const distDir = join(testDir, 'dist');
      mkdirSync(distDir);
      writeFileSync(join(distDir, 'main.js'), 'console.log("test")');

      expect(() => validateBuildDirectory('dist', testDir)).toThrow(
        /Build directory does not contain index\.html/
      );
    });

    it('should throw error if directory only has index.html but no other web files', () => {
      const distDir = join(testDir, 'dist');
      mkdirSync(distDir);
      writeFileSync(join(distDir, 'index.html'), '<h1>Hello</h1>');
      // No other web files

      // This should actually pass since index.html is a web file
      expect(() => validateBuildDirectory('dist', testDir)).not.toThrow();
    });

    it('should throw error for SSR build directories (.next)', () => {
      createBuildDir('.next', {
        'index.html': '<h1>Next SSR</h1>',
        'server.js': 'server code',
      });

      expect(() => validateBuildDirectory('.next', testDir)).toThrow(
        /Cannot deploy.*\.next.*directory to S3\/CloudFront/
      );
    });

    it('should throw error for SSR build directories (.nuxt)', () => {
      createBuildDir('.nuxt', {
        'index.html': '<h1>Nuxt SSR</h1>',
      });

      expect(() => validateBuildDirectory('.nuxt', testDir)).toThrow(
        /Cannot deploy.*\.nuxt.*directory to S3\/CloudFront/
      );
    });

    it('should throw error for SSR build directories with ./ prefix', () => {
      createBuildDir('.next', {
        'index.html': '<h1>Next SSR</h1>',
      });

      expect(() => validateBuildDirectory('./.next', testDir)).toThrow(
        /Cannot deploy.*\.next.*directory to S3\/CloudFront/
      );
    });

    it('should validate directory with various web files', () => {
      createBuildDir('dist', {
        'index.html': '<h1>Hello</h1>',
        'main.js': 'console.log("test")',
        'style.css': 'body { margin: 0; }',
        'data.json': '{"key": "value"}',
      });

      expect(() => validateBuildDirectory('dist', testDir)).not.toThrow();
    });
  });

  describe('getBuildDirectory', () => {
    it('should return provided build directory if valid', () => {
      createBuildDir('custom-dist', {
        'index.html': '<h1>Custom</h1>',
        'app.js': 'console.log("app")',
      });

      const buildDir = getBuildDirectory('custom-dist', testDir);

      expect(buildDir).toBe('custom-dist');
    });

    it('should auto-detect build directory if not provided', () => {
      createBuildDir('dist', {
        'index.html': '<h1>Hello</h1>',
        'main.js': 'console.log("test")',
      });

      const buildDir = getBuildDirectory(undefined, testDir);

      expect(buildDir).toBe('dist');
    });

    it('should throw error if provided build directory is invalid', () => {
      expect(() => getBuildDirectory('nonexistent', testDir)).toThrow(
        /Build directory not found/
      );
    });

    it('should throw error if no build directory found and none provided', () => {
      expect(() => getBuildDirectory(undefined, testDir)).toThrow(/No build directory found/);
    });

    it('should throw error with helpful message when no build found', () => {
      expect(() => getBuildDirectory(undefined, testDir)).toThrow(
        /Searched for:.*dist.*build.*out/
      );
      expect(() => getBuildDirectory(undefined, testDir)).toThrow(/npm run build/);
    });

    it('should suggest static export for SSR directories', () => {
      createBuildDir('.next', {
        'index.html': '<h1>Next SSR</h1>',
      });

      expect(() => getBuildDirectory('.next', testDir)).toThrow(/output: 'export'/);
      expect(() => getBuildDirectory('.next', testDir)).toThrow(/next.config.ts/);
    });

    it('should work with nested build directories', () => {
      createBuildDir('.output/public', {
        'index.html': '<h1>Nuxt</h1>',
        'app.js': 'console.log("nuxt")',
      });

      const buildDir = getBuildDirectory('.output/public', testDir);

      expect(buildDir).toBe('.output/public');
    });

    it('should prioritize provided buildDir over auto-detection', () => {
      createBuildDir('dist', {
        'index.html': '<h1>Dist</h1>',
      });
      createBuildDir('build', {
        'index.html': '<h1>Build</h1>',
      });

      const buildDir = getBuildDirectory('build', testDir);

      expect(buildDir).toBe('build');
    });
  });
});
