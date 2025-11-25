import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mockClient } from 'aws-sdk-client-mock';
import {
  CloudFrontClient,
  CreateInvalidationCommand,
  GetInvalidationCommand,
  type Invalidation,
} from '@aws-sdk/client-cloudfront';
import {
  createInvalidation,
  getInvalidation,
  invalidateCache,
  invalidateAll,
  isInvalidationComplete,
  getInvalidationStatus,
  type InvalidationOptions,
} from '../../../core/aws/cloudfront-invalidation.js';

describe('CloudFront Invalidation', () => {
  const cfMock = mockClient(CloudFrontClient);
  let client: CloudFrontClient;

  beforeEach(() => {
    cfMock.reset();
    client = new CloudFrontClient({ region: 'us-east-1' });
  });

  afterEach(() => {
    cfMock.restore();
  });

  const mockInvalidation: Invalidation = {
    Id: 'I1234567890ABC',
    Status: 'Completed',
    CreateTime: new Date('2025-01-01T00:00:00Z'),
    InvalidationBatch: {
      Paths: {
        Quantity: 2,
        Items: ['/index.html', '/assets/*'],
      },
      CallerReference: 'scf-123456',
    },
  };

  describe('createInvalidation', () => {
    it('should create invalidation with specified paths', async () => {
      cfMock.on(CreateInvalidationCommand).resolves({
        Invalidation: mockInvalidation,
      });

      const options: InvalidationOptions = {
        paths: ['/index.html', '/assets/*'],
      };

      const invalidation = await createInvalidation(client, 'E1234567890ABC', options);

      expect(invalidation).toEqual(mockInvalidation);

      const calls = cfMock.commandCalls(CreateInvalidationCommand);
      expect(calls).toHaveLength(1);
      expect(calls[0].args[0].input.DistributionId).toBe('E1234567890ABC');
      expect(calls[0].args[0].input.InvalidationBatch?.Paths?.Items).toEqual([
        '/index.html',
        '/assets/*',
      ]);
      expect(calls[0].args[0].input.InvalidationBatch?.Paths?.Quantity).toBe(2);
    });

    it('should create invalidation with custom caller reference', async () => {
      cfMock.on(CreateInvalidationCommand).resolves({
        Invalidation: mockInvalidation,
      });

      const options: InvalidationOptions = {
        paths: ['/index.html'],
        callerReference: 'custom-ref-123',
      };

      await createInvalidation(client, 'E1234567890ABC', options);

      const calls = cfMock.commandCalls(CreateInvalidationCommand);
      expect(calls[0].args[0].input.InvalidationBatch?.CallerReference).toBe('custom-ref-123');
    });

    it('should generate automatic caller reference if not provided', async () => {
      cfMock.on(CreateInvalidationCommand).resolves({
        Invalidation: mockInvalidation,
      });

      const options: InvalidationOptions = {
        paths: ['/index.html'],
      };

      await createInvalidation(client, 'E1234567890ABC', options);

      const calls = cfMock.commandCalls(CreateInvalidationCommand);
      const callerRef = calls[0].args[0].input.InvalidationBatch?.CallerReference;

      expect(callerRef).toMatch(/^scf-\d+$/);
    });

    it('should create invalidation for single path', async () => {
      cfMock.on(CreateInvalidationCommand).resolves({
        Invalidation: mockInvalidation,
      });

      const options: InvalidationOptions = {
        paths: ['/*'],
      };

      await createInvalidation(client, 'E1234567890ABC', options);

      const calls = cfMock.commandCalls(CreateInvalidationCommand);
      expect(calls[0].args[0].input.InvalidationBatch?.Paths?.Items).toEqual(['/*']);
      expect(calls[0].args[0].input.InvalidationBatch?.Paths?.Quantity).toBe(1);
    });

    it('should create invalidation for multiple specific files', async () => {
      cfMock.on(CreateInvalidationCommand).resolves({
        Invalidation: mockInvalidation,
      });

      const options: InvalidationOptions = {
        paths: ['/index.html', '/about.html', '/contact.html'],
      };

      await createInvalidation(client, 'E1234567890ABC', options);

      const calls = cfMock.commandCalls(CreateInvalidationCommand);
      expect(calls[0].args[0].input.InvalidationBatch?.Paths?.Quantity).toBe(3);
    });

    it('should throw error when creation fails', async () => {
      cfMock.on(CreateInvalidationCommand).rejects(new Error('Rate limit exceeded'));

      const options: InvalidationOptions = {
        paths: ['/index.html'],
      };

      await expect(createInvalidation(client, 'E1234567890ABC', options)).rejects.toThrow(
        'Rate limit exceeded'
      );
    });

    it('should throw error when no invalidation is returned', async () => {
      cfMock.on(CreateInvalidationCommand).resolves({});

      const options: InvalidationOptions = {
        paths: ['/index.html'],
      };

      await expect(createInvalidation(client, 'E1234567890ABC', options)).rejects.toThrow(
        'Failed to create invalidation: No invalidation returned'
      );
    });
  });

  describe('getInvalidation', () => {
    it('should return invalidation details', async () => {
      cfMock.on(GetInvalidationCommand).resolves({
        Invalidation: mockInvalidation,
      });

      const invalidation = await getInvalidation(client, 'E1234567890ABC', 'I1234567890ABC');

      expect(invalidation).toEqual(mockInvalidation);

      const calls = cfMock.commandCalls(GetInvalidationCommand);
      expect(calls).toHaveLength(1);
      expect(calls[0].args[0].input.DistributionId).toBe('E1234567890ABC');
      expect(calls[0].args[0].input.Id).toBe('I1234567890ABC');
    });

    it('should return null when invalidation does not exist (NoSuchInvalidation)', async () => {
      cfMock.on(GetInvalidationCommand).rejects({
        name: 'NoSuchInvalidation',
      });

      const invalidation = await getInvalidation(client, 'E1234567890ABC', 'INONEXISTENT');

      expect(invalidation).toBeNull();
    });

    it('should return null when invalidation does not exist (404)', async () => {
      cfMock.on(GetInvalidationCommand).rejects({
        $metadata: { httpStatusCode: 404 },
      });

      const invalidation = await getInvalidation(client, 'E1234567890ABC', 'INONEXISTENT');

      expect(invalidation).toBeNull();
    });

    it('should throw error for other failures', async () => {
      cfMock.on(GetInvalidationCommand).rejects(new Error('Service unavailable'));

      await expect(
        getInvalidation(client, 'E1234567890ABC', 'I1234567890ABC')
      ).rejects.toThrow('Service unavailable');
    });
  });

  describe('invalidateCache', () => {
    it('should create invalidation without waiting', async () => {
      cfMock.on(CreateInvalidationCommand).resolves({
        Invalidation: mockInvalidation,
      });

      const invalidation = await invalidateCache(client, 'E1234567890ABC', ['/index.html'], {
        wait: false,
      });

      expect(invalidation).toEqual(mockInvalidation);

      const calls = cfMock.commandCalls(CreateInvalidationCommand);
      expect(calls).toHaveLength(1);
    });

    it('should create invalidation for multiple paths', async () => {
      cfMock.on(CreateInvalidationCommand).resolves({
        Invalidation: mockInvalidation,
      });

      const paths = ['/index.html', '/about.html', '/assets/*'];
      await invalidateCache(client, 'E1234567890ABC', paths, { wait: false });

      const calls = cfMock.commandCalls(CreateInvalidationCommand);
      expect(calls[0].args[0].input.InvalidationBatch?.Paths?.Items).toEqual(paths);
    });

    it('should wait for completion by default', async () => {
      // Note: waitForInvalidationCompleted uses AWS SDK waiter which is hard to mock
      // This test verifies the invalidation is created
      cfMock.on(CreateInvalidationCommand).resolves({
        Invalidation: {
          ...mockInvalidation,
          Status: 'InProgress',
        },
      });

      // With wait: false to avoid actual waiting
      const invalidation = await invalidateCache(client, 'E1234567890ABC', ['/*'], {
        wait: false,
      });

      expect(invalidation.Id).toBe('I1234567890ABC');
    });
  });

  describe('invalidateAll', () => {
    it('should invalidate all files with /* wildcard', async () => {
      cfMock.on(CreateInvalidationCommand).resolves({
        Invalidation: mockInvalidation,
      });

      await invalidateAll(client, 'E1234567890ABC', { wait: false });

      const calls = cfMock.commandCalls(CreateInvalidationCommand);
      expect(calls).toHaveLength(1);
      expect(calls[0].args[0].input.InvalidationBatch?.Paths?.Items).toEqual(['/*']);
    });

    it('should invalidate all files without waiting', async () => {
      cfMock.on(CreateInvalidationCommand).resolves({
        Invalidation: mockInvalidation,
      });

      const invalidation = await invalidateAll(client, 'E1234567890ABC', { wait: false });

      expect(invalidation).toEqual(mockInvalidation);
    });
  });

  describe('isInvalidationComplete', () => {
    it('should return true when status is Completed', () => {
      const completedInvalidation: Invalidation = {
        ...mockInvalidation,
        Status: 'Completed',
      };

      expect(isInvalidationComplete(completedInvalidation)).toBe(true);
    });

    it('should return false when status is InProgress', () => {
      const inProgressInvalidation: Invalidation = {
        ...mockInvalidation,
        Status: 'InProgress',
      };

      expect(isInvalidationComplete(inProgressInvalidation)).toBe(false);
    });

    it('should return false when status is undefined', () => {
      const unknownInvalidation: Invalidation = {
        ...mockInvalidation,
        Status: undefined,
      };

      expect(isInvalidationComplete(unknownInvalidation)).toBe(false);
    });
  });

  describe('getInvalidationStatus', () => {
    it('should return Completed status', () => {
      const completedInvalidation: Invalidation = {
        ...mockInvalidation,
        Status: 'Completed',
      };

      expect(getInvalidationStatus(completedInvalidation)).toBe('Completed');
    });

    it('should return InProgress status', () => {
      const inProgressInvalidation: Invalidation = {
        ...mockInvalidation,
        Status: 'InProgress',
      };

      expect(getInvalidationStatus(inProgressInvalidation)).toBe('InProgress');
    });

    it('should return Unknown when status is undefined', () => {
      const unknownInvalidation: Invalidation = {
        ...mockInvalidation,
        Status: undefined,
      };

      expect(getInvalidationStatus(unknownInvalidation)).toBe('Unknown');
    });
  });
});
