/**
 * E2E Test for ACM (AWS Certificate Manager)
 *
 * ⚠️  WARNING: These tests create REAL AWS resources!
 *
 * Prerequisites:
 * - AWS credentials configured (environment variables or AWS profile)
 * - Sufficient permissions to create/delete ACM certificates
 *
 * Note: These tests use fake domains (.example) that don't require actual domain ownership.
 * Certificates will be created in PENDING_VALIDATION status since DNS validation
 * cannot complete without a real domain.
 *
 * Run with:
 *   E2E_TEST=true npm run test:e2e -- acm.e2e.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import {
  ACMClient,
  DescribeCertificateCommand,
  ListTagsForCertificateCommand,
  CertificateStatus,
} from '@aws-sdk/client-acm';
import { ACMManager } from '../../../core/aws/acm-manager.js';

// Skip E2E tests unless explicitly enabled
const describeE2E = process.env.E2E_TEST === 'true' ? describe : describe.skip;

describeE2E('E2E: ACM Certificate Management', () => {
  let acmManager: ACMManager;
  let acmClient: ACMClient;

  // Track created certificates for cleanup
  const createdCertificates: string[] = [];

  // Helper to generate unique test domain
  const generateTestDomain = () => {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);
    return `scf-e2e-${timestamp}-${random}.example`;
  };

  beforeAll(() => {
    // Directly read credentials from environment variables
    const credentials = {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    };

    acmManager = new ACMManager({
      credentials,
    });

    // ACM must use us-east-1 for CloudFront certificates
    acmClient = new ACMClient({
      region: 'us-east-1',
      credentials,
    });

    console.log('\n🚀 Starting ACM E2E tests...');
    console.log('   Region: us-east-1 (required for CloudFront)');
    console.log(`   Using credentials: ${credentials.accessKeyId.substring(0, 12)}...`);
    console.log('   ⚠️  Real AWS resources will be created and deleted\n');
  });

  afterAll(async () => {
    // Cleanup: Delete all test certificates that weren't cleaned up
    console.log('\n🧹 Cleaning up test certificates...');

    for (const certificateArn of createdCertificates) {
      try {
        console.log(`   Deleting leftover certificate: ${certificateArn.split('/').pop()}`);
        await acmManager.deleteCertificate(certificateArn);
      } catch (error) {
        console.warn(`   Failed to cleanup certificate:`, error);
      }
    }

    console.log('✅ Cleanup complete\n');
  }, 60000);

  describe('Certificate Request', () => {
    it('should request a new certificate with DNS validation', async () => {
      const testDomain = generateTestDomain();

      console.log(`   Requesting certificate for: ${testDomain}`);

      const certificateArn = await acmManager.requestCertificate(
        testDomain,
        undefined, // no alternative names
        'e2e-test-app',
        'test'
      );
      createdCertificates.push(certificateArn);

      expect(certificateArn).toBeTruthy();
      expect(certificateArn).toMatch(/^arn:aws:acm:us-east-1:\d+:certificate\//);

      console.log(`   ✓ Certificate requested: ${certificateArn.split('/').pop()}`);

      // Wait for AWS to fully propagate certificate information
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // Verify certificate status is PENDING_VALIDATION
      const { Certificate } = await acmClient.send(
        new DescribeCertificateCommand({
          CertificateArn: certificateArn,
        })
      );

      expect(Certificate?.Status).toBe(CertificateStatus.PENDING_VALIDATION);
      expect(Certificate?.DomainName).toBe(testDomain);

      console.log(`   ✓ Certificate status: ${Certificate?.Status}`);

      // Cleanup
      await acmManager.deleteCertificate(certificateArn);
      createdCertificates.splice(createdCertificates.indexOf(certificateArn), 1);

      console.log('   ✓ Certificate deleted successfully');
    }, 60000);

    it('should request certificate with alternative names', async () => {
      const testDomain = generateTestDomain();
      const altNames = [`www.${testDomain}`, `api.${testDomain}`];

      console.log(`   Requesting certificate with SANs for: ${testDomain}`);

      const certificateArn = await acmManager.requestCertificate(
        testDomain,
        altNames,
        'e2e-test-app',
        'test'
      );
      createdCertificates.push(certificateArn);

      // Wait for AWS to fully propagate certificate information
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // Verify alternative names
      const { Certificate } = await acmClient.send(
        new DescribeCertificateCommand({
          CertificateArn: certificateArn,
        })
      );

      const sans = Certificate?.SubjectAlternativeNames || [];
      expect(sans).toContain(testDomain);
      expect(sans).toContain(`www.${testDomain}`);
      expect(sans).toContain(`api.${testDomain}`);

      console.log(`   ✓ Certificate has ${sans.length} SANs`);

      // Cleanup
      await acmManager.deleteCertificate(certificateArn);
      createdCertificates.splice(createdCertificates.indexOf(certificateArn), 1);
    }, 60000);

    it('should add proper tags to certificate', async () => {
      const testDomain = generateTestDomain();

      const certificateArn = await acmManager.requestCertificate(
        testDomain,
        undefined,
        'e2e-test-app',
        'test'
      );
      createdCertificates.push(certificateArn);

      // Verify tags
      const { Tags } = await acmClient.send(
        new ListTagsForCertificateCommand({
          CertificateArn: certificateArn,
        })
      );

      const tagMap = new Map((Tags || []).map((t) => [t.Key, t.Value]));

      expect(tagMap.get('scf:managed')).toBe('true');
      expect(tagMap.get('scf:tool')).toBe('scf-deploy');
      expect(tagMap.get('scf:domain')).toBe(testDomain);
      expect(tagMap.get('scf:auto-created')).toBe('true');
      expect(tagMap.get('scf:app')).toBe('e2e-test-app');
      expect(tagMap.get('scf:environment')).toBe('test');

      console.log('   ✓ Tags verified');

      // Cleanup
      await acmManager.deleteCertificate(certificateArn);
      createdCertificates.splice(createdCertificates.indexOf(certificateArn), 1);
    }, 60000);
  });

  describe('DNS Validation Records', () => {
    it('should retrieve DNS validation records or show DomainValidationOptions', async () => {
      const testDomain = generateTestDomain();

      const certificateArn = await acmManager.requestCertificate(testDomain);
      createdCertificates.push(certificateArn);

      // Retry logic for getting validation records
      // Note: AWS may not generate full DNS validation records for fake TLDs (.example)
      console.log('   Waiting for validation records to be available...');
      let validationRecords: { name: string; type: string; value: string }[] = [];
      const maxRetries = 6;
      const retryDelay = 5000; // 5 seconds (total max wait: 30 seconds)

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
        try {
          validationRecords = await acmManager.getCertificateValidationRecords(certificateArn);
          if (validationRecords.length > 0) {
            console.log(`   ✓ Validation records available after attempt ${attempt} (~${attempt * 5}s)`);
            break;
          }
        } catch (error) {
          console.log(`   Attempt ${attempt}/${maxRetries}: Records not yet available (waited ${attempt * 5}s)`);
        }
      }

      // Get raw certificate data to verify domain validation options exist
      const details = await acmManager.getCertificateDetails(certificateArn);
      const domainValidationOptions = details.DomainValidationOptions || [];

      console.log(`   Certificate has ${domainValidationOptions.length} DomainValidationOptions`);
      domainValidationOptions.forEach((opt, i) => {
        console.log(`     Option ${i + 1}: Domain=${opt.DomainName}, ValidationStatus=${opt.ValidationStatus}`);
        if (opt.ResourceRecord) {
          console.log(`       ResourceRecord: ${opt.ResourceRecord.Name} -> ${opt.ResourceRecord.Value}`);
        } else {
          console.log(`       ResourceRecord: Not yet available`);
        }
      });

      // Test passes if DomainValidationOptions exist (even without full ResourceRecord)
      // This is expected for fake domains like .example
      expect(domainValidationOptions.length).toBeGreaterThan(0);
      expect(domainValidationOptions[0].DomainName).toBe(testDomain);

      // If ResourceRecords are available, verify their structure
      if (validationRecords.length > 0) {
        const record = validationRecords[0];
        expect(record.name).toBeTruthy();
        expect(record.type).toBe('CNAME');
        expect(record.value).toBeTruthy();
        console.log(`   ✓ Retrieved ${validationRecords.length} validation record(s)`);
      } else {
        console.log('   ⚠️  ResourceRecords not available for fake domain (expected for .example TLD)');
      }

      // Cleanup
      await acmManager.deleteCertificate(certificateArn);
      createdCertificates.splice(createdCertificates.indexOf(certificateArn), 1);
    }, 90000);
  });

  describe('Certificate Lookup', () => {
    it('should return null for non-existent certificate', async () => {
      const nonExistentDomain = 'this-domain-has-no-cert-12345.example';

      const certificateArn = await acmManager.findExistingCertificate(nonExistentDomain);

      expect(certificateArn).toBeNull();
      console.log('   ✓ Correctly returned null for non-existent certificate');
    }, 30000);

    // Note: We cannot easily test findExistingCertificate with a real certificate
    // because certificates need to be ISSUED, which requires actual domain validation
  });

  describe('Certificate Validation Status', () => {
    it('should report certificate as not valid when pending validation', async () => {
      const testDomain = generateTestDomain();

      console.log(`   Requesting certificate for: ${testDomain}`);
      const certificateArn = await acmManager.requestCertificate(testDomain);
      createdCertificates.push(certificateArn);
      console.log(`   Certificate ARN: ${certificateArn}`);

      // Wait a moment for AWS to fully initialize the certificate
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const isValid = await acmManager.isCertificateValid(certificateArn);

      expect(isValid).toBe(false); // PENDING_VALIDATION is not valid

      console.log('   ✓ Correctly reported certificate as not valid (pending validation)');

      // Cleanup
      await acmManager.deleteCertificate(certificateArn);
      createdCertificates.splice(createdCertificates.indexOf(certificateArn), 1);
      console.log('   ✓ Certificate deleted');
    }, 60000);

    it('should get certificate details', async () => {
      const testDomain = generateTestDomain();

      console.log(`   Requesting certificate for: ${testDomain}`);
      const certificateArn = await acmManager.requestCertificate(testDomain);
      createdCertificates.push(certificateArn);

      // Wait a moment for AWS to fully initialize the certificate
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const details = await acmManager.getCertificateDetails(certificateArn);

      console.log(`   Certificate ARN: ${certificateArn}`);
      console.log(`   Details received: ${JSON.stringify(details, null, 2).substring(0, 200)}...`);

      expect(details).toBeTruthy();
      expect(details.CertificateArn).toBe(certificateArn);
      expect(details.DomainName).toBe(testDomain);
      expect(details.Status).toBe(CertificateStatus.PENDING_VALIDATION);
      expect(details.Type).toBe('AMAZON_ISSUED');

      console.log('   ✓ Certificate details retrieved');
      console.log(`     Domain: ${details.DomainName}`);
      console.log(`     Status: ${details.Status}`);
      console.log(`     Type: ${details.Type}`);

      // Cleanup
      await acmManager.deleteCertificate(certificateArn);
      createdCertificates.splice(createdCertificates.indexOf(certificateArn), 1);
    }, 60000);
  });

  describe('Certificate Deletion', () => {
    it('should delete a certificate', async () => {
      const testDomain = generateTestDomain();

      const certificateArn = await acmManager.requestCertificate(testDomain);

      console.log(`   Deleting certificate: ${certificateArn.split('/').pop()}`);

      await acmManager.deleteCertificate(certificateArn);

      // Verify certificate is deleted (describe should fail)
      await expect(
        acmClient.send(
          new DescribeCertificateCommand({
            CertificateArn: certificateArn,
          })
        )
      ).rejects.toThrow();

      console.log('   ✓ Certificate deleted and verified');
    }, 60000);
  });
});
