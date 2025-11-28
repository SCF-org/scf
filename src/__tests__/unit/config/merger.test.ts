import { describe, it, expect } from '@jest/globals';
import { mergeEnvironment, applyProfileOverride } from '../../../core/config/merger.js';
import type { SCFConfig } from '../../../types/config.js';

describe('Config Merger', () => {
  describe('mergeEnvironment', () => {
    it('should return base config when no environment is specified', () => {
      const baseConfig: SCFConfig = {
        app: 'test-app',
        region: 'us-east-1',
        s3: {
          bucketName: 'test-bucket',
          buildDir: './dist',
        },
        environments: {
          dev: {
            app: 'test-app-dev',
            region: 'us-east-1',
            s3: { bucketName: 'test-bucket-dev', buildDir: './dist' },
          },
        },
      };

      const result = mergeEnvironment(baseConfig);
      expect(result.app).toBe('test-app');
      expect(result.s3?.bucketName).toBe('test-bucket');
      expect(result.environments).toBeUndefined();
    });

    it('should merge environment-specific config', () => {
      const baseConfig: SCFConfig = {
        app: 'test-app',
        region: 'us-east-1',
        s3: {
          bucketName: 'test-bucket',
          buildDir: './dist',
        },
        environments: {
          dev: {
            app: 'test-app',
            region: 'us-east-1',
            s3: { bucketName: 'test-bucket-dev', buildDir: './dist' },
          },
        },
      };

      const result = mergeEnvironment(baseConfig, 'dev');
      expect(result.app).toBe('test-app');
      expect(result.s3?.bucketName).toBe('test-bucket-dev');
      expect(result.environments).toBeUndefined();
    });

    it('should override only specified fields', () => {
      const baseConfig: SCFConfig = {
        app: 'test-app',
        region: 'us-east-1',
        s3: {
          bucketName: 'test-bucket',
          buildDir: './dist',
          indexDocument: 'index.html',
          concurrency: 10,
        },
        environments: {
          prod: {
            app: 'test-app',
            region: 'us-east-1',
            s3: {
              bucketName: 'test-bucket-prod',
              buildDir: './dist',
              concurrency: 50,
            },
          },
        },
      };

      const result = mergeEnvironment(baseConfig, 'prod');
      expect(result.s3?.bucketName).toBe('test-bucket-prod');
      expect(result.s3?.concurrency).toBe(50);
      expect(result.s3?.indexDocument).toBe('index.html'); // Should preserve base value
    });

    it('should deep merge nested objects', () => {
      const baseConfig: SCFConfig = {
        app: 'test-app',
        region: 'us-east-1',
        s3: {
          bucketName: 'test-bucket',
          buildDir: './dist',
        },
        cloudfront: {
          enabled: true,
          priceClass: 'PriceClass_100',
          ipv6: true,
        },
        environments: {
          prod: {
            app: 'test-app',
            region: 'us-east-1',
            s3: { bucketName: 'test-bucket', buildDir: './dist' },
            cloudfront: {
              enabled: true,
              priceClass: 'PriceClass_All',
              // ipv6 is not overridden
            },
          },
        },
      };

      const result = mergeEnvironment(baseConfig, 'prod');
      expect(result.cloudfront?.priceClass).toBe('PriceClass_All');
      expect(result.cloudfront?.ipv6).toBe(true); // Should preserve base value
      expect(result.cloudfront?.enabled).toBe(true);
    });

    it('should throw error if environment does not exist', () => {
      const baseConfig: SCFConfig = {
        app: 'test-app',
        region: 'us-east-1',
        s3: {
          bucketName: 'test-bucket',
          buildDir: './dist',
        },
        environments: {
          dev: {
            app: 'test-app',
            region: 'us-east-1',
            s3: { bucketName: 'test-bucket-dev', buildDir: './dist' },
          },
        },
      };

      expect(() => mergeEnvironment(baseConfig, 'nonexistent')).toThrow(
        'Environment "nonexistent" not found'
      );
    });

    it('should list available environments in error message', () => {
      const baseConfig: SCFConfig = {
        app: 'test-app',
        region: 'us-east-1',
        s3: {
          bucketName: 'test-bucket',
          buildDir: './dist',
        },
        environments: {
          dev: {
            app: 'test-app',
            region: 'us-east-1',
            s3: { bucketName: 'test-bucket-dev', buildDir: './dist' },
          },
          staging: {
            app: 'test-app',
            region: 'us-east-1',
            s3: { bucketName: 'test-bucket-staging', buildDir: './dist' },
          },
          prod: {
            app: 'test-app',
            region: 'us-east-1',
            s3: { bucketName: 'test-bucket-prod', buildDir: './dist' },
          },
        },
      };

      try {
        mergeEnvironment(baseConfig, 'test');
        fail('Should have thrown an error');
      } catch (error) {
        if (error instanceof Error) {
          expect(error.message).toContain('Available environments');
          expect(error.message).toContain('dev');
          expect(error.message).toContain('staging');
          expect(error.message).toContain('prod');
        }
      }
    });

    it('should handle configs without environments field', () => {
      const baseConfig: SCFConfig = {
        app: 'test-app',
        region: 'us-east-1',
        s3: {
          bucketName: 'test-bucket',
          buildDir: './dist',
        },
      };

      const result = mergeEnvironment(baseConfig);
      expect(result.app).toBe('test-app');
      expect(result.s3?.bucketName).toBe('test-bucket');
    });

    it('should merge CloudFront custom domain configuration', () => {
      const baseConfig: SCFConfig = {
        app: 'test-app',
        region: 'us-east-1',
        s3: {
          bucketName: 'test-bucket',
          buildDir: './dist',
        },
        cloudfront: {
          enabled: true,
          customDomain: {
            domainName: 'dev.example.com',
            certificateArn: 'arn:aws:acm:us-east-1:123456789012:certificate/dev',
          },
        },
        environments: {
          prod: {
            app: 'test-app',
            region: 'us-east-1',
            s3: { bucketName: 'test-bucket', buildDir: './dist' },
            cloudfront: {
              enabled: true,
              customDomain: {
                domainName: 'www.example.com',
                certificateArn: 'arn:aws:acm:us-east-1:123456789012:certificate/prod',
              },
            },
          },
        },
      };

      const result = mergeEnvironment(baseConfig, 'prod');
      expect(result.cloudfront?.customDomain?.domainName).toBe('www.example.com');
      expect(result.cloudfront?.customDomain?.certificateArn).toContain('certificate/prod');
    });

    it('should replace arrays instead of merging them', () => {
      const baseConfig: SCFConfig = {
        app: 'test-app',
        region: 'us-east-1',
        s3: {
          bucketName: 'test-bucket',
          buildDir: './dist',
          exclude: ['*.map', '*.md'],
        },
        environments: {
          prod: {
            app: 'test-app',
            region: 'us-east-1',
            s3: {
              bucketName: 'test-bucket',
              buildDir: './dist',
              exclude: ['*.test.js'],
            },
          },
        },
      };

      const result = mergeEnvironment(baseConfig, 'prod');
      expect(result.s3?.exclude).toEqual(['*.test.js']); // Should replace, not merge
      expect(result.s3?.exclude?.length).toBe(1);
    });

    it('should handle multiple levels of nested objects', () => {
      const baseConfig: SCFConfig = {
        app: 'test-app',
        region: 'us-east-1',
        s3: {
          bucketName: 'test-bucket',
          buildDir: './dist',
        },
        cloudfront: {
          enabled: true,
          customDomain: {
            domainName: 'dev.example.com',
            certificateArn: 'arn:aws:acm:us-east-1:123456789012:certificate/dev',
            aliases: ['www.dev.example.com'],
          },
        },
        environments: {
          prod: {
            app: 'test-app',
            region: 'us-east-1',
            s3: { bucketName: 'test-bucket', buildDir: './dist' },
            cloudfront: {
              enabled: true,
              customDomain: {
                domainName: 'www.example.com',
                aliases: ['example.com', 'www.example.com'],
              },
            },
          },
        },
      };

      const result = mergeEnvironment(baseConfig, 'prod');
      expect(result.cloudfront?.customDomain?.domainName).toBe('www.example.com');
      // certificateArn should be preserved from base
      expect(result.cloudfront?.customDomain?.certificateArn).toContain('certificate/dev');
      // aliases should be replaced
      expect(result.cloudfront?.customDomain?.aliases).toEqual(['example.com', 'www.example.com']);
    });
  });

  describe('applyProfileOverride', () => {
    it('should return config unchanged when no profile override', () => {
      const config: SCFConfig = {
        app: 'test-app',
        region: 'us-east-1',
        s3: {
          bucketName: 'test-bucket',
          buildDir: './dist',
        },
      };

      const result = applyProfileOverride(config);
      expect(result).toEqual(config);
    });

    it('should add profile to credentials', () => {
      const config: SCFConfig = {
        app: 'test-app',
        region: 'us-east-1',
        s3: {
          bucketName: 'test-bucket',
          buildDir: './dist',
        },
      };

      const result = applyProfileOverride(config, 'my-aws-profile');
      expect(result.credentials?.profile).toBe('my-aws-profile');
    });

    it('should override existing profile', () => {
      const config: SCFConfig = {
        app: 'test-app',
        region: 'us-east-1',
        s3: {
          bucketName: 'test-bucket',
          buildDir: './dist',
        },
        credentials: {
          profile: 'default',
        },
      };

      const result = applyProfileOverride(config, 'production');
      expect(result.credentials?.profile).toBe('production');
    });

    it('should preserve existing credentials', () => {
      const config: SCFConfig = {
        app: 'test-app',
        region: 'us-east-1',
        s3: {
          bucketName: 'test-bucket',
          buildDir: './dist',
        },
        credentials: {
          profile: 'default',
          accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
          secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
        },
      };

      const result = applyProfileOverride(config, 'production');
      expect(result.credentials?.profile).toBe('production');
      expect(result.credentials?.accessKeyId).toBe('AKIAIOSFODNN7EXAMPLE');
      expect(result.credentials?.secretAccessKey).toBe('wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY');
    });

    it('should not modify other config fields', () => {
      const config: SCFConfig = {
        app: 'test-app',
        region: 'us-east-1',
        s3: {
          bucketName: 'test-bucket',
          buildDir: './dist',
        },
        cloudfront: {
          enabled: true,
        },
      };

      const result = applyProfileOverride(config, 'production');
      expect(result.app).toBe('test-app');
      expect(result.region).toBe('us-east-1');
      expect(result.s3).toEqual(config.s3);
      expect(result.cloudfront).toEqual(config.cloudfront);
    });
  });
});
