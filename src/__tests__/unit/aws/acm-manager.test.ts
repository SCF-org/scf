/**
 * ACM Manager Tests
 */

import { ACMManager } from '../../../core/aws/acm-manager.js';
import { mockClient } from 'aws-sdk-client-mock';
import { ACMClient, ListCertificatesCommand, RequestCertificateCommand } from '@aws-sdk/client-acm';

const acmMock = mockClient(ACMClient);

describe('ACMManager', () => {
  beforeEach(() => {
    acmMock.reset();
  });

  describe('constructor', () => {
    it('should create ACM manager with us-east-1 region', () => {
      const manager = new ACMManager();
      expect(manager).toBeInstanceOf(ACMManager);
    });
  });

  describe('findExistingCertificate', () => {
    it('should return null when no certificates exist', async () => {
      acmMock.on(ListCertificatesCommand).resolves({
        CertificateSummaryList: [],
      });

      const manager = new ACMManager();
      const result = await manager.findExistingCertificate('example.com');

      expect(result).toBeNull();
    });

    it('should find certificate by domain name', async () => {
      acmMock.on(ListCertificatesCommand).resolves({
        CertificateSummaryList: [
          {
            DomainName: 'example.com',
            CertificateArn: 'arn:aws:acm:us-east-1:123456789012:certificate/abc-123',
          },
        ],
      });

      const manager = new ACMManager();
      const result = await manager.findExistingCertificate('example.com');

      expect(result).toBe('arn:aws:acm:us-east-1:123456789012:certificate/abc-123');
    });
  });

  describe('requestCertificate', () => {
    it('should request certificate with DNS validation', async () => {
      const certificateArn = 'arn:aws:acm:us-east-1:123456789012:certificate/new-cert';

      acmMock.on(RequestCertificateCommand).resolves({
        CertificateArn: certificateArn,
      });

      const manager = new ACMManager();
      const result = await manager.requestCertificate('example.com');

      expect(result).toBe(certificateArn);
    });

    it('should throw error when certificate ARN is not returned', async () => {
      acmMock.on(RequestCertificateCommand).resolves({
        CertificateArn: undefined,
      });

      const manager = new ACMManager();

      await expect(manager.requestCertificate('example.com')).rejects.toThrow(
        'Failed to request certificate: No ARN returned'
      );
    });
  });
});
