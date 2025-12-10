/**
 * Config Loading Integration Tests
 *
 * Tests configuration loading and merging:
 * - scf.config.ts auto-discovery
 * - Environment-specific config merging
 * - .env file loading
 * - CLI option overrides
 * - Zod validation errors
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  findConfigFile,
  loadConfigFile,
  discoverAndLoadConfig,
} from '../../core/config/loader.js';
import {
  mergeEnvironment,
  applyProfileOverride,
} from '../../core/config/merger.js';
import { validateConfig } from '../../core/config/schema.js';
import type { SCFConfig } from '../../types/config.js';

describe('Config Loading Integration', () => {
  let testDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    testDir = mkdtempSync(join(tmpdir(), 'scf-config-'));
    process.chdir(testDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  /**
   * Helper to create config file
   */
  function createConfigFile(content: string, fileName = 'scf.config.ts'): string {
    const configPath = join(testDir, fileName);
    writeFileSync(configPath, content, 'utf-8');
    return configPath;
  }

  describe('Config File Discovery', () => {
    it('should discover scf.config.ts in current directory', () => {
      createConfigFile(`
        export default {
          app: 'discovery-test',
          region: 'ap-northeast-2',
          s3: { bucketName: 'test-bucket', buildDir: './dist' },
        };
      `);

      const configPath = findConfigFile(testDir);
      expect(configPath).toBeTruthy();
      expect(configPath).toContain('scf.config.ts');
    });

    it('should discover scf.config.js as fallback', () => {
      writeFileSync(
        join(testDir, 'scf.config.js'),
        `module.exports = {
          app: 'js-config-test',
          region: 'ap-northeast-2',
          s3: { bucketName: 'test-bucket', buildDir: './dist' },
        };`,
        'utf-8'
      );

      const configPath = findConfigFile(testDir);
      expect(configPath).toContain('scf.config.js');
    });

    it('should prefer .ts over .js when both exist', () => {
      createConfigFile(`export default { app: 'ts-version' };`);
      writeFileSync(
        join(testDir, 'scf.config.js'),
        `module.exports = { app: 'js-version' };`,
        'utf-8'
      );

      const configPath = findConfigFile(testDir);
      expect(configPath).toContain('scf.config.ts');
    });

    it('should search parent directories', () => {
      // Create config in parent directory
      createConfigFile(`
        export default {
          app: 'parent-config',
          region: 'us-east-1',
          s3: { bucketName: 'parent-bucket', buildDir: './dist' },
        };
      `);

      // Create subdirectory
      const subDir = join(testDir, 'sub', 'directory');
      mkdirSync(subDir, { recursive: true });

      // Find from subdirectory
      const configPath = findConfigFile(subDir);
      expect(configPath).toBeTruthy();
      expect(configPath).toContain(testDir);
    });

    it('should return null when no config exists', () => {
      const configPath = findConfigFile(testDir);
      expect(configPath).toBeNull();
    });
  });

  describe('Config File Loading', () => {
    it('should load valid TypeScript config', async () => {
      const configPath = createConfigFile(`
        export default {
          app: 'ts-load-test',
          region: 'ap-northeast-2',
          s3: {
            bucketName: 'ts-bucket',
            buildDir: './build',
            indexDocument: 'index.html',
          },
        };
      `);

      const config = await loadConfigFile(configPath);

      expect(config.app).toBe('ts-load-test');
      expect(config.region).toBe('ap-northeast-2');
      expect(config.s3?.bucketName).toBe('ts-bucket');
    });

    it('should load config with function export', async () => {
      const configPath = createConfigFile(`
        export default () => ({
          app: 'function-config',
          region: 'us-west-2',
          s3: { bucketName: 'func-bucket', buildDir: './dist' },
        });
      `);

      const config = await loadConfigFile(configPath);
      expect(config.app).toBe('function-config');
    });

    it('should handle named default export', async () => {
      const configPath = createConfigFile(`
        const config = {
          app: 'named-export',
          region: 'eu-west-1',
          s3: { bucketName: 'named-bucket', buildDir: './dist' },
        };
        export default config;
      `);

      const config = await loadConfigFile(configPath);
      expect(config.app).toBe('named-export');
    });

    it('should throw error for non-existent file', async () => {
      const fakePath = join(testDir, 'nonexistent.config.ts');

      await expect(loadConfigFile(fakePath)).rejects.toThrow('Config file not found');
    });

    it('should throw error for invalid TypeScript', async () => {
      const configPath = createConfigFile(`
        export default {
          invalid typescript syntax {{
      `);

      await expect(loadConfigFile(configPath)).rejects.toThrow();
    });
  });

  describe('Environment-specific Config Merging', () => {
    it('should merge environment config with base', () => {
      const baseConfig: SCFConfig = {
        app: 'env-merge-test',
        region: 'ap-northeast-2',
        s3: {
          bucketName: 'base-bucket',
          buildDir: './dist',
          indexDocument: 'index.html',
        },
        environments: {
          dev: {
            s3: { bucketName: 'dev-bucket' },
          },
          prod: {
            s3: { bucketName: 'prod-bucket' },
            region: 'us-east-1',
          },
        },
      };

      const devConfig = mergeEnvironment(baseConfig, 'dev');
      expect(devConfig.s3?.bucketName).toBe('dev-bucket');
      expect(devConfig.region).toBe('ap-northeast-2'); // Inherited from base

      const prodConfig = mergeEnvironment(baseConfig, 'prod');
      expect(prodConfig.s3?.bucketName).toBe('prod-bucket');
      expect(prodConfig.region).toBe('us-east-1'); // Overridden
    });

    it('should deep merge nested objects', () => {
      const baseConfig: SCFConfig = {
        app: 'deep-merge-test',
        region: 'ap-northeast-2',
        s3: {
          bucketName: 'base-bucket',
          buildDir: './dist',
          indexDocument: 'index.html',
          errorDocument: '404.html',
        },
        environments: {
          staging: {
            s3: {
              bucketName: 'staging-bucket',
              // indexDocument and errorDocument should be inherited
            },
          },
        },
      };

      const stagingConfig = mergeEnvironment(baseConfig, 'staging');

      expect(stagingConfig.s3?.bucketName).toBe('staging-bucket');
      expect(stagingConfig.s3?.indexDocument).toBe('index.html');
      expect(stagingConfig.s3?.errorDocument).toBe('404.html');
    });

    it('should return base config when no environment specified', () => {
      const baseConfig: SCFConfig = {
        app: 'no-env-test',
        region: 'us-east-1',
        s3: { bucketName: 'default-bucket', buildDir: './dist' },
        environments: {
          prod: { s3: { bucketName: 'prod-bucket' } },
        },
      };

      const config = mergeEnvironment(baseConfig);

      expect(config.s3?.bucketName).toBe('default-bucket');
      expect((config as { environments?: unknown }).environments).toBeUndefined();
    });

    it('should throw error for unknown environment', () => {
      const baseConfig: SCFConfig = {
        app: 'unknown-env-test',
        region: 'us-east-1',
        s3: { bucketName: 'bucket', buildDir: './dist' },
        environments: {
          dev: {},
          prod: {},
        },
      };

      expect(() => mergeEnvironment(baseConfig, 'staging')).toThrow(
        'Environment "staging" not found'
      );
    });

    it('should remove environments field from merged config', () => {
      const baseConfig: SCFConfig = {
        app: 'remove-env-test',
        region: 'us-east-1',
        s3: { bucketName: 'bucket', buildDir: './dist' },
        environments: {
          prod: { region: 'ap-northeast-2' },
        },
      };

      const merged = mergeEnvironment(baseConfig, 'prod');

      expect((merged as { environments?: unknown }).environments).toBeUndefined();
    });
  });

  describe('Profile Override', () => {
    it('should apply profile override to config', () => {
      const config: SCFConfig = {
        app: 'profile-test',
        region: 'us-east-1',
        s3: { bucketName: 'bucket', buildDir: './dist' },
      };

      const withProfile = applyProfileOverride(config, 'my-profile');

      expect(withProfile.credentials?.profile).toBe('my-profile');
    });

    it('should override existing profile', () => {
      const config: SCFConfig = {
        app: 'profile-override-test',
        region: 'us-east-1',
        s3: { bucketName: 'bucket', buildDir: './dist' },
        credentials: { profile: 'original-profile' },
      };

      const withProfile = applyProfileOverride(config, 'new-profile');

      expect(withProfile.credentials?.profile).toBe('new-profile');
    });

    it('should not modify config when no override provided', () => {
      const config: SCFConfig = {
        app: 'no-override-test',
        region: 'us-east-1',
        s3: { bucketName: 'bucket', buildDir: './dist' },
        credentials: { profile: 'keep-this' },
      };

      const result = applyProfileOverride(config);

      expect(result.credentials?.profile).toBe('keep-this');
    });
  });

  describe('Zod Validation', () => {
    it('should validate correct config', () => {
      const config = {
        app: 'valid-app',
        region: 'ap-northeast-2',
        s3: {
          bucketName: 'valid-bucket-name',
          buildDir: './dist',
        },
      };

      const result = validateConfig(config);
      expect(result.app).toBe('valid-app');
    });

    it('should reject missing required fields', () => {
      const config = {
        app: 'incomplete-app',
        // Missing region and s3
      };

      expect(() => validateConfig(config)).toThrow();
    });

    it('should reject invalid app name', () => {
      const config = {
        app: 'Invalid App Name With Spaces!',
        region: 'us-east-1',
        s3: { bucketName: 'bucket', buildDir: './dist' },
      };

      expect(() => validateConfig(config)).toThrow();
    });

    it('should reject invalid bucket name', () => {
      const config = {
        app: 'valid-app',
        region: 'us-east-1',
        s3: {
          bucketName: 'INVALID_BUCKET_NAME', // uppercase not allowed
          buildDir: './dist',
        },
      };

      expect(() => validateConfig(config)).toThrow();
    });

    it('should validate CloudFront config', () => {
      const config = {
        app: 'cf-config-test',
        region: 'ap-northeast-2',
        s3: { bucketName: 'bucket', buildDir: './dist' },
        cloudfront: {
          priceClass: 'PriceClass_100',
        },
      };

      const result = validateConfig(config);
      expect(result.cloudfront?.priceClass).toBe('PriceClass_100');
    });

    it('should apply default values', () => {
      const config = {
        app: 'defaults-test',
        region: 'us-east-1',
        s3: {
          bucketName: 'bucket',
          buildDir: './dist',
          // indexDocument should default to 'index.html'
        },
      };

      const result = validateConfig(config);
      expect(result.s3.indexDocument).toBe('index.html');
    });
  });

  describe('Complete Config Loading Flow', () => {
    it('should discover, load, and validate config', async () => {
      createConfigFile(`
        export default {
          app: 'full-flow-test',
          region: 'ap-northeast-2',
          s3: {
            bucketName: 'flow-test-bucket',
            buildDir: './dist',
            indexDocument: 'index.html',
            errorDocument: '404.html',
          },
          cloudfront: {
            priceClass: 'PriceClass_100',
          },
        };
      `);

      const { config, configPath } = await discoverAndLoadConfig(testDir);

      expect(configPath).toContain('scf.config.ts');
      expect(config.app).toBe('full-flow-test');
      expect(config.s3?.bucketName).toBe('flow-test-bucket');
      expect(config.cloudfront?.priceClass).toBe('PriceClass_100');
    });

    it('should throw error when no config found', async () => {
      await expect(discoverAndLoadConfig(testDir)).rejects.toThrow(
        'Config file not found'
      );
    });

    it('should load config with environments and merge', async () => {
      createConfigFile(`
        export default {
          app: 'env-flow-test',
          region: 'ap-northeast-2',
          s3: {
            bucketName: 'base-bucket',
            buildDir: './dist',
          },
          environments: {
            dev: {
              s3: { bucketName: 'dev-flow-bucket' },
            },
            prod: {
              s3: { bucketName: 'prod-flow-bucket' },
              region: 'us-east-1',
            },
          },
        };
      `);

      const { config } = await discoverAndLoadConfig(testDir);

      // Merge with dev environment
      const devConfig = mergeEnvironment(config, 'dev');
      expect(devConfig.s3?.bucketName).toBe('dev-flow-bucket');
      expect(devConfig.region).toBe('ap-northeast-2');

      // Merge with prod environment
      const prodConfig = mergeEnvironment(config, 'prod');
      expect(prodConfig.s3?.bucketName).toBe('prod-flow-bucket');
      expect(prodConfig.region).toBe('us-east-1');
    });
  });

  describe('Config with Custom Domain', () => {
    it('should validate custom domain configuration', () => {
      // Schema uses certificateArn and aliases (not autoCreateCertificate and alternativeNames)
      const config = {
        app: 'custom-domain-test',
        region: 'ap-northeast-2',
        s3: { bucketName: 'domain-bucket', buildDir: './dist' },
        cloudfront: {
          enabled: true,
          customDomain: {
            domainName: 'example.com',
            certificateArn: 'arn:aws:acm:us-east-1:123456789012:certificate/abc-123',
          },
        },
      };

      const result = validateConfig(config);
      expect(result.cloudfront?.customDomain?.domainName).toBe('example.com');
      expect(result.cloudfront?.customDomain?.certificateArn).toBe('arn:aws:acm:us-east-1:123456789012:certificate/abc-123');
    });

    it('should validate aliases for custom domain', () => {
      // Schema uses 'aliases' instead of 'alternativeNames'
      const config = {
        app: 'alt-domain-test',
        region: 'ap-northeast-2',
        s3: { bucketName: 'alt-bucket', buildDir: './dist' },
        cloudfront: {
          enabled: true,
          customDomain: {
            domainName: 'example.com',
            aliases: ['www.example.com', 'api.example.com'],
          },
        },
      };

      const result = validateConfig(config);
      expect(result.cloudfront?.customDomain?.aliases).toContain('www.example.com');
    });
  });
});
