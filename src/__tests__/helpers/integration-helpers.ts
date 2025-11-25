/**
 * Integration Test Helpers
 *
 * Common utilities for integration tests that use:
 * - Real filesystem (temp directories)
 * - Mocked AWS SDK
 */

import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mockClient, AwsClientStub } from 'aws-sdk-client-mock';
import {
  S3Client,
  HeadBucketCommand,
  CreateBucketCommand,
  PutBucketWebsiteCommand,
  PutBucketPolicyCommand,
  DeletePublicAccessBlockCommand,
  PutBucketTaggingCommand,
  PutObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
  DeleteBucketCommand,
} from '@aws-sdk/client-s3';
import {
  CloudFrontClient,
  CreateDistributionCommand,
  GetDistributionCommand,
  UpdateDistributionCommand,
  CreateInvalidationCommand,
  DeleteDistributionCommand,
  GetDistributionConfigCommand,
} from '@aws-sdk/client-cloudfront';
import {
  ACMClient,
  RequestCertificateCommand,
  DescribeCertificateCommand,
  ListCertificatesCommand,
  DeleteCertificateCommand,
} from '@aws-sdk/client-acm';
import {
  Route53Client,
  CreateHostedZoneCommand,
  ListHostedZonesByNameCommand,
  ChangeResourceRecordSetsCommand,
  GetHostedZoneCommand,
  DeleteHostedZoneCommand,
  ListResourceRecordSetsCommand,
} from '@aws-sdk/client-route-53';
import type { SCFConfig } from '../../types/config.js';

/**
 * Test project structure
 */
export interface TestProject {
  /** Root directory of the test project */
  rootDir: string;
  /** Build directory path */
  buildDir: string;
  /** State directory path */
  stateDir: string;
  /** Config file path */
  configPath: string;
  /** Cleanup function */
  cleanup: () => void;
}

/**
 * Create a temporary test project with files
 */
export function createTestProject(files: Record<string, string> = {}): TestProject {
  const rootDir = mkdtempSync(join(tmpdir(), 'scf-integration-test-'));
  const buildDir = join(rootDir, 'dist');
  const stateDir = join(rootDir, '.scf');

  // Create directories
  mkdirSync(buildDir, { recursive: true });
  mkdirSync(stateDir, { recursive: true });

  // Create files in build directory
  for (const [filePath, content] of Object.entries(files)) {
    const fullPath = join(buildDir, filePath);
    const dir = join(fullPath, '..');
    mkdirSync(dir, { recursive: true });
    writeFileSync(fullPath, content, 'utf-8');
  }

  // Create default config file
  const configPath = join(rootDir, 'scf.config.ts');
  writeFileSync(
    configPath,
    `export default {
  app: 'integration-test-app',
  region: 'ap-northeast-2',
  s3: {
    bucketName: 'test-bucket',
    buildDir: './dist',
    indexDocument: 'index.html',
    errorDocument: '404.html',
  },
};
`,
    'utf-8'
  );

  const cleanup = () => {
    if (existsSync(rootDir)) {
      rmSync(rootDir, { recursive: true, force: true });
    }
  };

  return {
    rootDir,
    buildDir,
    stateDir,
    configPath,
    cleanup,
  };
}

/**
 * Create test config with overrides
 */
export function createTestConfig(overrides: Partial<SCFConfig> = {}): SCFConfig {
  const baseConfig: SCFConfig = {
    app: 'integration-test-app',
    region: 'ap-northeast-2',
    s3: {
      bucketName: 'test-bucket-abc123',
      buildDir: './dist',
      indexDocument: 'index.html',
      errorDocument: '404.html',
    },
  };

  return {
    ...baseConfig,
    ...overrides,
    s3: {
      ...baseConfig.s3,
      ...(overrides.s3 || {}),
    },
    cloudfront: overrides.cloudfront,
  };
}

/**
 * AWS Mock Setup Result
 */
export interface AWSMocks {
  s3: AwsClientStub<S3Client>;
  cloudfront: AwsClientStub<CloudFrontClient>;
  acm: AwsClientStub<ACMClient>;
  route53: AwsClientStub<Route53Client>;
  resetAll: () => void;
  restoreAll: () => void;
}

/**
 * Setup AWS SDK mocks for integration tests
 */
