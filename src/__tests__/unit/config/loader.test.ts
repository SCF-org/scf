import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { findConfigFile, loadConfigFile, discoverAndLoadConfig } from '../../../core/config/loader.js';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('Config Loader', () => {
  let testDir: string;

  beforeEach(() => {
    // Create a unique temporary directory for each test
    testDir = join(tmpdir(), `scf-test-${Date.now()}-${Math.random().toString(36).substring(7)}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    // Clean up test directory
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('findConfigFile', () => {
    it('should find scf.config.ts in current directory', () => {
      const configPath = join(testDir, 'scf.config.ts');
      writeFileSync(configPath, 'export default {}');

      const found = findConfigFile(testDir);
      expect(found).toBe(configPath);
    });

    it('should find scf.config.js in current directory', () => {
      const configPath = join(testDir, 'scf.config.js');
      writeFileSync(configPath, 'module.exports = {}');

      const found = findConfigFile(testDir);
      expect(found).toBe(configPath);
    });

    it('should prioritize .ts over .js', () => {
      const tsConfigPath = join(testDir, 'scf.config.ts');
      const jsConfigPath = join(testDir, 'scf.config.js');
      writeFileSync(tsConfigPath, 'export default {}');
      writeFileSync(jsConfigPath, 'module.exports = {}');

      const found = findConfigFile(testDir);
      expect(found).toBe(tsConfigPath);
    });

    it('should search in parent directories', () => {
      const subDir = join(testDir, 'subdir', 'nested');
      mkdirSync(subDir, { recursive: true });

      const configPath = join(testDir, 'scf.config.ts');
      writeFileSync(configPath, 'export default {}');

      const found = findConfigFile(subDir);
      expect(found).toBe(configPath);
    });

    it('should return null if no config file found', () => {
      const found = findConfigFile(testDir);
      expect(found).toBeNull();
    });

    it('should find scf.config.mjs', () => {
      const configPath = join(testDir, 'scf.config.mjs');
      writeFileSync(configPath, 'export default {}');

      const found = findConfigFile(testDir);
      expect(found).toBe(configPath);
    });

    it('should find scf.config.cjs', () => {
      const configPath = join(testDir, 'scf.config.cjs');
      writeFileSync(configPath, 'module.exports = {}');

      const found = findConfigFile(testDir);
      expect(found).toBe(configPath);
    });
  });

  describe('loadConfigFile', () => {
    it('should load a basic TypeScript config with default export', async () => {
      const configPath = join(testDir, 'scf.config.ts');
      writeFileSync(
        configPath,
        `
        export default {
          app: 'test-app',
          region: 'us-east-1',
          s3: {
            bucketName: 'test-bucket',
            buildDir: './dist',
          },
        };
        `
      );

      const config = await loadConfigFile(configPath);
      expect(config.app).toBe('test-app');
      expect(config.region).toBe('us-east-1');
    });

    it('should load a config with defineConfig helper', async () => {
      const configPath = join(testDir, 'scf.config.ts');
      writeFileSync(
        configPath,
        `
        import { defineConfig } from '${join(process.cwd(), 'src/types/config.js').replace(/\\/g, '\\\\')}';

        export default defineConfig({
          app: 'test-app-helper',
          region: 'us-east-1',
          s3: {
            bucketName: 'test-bucket',
            buildDir: './dist',
          },
        });
        `
      );

      const config = await loadConfigFile(configPath);
      expect(config.app).toBe('test-app-helper');
    });

    it('should load a JavaScript config', async () => {
      const configPath = join(testDir, 'scf.config.js');
      writeFileSync(
        configPath,
        `
        module.exports = {
          app: 'test-app-js',
          region: 'us-east-1',
          s3: {
            bucketName: 'test-bucket',
            buildDir: './dist',
          },
        };
        `
      );

      const config = await loadConfigFile(configPath);
      expect(config.app).toBe('test-app-js');
    });

    it('should load a config exported as a function', async () => {
      const configPath = join(testDir, 'scf.config.ts');
      writeFileSync(
        configPath,
        `
        export default function() {
          return {
            app: 'test-app-fn',
            region: 'us-east-1',
            s3: {
              bucketName: 'test-bucket',
              buildDir: './dist',
            },
          };
        }
        `
      );

      const config = await loadConfigFile(configPath);
      expect(config.app).toBe('test-app-fn');
    });

    it('should load a config with default function export', async () => {
      const configPath = join(testDir, 'scf.config.ts');
      writeFileSync(
        configPath,
        `
        export default () => ({
          app: 'test-app-arrow',
          region: 'us-east-1',
          s3: {
            bucketName: 'test-bucket',
            buildDir: './dist',
          },
        });
        `
      );

      const config = await loadConfigFile(configPath);
      expect(config.app).toBe('test-app-arrow');
    });

    it('should throw error if config file does not exist', async () => {
      const configPath = join(testDir, 'nonexistent.config.ts');

      await expect(loadConfigFile(configPath)).rejects.toThrow(
        'Config file not found'
      );
    });

    it('should throw error if config file has syntax errors', async () => {
      const configPath = join(testDir, 'scf.config.ts');
      writeFileSync(configPath, 'invalid typescript syntax {{{');

      await expect(loadConfigFile(configPath)).rejects.toThrow(
        'Failed to load config file'
      );
    });

    it('should handle ESM syntax (import/export)', async () => {
      const configPath = join(testDir, 'scf.config.mjs');
      writeFileSync(
        configPath,
        `
        export default {
          app: 'test-app-esm',
          region: 'us-east-1',
          s3: {
            bucketName: 'test-bucket',
            buildDir: './dist',
          },
        };
        `
      );

      const config = await loadConfigFile(configPath);
      expect(config.app).toBe('test-app-esm');
    });

    it('should handle CommonJS syntax (require/module.exports)', async () => {
      const configPath = join(testDir, 'scf.config.cjs');
      writeFileSync(
        configPath,
        `
        module.exports = {
          app: 'test-app-cjs',
          region: 'us-east-1',
          s3: {
            bucketName: 'test-bucket',
            buildDir: './dist',
          },
        };
        `
      );

      const config = await loadConfigFile(configPath);
      expect(config.app).toBe('test-app-cjs');
    });
  });

  describe('discoverAndLoadConfig', () => {
    it('should discover and load config from current directory', async () => {
      const configPath = join(testDir, 'scf.config.ts');
      writeFileSync(
        configPath,
        `
        export default {
          app: 'test-app-discover',
          region: 'us-east-1',
          s3: {
            bucketName: 'test-bucket',
            buildDir: './dist',
          },
        };
        `
      );

      const result = await discoverAndLoadConfig(testDir);
      expect(result.config.app).toBe('test-app-discover');
      expect(result.configPath).toBe(configPath);
    });

    it('should discover config from parent directory', async () => {
      const subDir = join(testDir, 'subdir');
      mkdirSync(subDir, { recursive: true });

      const configPath = join(testDir, 'scf.config.ts');
      writeFileSync(
        configPath,
        `
        export default {
          app: 'test-app-parent',
          region: 'us-east-1',
          s3: {
            bucketName: 'test-bucket',
            buildDir: './dist',
          },
        };
        `
      );

      const result = await discoverAndLoadConfig(subDir);
      expect(result.config.app).toBe('test-app-parent');
      expect(result.configPath).toBe(configPath);
    });

    it('should throw error if no config file found', async () => {
      await expect(discoverAndLoadConfig(testDir)).rejects.toThrow(
        'Config file not found'
      );
    });

    it('should provide helpful error message with file names', async () => {
      try {
        await discoverAndLoadConfig(testDir);
        fail('Should have thrown an error');
      } catch (error) {
        if (error instanceof Error) {
          expect(error.message).toContain('scf.config.ts');
          expect(error.message).toContain('scf.config.js');
        }
      }
    });
  });

  describe('Config file priority', () => {
    it('should load .ts config when multiple formats exist', async () => {
      // Create multiple config files
      writeFileSync(
        join(testDir, 'scf.config.ts'),
        `export default { app: 'from-ts', region: 'us-east-1', s3: { bucketName: 'test', buildDir: './dist' } };`
      );
      writeFileSync(
        join(testDir, 'scf.config.js'),
        `module.exports = { app: 'from-js', region: 'us-east-1', s3: { bucketName: 'test', buildDir: './dist' } };`
      );
      writeFileSync(
        join(testDir, 'scf.config.mjs'),
        `export default { app: 'from-mjs', region: 'us-east-1', s3: { bucketName: 'test', buildDir: './dist' } };`
      );

      const result = await discoverAndLoadConfig(testDir);
      expect(result.config.app).toBe('from-ts');
    });

    it('should load .js config when .ts does not exist', async () => {
      writeFileSync(
        join(testDir, 'scf.config.js'),
        `module.exports = { app: 'from-js', region: 'us-east-1', s3: { bucketName: 'test', buildDir: './dist' } };`
      );
      writeFileSync(
        join(testDir, 'scf.config.mjs'),
        `export default { app: 'from-mjs', region: 'us-east-1', s3: { bucketName: 'test', buildDir: './dist' } };`
      );

      const result = await discoverAndLoadConfig(testDir);
      expect(result.config.app).toBe('from-js');
    });
  });
});
