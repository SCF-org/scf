/**
 * Environment loader tests
 */

import { describe, it, expect } from '@jest/globals';
import { getEnvFilePaths } from '../../../core/config/env-loader.js';

describe('Environment Loader', () => {

  describe('getEnvFilePaths', () => {
    it('should return correct file paths and priorities for production', () => {
      const testDir = '/test/project';
      const paths = getEnvFilePaths('prod', testDir);

      expect(paths).toHaveLength(4);

      // Highest priority first
      expect(paths[0].path).toBe(`${testDir}/.env.prod.local`);
      expect(paths[0].priority).toBe(4);

      expect(paths[1].path).toBe(`${testDir}/.env.prod`);
      expect(paths[1].priority).toBe(3);

      expect(paths[2].path).toBe(`${testDir}/.env.local`);
      expect(paths[2].priority).toBe(2);

      expect(paths[3].path).toBe(`${testDir}/.env`);
      expect(paths[3].priority).toBe(1);
    });

    it('should return correct file paths for development environment', () => {
      const testDir = '/test/project';
      const paths = getEnvFilePaths('dev', testDir);

      expect(paths).toHaveLength(4);
      expect(paths[0].path).toBe(`${testDir}/.env.dev.local`);
      expect(paths[1].path).toBe(`${testDir}/.env.dev`);
      expect(paths[2].path).toBe(`${testDir}/.env.local`);
      expect(paths[3].path).toBe(`${testDir}/.env`);
    });

    it('should return correct file paths when no environment specified', () => {
      const testDir = '/test/project';
      const paths = getEnvFilePaths(undefined, testDir);

      expect(paths).toHaveLength(2);

      expect(paths[0].path).toBe(`${testDir}/.env.local`);
      expect(paths[0].priority).toBe(2);

      expect(paths[1].path).toBe(`${testDir}/.env`);
      expect(paths[1].priority).toBe(1);
    });

    it('should handle custom environment names', () => {
      const testDir = '/test/project';
      const paths = getEnvFilePaths('staging', testDir);

      expect(paths).toHaveLength(4);
      expect(paths[0].path).toBe(`${testDir}/.env.staging.local`);
      expect(paths[1].path).toBe(`${testDir}/.env.staging`);
      expect(paths[2].path).toBe(`${testDir}/.env.local`);
      expect(paths[3].path).toBe(`${testDir}/.env`);
    });

    it('should use process.cwd() as default directory', () => {
      const cwd = process.cwd();
      const paths = getEnvFilePaths('prod');

      expect(paths[0].path).toBe(`${cwd}/.env.prod.local`);
      expect(paths[1].path).toBe(`${cwd}/.env.prod`);
    });
  });
});