export function setupAWSMocks(): AWSMocks {
  const s3Mock = mockClient(S3Client);
  const cloudfrontMock = mockClient(CloudFrontClient);
  const acmMock = mockClient(ACMClient);
  const route53Mock = mockClient(Route53Client);

  return {
    s3: s3Mock,
    cloudfront: cloudfrontMock,
    acm: acmMock,
    route53: route53Mock,
    resetAll: () => {
      s3Mock.reset();
      cloudfrontMock.reset();
      acmMock.reset();
      route53Mock.reset();
    },
    restoreAll: () => {
      s3Mock.restore();
      cloudfrontMock.restore();
      acmMock.restore();
      route53Mock.restore();
    },
  };
}

/**
 * Configure S3 mock for successful operations
 */
export function mockS3Success(s3Mock: AwsClientStub<S3Client>, options: {
  bucketExists?: boolean;
  objects?: { Key: string; ETag?: string }[];
} = {}): void {
  const { bucketExists = false, objects = [] } = options;

  // Head bucket
  if (bucketExists) {
    s3Mock.on(HeadBucketCommand).resolves({});
  } else {
    s3Mock.on(HeadBucketCommand).rejects({
      name: 'NotFound',
      $metadata: { httpStatusCode: 404 },
    });
  }

  // Create bucket
  s3Mock.on(CreateBucketCommand).resolves({});

  // Website configuration
  s3Mock.on(PutBucketWebsiteCommand).resolves({});

  // Public access
  s3Mock.on(DeletePublicAccessBlockCommand).resolves({});
  s3Mock.on(PutBucketPolicyCommand).resolves({});

  // Tagging
  s3Mock.on(PutBucketTaggingCommand).resolves({});

  // Upload
  s3Mock.on(PutObjectCommand).resolves({ ETag: '"abc123"' });

  // List objects
  s3Mock.on(ListObjectsV2Command).resolves({ Contents: objects });

  // Delete
  s3Mock.on(DeleteObjectsCommand).resolves({});
  s3Mock.on(DeleteBucketCommand).resolves({});
}

/**
 * Configure CloudFront mock for successful operations
 */
export function mockCloudFrontSuccess(cfMock: AwsClientStub<CloudFrontClient>, options: {
  distributionId?: string;
  domainName?: string;
  exists?: boolean;
} = {}): void {
  const {
    distributionId = 'E1234567890ABC',
    domainName = 'd123456abcdef8.cloudfront.net',
    exists = false,
  } = options;

  const distribution = {
    Id: distributionId,
    DomainName: domainName,
    Status: 'Deployed',
    ARN: `arn:aws:cloudfront::123456789012:distribution/${distributionId}`,
    DistributionConfig: {
      Origins: { Quantity: 1, Items: [] },
      DefaultCacheBehavior: {},
      CallerReference: 'test-ref',
      Comment: '',
      Enabled: true,
    },
  };

  // Create distribution
  s3Mock.on(CreateDistributionCommand).resolves({
    Distribution: distribution,
  });

  // Get distribution
  if (exists) {
    cfMock.on(GetDistributionCommand).resolves({
      Distribution: distribution,
      ETag: 'test-etag',
    });
    cfMock.on(GetDistributionConfigCommand).resolves({
      DistributionConfig: distribution.DistributionConfig,
      ETag: 'test-etag',
    });
  } else {
    cfMock.on(GetDistributionCommand).rejects({
      name: 'NoSuchDistribution',
    });
  }

  // Update distribution
  cfMock.on(UpdateDistributionCommand).resolves({
    Distribution: distribution,
    ETag: 'new-etag',
  });

  // Create invalidation
  cfMock.on(CreateInvalidationCommand).resolves({
    Invalidation: {
      Id: 'I1234567890',
      Status: 'Completed',
      CreateTime: new Date(),
      InvalidationBatch: { Paths: { Quantity: 1, Items: ['/*'] }, CallerReference: 'ref' },
    },
  });

  // Delete distribution
  cfMock.on(DeleteDistributionCommand).resolves({});
}

/**
 * Configure ACM mock for successful operations
 */
