/**
 * E2E Test for Route53 DNS Management
 *
 * ⚠️  WARNING: These tests create REAL AWS resources!
 *
 * Prerequisites:
 * - AWS credentials configured (environment variables or AWS profile)
 * - Sufficient permissions to create/delete Route53 hosted zones and records
 * - Be aware that costs may be incurred (hosted zones: $0.50/month each)
 *
 * Note: These tests use fake domains (.example) that don't require actual domain ownership.
 * The hosted zones will be created but DNS won't resolve since the domain isn't real.
 *
 * Run with:
 *   E2E_TEST=true npm run test:e2e -- route53.e2e.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import {
  Route53Client,
  ListTagsForResourceCommand,
} from '@aws-sdk/client-route-53';
import { Route53Manager } from '../../../core/aws/route53-manager.js';

// Skip E2E tests unless explicitly enabled
const describeE2E = process.env.E2E_TEST === 'true' ? describe : describe.skip;

describeE2E('E2E: Route53 DNS Management', () => {
  let route53Manager: Route53Manager;
  let route53Client: Route53Client;
  const region = process.env.AWS_REGION || 'ap-northeast-2';

  // Track created hosted zones for cleanup
  const createdHostedZones: string[] = [];

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

    route53Manager = new Route53Manager({
      region,
      credentials,
    });

    route53Client = new Route53Client({
      region: 'us-east-1', // Route53 is global but client uses us-east-1
      credentials,
    });

    console.log('\n🚀 Starting Route53 E2E tests...');
    console.log(`   Region: ${region}`);
    console.log(`   Using credentials: ${credentials.accessKeyId.substring(0, 12)}...`);
    console.log('   ⚠️  Real AWS resources will be created and deleted\n');
  });

  afterAll(async () => {
    // Cleanup: Delete all test hosted zones that weren't cleaned up
    console.log('\n🧹 Cleaning up test hosted zones...');

    for (const hostedZoneId of createdHostedZones) {
      try {
        console.log(`   Deleting leftover hosted zone: ${hostedZoneId}`);
        await route53Manager.deleteHostedZone(hostedZoneId);
      } catch (error) {
        console.warn(`   Failed to cleanup hosted zone ${hostedZoneId}:`, error);
      }
    }

    console.log('✅ Cleanup complete\n');
  }, 60000);

  describe('Hosted Zone Management', () => {
    it('should create and delete a hosted zone with proper tagging', async () => {
      const testDomain = generateTestDomain();

      console.log(`   Creating hosted zone for: ${testDomain}`);

      // Create hosted zone via validateHostedZone (which auto-creates if not exists)
      const hostedZoneId = await route53Manager.validateHostedZone(
        testDomain,
        'e2e-test-app',
        'test'
      );
      createdHostedZones.push(hostedZoneId);

      expect(hostedZoneId).toBeTruthy();
      expect(hostedZoneId).toMatch(/^\/hostedzone\/Z/);

      console.log(`   ✓ Hosted zone created: ${hostedZoneId}`);

      // Verify tags
      const cleanZoneId = route53Manager.extractHostedZoneId(hostedZoneId);
      const { ResourceTagSet } = await route53Client.send(
        new ListTagsForResourceCommand({
          ResourceType: 'hostedzone',
          ResourceId: cleanZoneId,
        })
      );

      const tags = ResourceTagSet?.Tags || [];
      const tagMap = new Map(tags.map((t) => [t.Key, t.Value]));

      expect(tagMap.get('scf:managed')).toBe('true');
      expect(tagMap.get('scf:tool')).toBe('scf-deploy');
      expect(tagMap.get('scf:domain')).toBe(testDomain);
      expect(tagMap.get('scf:app')).toBe('e2e-test-app');
      expect(tagMap.get('scf:environment')).toBe('test');

      console.log('   ✓ Tags verified');

      // Delete hosted zone
      await route53Manager.deleteHostedZone(hostedZoneId);
      createdHostedZones.splice(createdHostedZones.indexOf(hostedZoneId), 1);

      console.log('   ✓ Hosted zone deleted successfully');
    }, 60000);

    it('should find existing hosted zone', async () => {
      const testDomain = generateTestDomain();

      // Create hosted zone first
      const hostedZoneId = await route53Manager.validateHostedZone(testDomain);
      createdHostedZones.push(hostedZoneId);

      // Try to find it
      const foundZone = await route53Manager.findHostedZone(testDomain);

      expect(foundZone).toBeTruthy();
      expect(foundZone?.Id).toBe(hostedZoneId);
      expect(foundZone?.Name).toBe(`${testDomain}.`);

      console.log(`   ✓ Found hosted zone: ${foundZone?.Id}`);

      // Cleanup
      await route53Manager.deleteHostedZone(hostedZoneId);
      createdHostedZones.splice(createdHostedZones.indexOf(hostedZoneId), 1);
    }, 60000);

    it('should get name servers for hosted zone', async () => {
      const testDomain = generateTestDomain();

      // Create hosted zone
      const hostedZoneId = await route53Manager.validateHostedZone(testDomain);
      createdHostedZones.push(hostedZoneId);

      // Get name servers
      const nameServers = await route53Manager.getNameServers(hostedZoneId);

      expect(nameServers).toBeInstanceOf(Array);
      expect(nameServers.length).toBe(4); // AWS always assigns 4 name servers
      expect(nameServers[0]).toMatch(/^ns-\d+\.awsdns-\d+\./);

      console.log(`   ✓ Name servers retrieved: ${nameServers.length} servers`);
      nameServers.forEach((ns) => console.log(`     - ${ns}`));

      // Cleanup
      await route53Manager.deleteHostedZone(hostedZoneId);
      createdHostedZones.splice(createdHostedZones.indexOf(hostedZoneId), 1);
    }, 60000);

    it('should return null for non-existent hosted zone', async () => {
      const nonExistentDomain = 'this-domain-does-not-exist-12345.example';

      const zone = await route53Manager.findHostedZone(nonExistentDomain);

      expect(zone).toBeNull();
      console.log('   ✓ Correctly returned null for non-existent domain');
    }, 30000);
  });

  describe('DNS Record Management', () => {
    let testDomain: string;
    let hostedZoneId: string;

    beforeAll(async () => {
      testDomain = generateTestDomain();
      console.log(`   Setting up test hosted zone: ${testDomain}`);

      hostedZoneId = await route53Manager.validateHostedZone(testDomain);
      createdHostedZones.push(hostedZoneId);
    }, 60000);

    afterAll(async () => {
      console.log(`   Tearing down test hosted zone: ${testDomain}`);
      try {
        await route53Manager.deleteHostedZone(hostedZoneId);
        createdHostedZones.splice(createdHostedZones.indexOf(hostedZoneId), 1);
      } catch (error) {
        console.warn('   Failed to delete test hosted zone:', error);
      }
    }, 60000);

    it('should create A/AAAA CloudFront alias records', async () => {
      const subdomain = `www.${testDomain}`;
      const cloudfrontDomain = 'd123456abcdef8.cloudfront.net';
      const cleanZoneId = route53Manager.extractHostedZoneId(hostedZoneId);

      console.log(`   Creating A/AAAA alias records for: ${subdomain}`);

      await route53Manager.createCloudFrontAliasRecords(
        cleanZoneId,
        subdomain,
        cloudfrontDomain
      );

      console.log(`   ✓ A/AAAA alias records created for ${subdomain} → ${cloudfrontDomain}`);
    }, 30000);

    it('should create CNAME record', async () => {
      const subdomain = `cdn.${testDomain}`;
      const cloudfrontDomain = 'd987654fedcba1.cloudfront.net';
      const cleanZoneId = route53Manager.extractHostedZoneId(hostedZoneId);

      console.log(`   Creating CNAME record for: ${subdomain}`);

      await route53Manager.createCloudfrontAlias(
        cleanZoneId,
        subdomain,
        cloudfrontDomain
      );

      console.log(`   ✓ CNAME record created: ${subdomain} → ${cloudfrontDomain}`);
    }, 30000);

    it('should create multiple DNS records at once', async () => {
      const cleanZoneId = route53Manager.extractHostedZoneId(hostedZoneId);

      const records = [
        { name: `api.${testDomain}`, type: 'CNAME', value: 'api-server.example.com', ttl: 300 },
        { name: `mail.${testDomain}`, type: 'CNAME', value: 'mail.example.com', ttl: 300 },
      ];

      console.log(`   Creating ${records.length} DNS records...`);

      await route53Manager.createRecords(cleanZoneId, records);

      console.log(`   ✓ Created ${records.length} DNS records`);
    }, 30000);

    it('should update existing record with UPSERT', async () => {
      const subdomain = `update-test.${testDomain}`;
      const cleanZoneId = route53Manager.extractHostedZoneId(hostedZoneId);

      // Create initial record
      await route53Manager.createRecords(cleanZoneId, [
        { name: subdomain, type: 'CNAME', value: 'initial.example.com', ttl: 300 },
      ]);

      console.log(`   Created initial record for: ${subdomain}`);

      // Update (UPSERT) the record
      await route53Manager.createRecords(cleanZoneId, [
        { name: subdomain, type: 'CNAME', value: 'updated.example.com', ttl: 600 },
      ]);

      console.log(`   ✓ Record updated via UPSERT`);
    }, 30000);
  });

  describe('Error Handling', () => {
    it('should throw error for subdomain without parent zone', async () => {
      // This is a subdomain of a non-existent parent domain
      const subdomain = 'www.nonexistent-parent-12345.example';

      await expect(
        route53Manager.validateHostedZone(subdomain)
      ).rejects.toThrow(/No hosted zone found/);

      console.log('   ✓ Correctly threw error for subdomain without parent zone');
    }, 30000);
  });
});