export function mockACMSuccess(acmMock: AwsClientStub<ACMClient>, options: {
  certificateArn?: string;
  domain?: string;
  status?: string;
} = {}): void {
  const {
    certificateArn = 'arn:aws:acm:us-east-1:123456789012:certificate/abc-123',
    domain = 'example.com',
    status = 'ISSUED',
  } = options;

  // Request certificate
  acmMock.on(RequestCertificateCommand).resolves({
    CertificateArn: certificateArn,
  });

  // Describe certificate
  acmMock.on(DescribeCertificateCommand).resolves({
    Certificate: {
      CertificateArn: certificateArn,
      DomainName: domain,
      Status: status,
      Type: 'AMAZON_ISSUED',
      DomainValidationOptions: [
        {
          DomainName: domain,
          ValidationStatus: 'SUCCESS',
          ResourceRecord: {
            Name: `_abc123.${domain}`,
            Type: 'CNAME',
            Value: '_def456.acm-validations.aws.',
          },
        },
      ],
    },
  });

  // List certificates
  acmMock.on(ListCertificatesCommand).resolves({
    CertificateSummaryList: [
      {
        CertificateArn: certificateArn,
        DomainName: domain,
        Status: status,
      },
    ],
  });

  // Delete certificate
  acmMock.on(DeleteCertificateCommand).resolves({});
}

/**
 * Configure Route53 mock for successful operations
 */
export function mockRoute53Success(route53Mock: AwsClientStub<Route53Client>, options: {
  hostedZoneId?: string;
  domain?: string;
  exists?: boolean;
} = {}): void {
  const {
    hostedZoneId = 'Z1234567890ABC',
    domain = 'example.com',
    exists = true,
  } = options;

  // List hosted zones
  if (exists) {
    route53Mock.on(ListHostedZonesByNameCommand).resolves({
      HostedZones: [
        {
          Id: `/hostedzone/${hostedZoneId}`,
          Name: `${domain}.`,
          CallerReference: 'test-ref',
        },
      ],
    });
  } else {
    route53Mock.on(ListHostedZonesByNameCommand).resolves({
      HostedZones: [],
    });
  }

  // Create hosted zone
  route53Mock.on(CreateHostedZoneCommand).resolves({
    HostedZone: {
      Id: `/hostedzone/${hostedZoneId}`,
      Name: `${domain}.`,
      CallerReference: 'test-ref',
    },
    DelegationSet: {
      NameServers: [
        'ns-1.awsdns-00.com',
        'ns-2.awsdns-00.net',
        'ns-3.awsdns-00.org',
        'ns-4.awsdns-00.co.uk',
      ],
    },
  });

  // Get hosted zone
  route53Mock.on(GetHostedZoneCommand).resolves({
    HostedZone: {
      Id: `/hostedzone/${hostedZoneId}`,
      Name: `${domain}.`,
      CallerReference: 'test-ref',
    },
    DelegationSet: {
      NameServers: [
        'ns-1.awsdns-00.com',
        'ns-2.awsdns-00.net',
        'ns-3.awsdns-00.org',
        'ns-4.awsdns-00.co.uk',
      ],
    },
  });

  // Change record sets
  route53Mock.on(ChangeResourceRecordSetsCommand).resolves({
    ChangeInfo: {
      Id: '/change/C1234567890',
      Status: 'INSYNC',
      SubmittedAt: new Date(),
    },
  });

  // List record sets
  route53Mock.on(ListResourceRecordSetsCommand).resolves({
    ResourceRecordSets: [],
  });

  // Delete hosted zone
  route53Mock.on(DeleteHostedZoneCommand).resolves({
    ChangeInfo: {
      Id: '/change/C1234567890',
      Status: 'PENDING',
      SubmittedAt: new Date(),
    },
  });
}

/**
 * Create sample static files for testing
 */
export function createSampleFiles(): Record<string, string> {
  return {
    'index.html': `<!DOCTYPE html>
<html>
<head><title>Test</title></head>
<body><h1>Hello World</h1></body>
</html>`,
    '404.html': `<!DOCTYPE html>
<html>
<head><title>Not Found</title></head>
<body><h1>404 - Page Not Found</h1></body>
</html>`,
    'assets/style.css': `body { font-family: sans-serif; margin: 0; padding: 20px; }
h1 { color: #333; }`,
    'assets/app.js': `console.log('App loaded');
document.addEventListener('DOMContentLoaded', function() {
  console.log('DOM ready');
});`,
    'assets/images/logo.svg': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <circle cx="50" cy="50" r="40" fill="#007bff"/>
</svg>`,
  };
}

/**
 * Wait for a specified amount of time
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Generate unique test identifier
 */
export function generateTestId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(7);
  return `test-${timestamp}-${random}`;
}
