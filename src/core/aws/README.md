# AWS Integration Module

SCF의 AWS 통합 모듈입니다. AWS 인증 정보 관리, 검증, 그리고 S3/CloudFront 클라이언트 생성을 담당합니다.

## 📁 파일 구조

```
src/core/aws/
├── credentials.ts             # AWS 인증 정보 Resolution
├── verify.ts                  # STS를 통한 인증 검증
├── client.ts                  # AWS Client 생성 헬퍼
├── s3-bucket.ts               # S3 버킷 관리
├── s3-deployer.ts             # S3 배포 오케스트레이터
├── cloudfront-distribution.ts # CloudFront Distribution 관리
├── cloudfront-invalidation.ts # CloudFront 캐시 무효화
├── cloudfront-deployer.ts     # CloudFront 배포 오케스트레이터
├── index.ts                   # 통합 entry point
└── README.md                  # 본 문서
```

---

## 📄 파일별 상세 설명

### 1. `credentials.ts` - Credentials Resolution

**목적**: 다양한 소스에서 AWS 인증 정보를 자동으로 탐색하고 로드합니다.

#### 우선순위 체계

AWS 인증 정보는 다음 우선순위로 탐색됩니다:

1. **Config 파일의 명시적 키** (최우선)
   - `config.credentials.accessKeyId`
   - `config.credentials.secretAccessKey`
   - `config.credentials.sessionToken` (선택)

2. **Config 파일의 AWS Profile**
   - `config.credentials.profile`
   - `~/.aws/credentials` 파일에서 해당 profile 로드

3. **환경 변수**
   - `AWS_ACCESS_KEY_ID`
   - `AWS_SECRET_ACCESS_KEY`
   - `AWS_SESSION_TOKEN` (선택)

4. **Default Credential Chain**
   - AWS Profile (default 또는 `AWS_PROFILE` 환경 변수)
   - EC2 Instance Metadata (IAM Role)
   - ECS Container Metadata (Task Role)

#### 주요 함수

**`getCredentials(config: SCFConfig): Promise<CredentialResolution>`**

설정 파일로부터 AWS 인증 정보를 해결합니다.

```typescript
import { getCredentials } from './core/aws/credentials.js';

const resolution = await getCredentials(config);

console.log(resolution.credentials.accessKeyId);
console.log(`Source: ${resolution.source}`); // "config" | "environment" | "profile" | "instance-metadata"
console.log(`Profile: ${resolution.profile}`); // profile 사용 시
```

**반환 타입:**
```typescript
interface CredentialResolution {
  credentials: AWSCredentials;  // AWS SDK 표준 credentials
  source: CredentialSource;     // 인증 정보 출처
  profile?: string;             // Profile 이름 (해당하는 경우)
}
```

**`createCredentialProvider(config: SCFConfig): AwsCredentialIdentityProvider`**

AWS SDK 클라이언트용 credential provider를 생성합니다.

```typescript
const credentialProvider = createCredentialProvider(config);

const s3Client = new S3Client({
  region: 'ap-northeast-2',
  credentials: credentialProvider,
});
```

#### 에러 처리

인증 정보를 찾을 수 없는 경우 상세한 가이드를 제공합니다:

```
Error: Failed to resolve AWS credentials.
Please configure credentials using one of:
  1. Config file (credentials.accessKeyId + secretAccessKey)
  2. Config file (credentials.profile)
  3. Environment variables (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)
  4. AWS profile (~/.aws/credentials)
  5. IAM role (EC2/ECS instance metadata)

Original error: ...
```

#### 설정 예시

**1. Config 파일에 명시적 키 (비추천 - 보안 위험)**

```typescript
// scf.config.ts
export default defineConfig({
  app: 'my-app',
  region: 'ap-northeast-2',
  credentials: {
    accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
    secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
  },
});
```

**2. Config 파일에 Profile (추천)**

```typescript
// scf.config.ts
export default defineConfig({
  app: 'my-app',
  region: 'ap-northeast-2',
  credentials: {
    profile: 'my-aws-profile',
  },
});
```

**3. 환경 변수**

```bash
export AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
export AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
export AWS_SESSION_TOKEN=... # 임시 자격 증명인 경우
```

**4. AWS Profile (~/.aws/credentials)**

```ini
# ~/.aws/credentials
[default]
aws_access_key_id = AKIAIOSFODNN7EXAMPLE
aws_secret_access_key = wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY

[production]
aws_access_key_id = AKIAI44QH8DHBEXAMPLE
aws_secret_access_key = je7MtGbClwBF/2Zp9Utk/h3yCo8nvbEXAMPLEKEY
```

```typescript
// scf.config.ts
export default defineConfig({
  credentials: {
    profile: 'production',
  },
  // ...
});
```

**5. IAM Role (EC2/ECS)**

```typescript
// Config에 credentials를 설정하지 않으면 자동으로 IAM Role 사용
export default defineConfig({
  app: 'my-app',
  region: 'ap-northeast-2',
  // credentials 생략 → IAM Role 사용
});
```

---

### 2. `verify.ts` - Credentials 검증

**목적**: AWS STS (Security Token Service)를 사용하여 인증 정보의 유효성을 검증합니다.

#### 주요 함수

**`verifyCredentials(credentials: AWSCredentials, region: string): Promise<AWSAccountInfo>`**

STS `GetCallerIdentity` API를 호출하여 인증 정보를 검증합니다.

```typescript
import { verifyCredentials } from './core/aws/verify.js';

try {
  const accountInfo = await verifyCredentials(credentials, 'ap-northeast-2');

  console.log(`Account ID: ${accountInfo.accountId}`);
  console.log(`User ARN: ${accountInfo.arn}`);
  console.log(`User ID: ${accountInfo.userId}`);
} catch (error) {
  console.error('Invalid credentials:', error.message);
}
```

**반환 타입:**
```typescript
interface AWSAccountInfo {
  accountId: string;  // AWS 계정 ID (12자리 숫자)
  arn: string;        // IAM User/Role ARN
  userId: string;     // IAM User/Role ID
}
```

**예시 출력:**
```
accountId: "123456789012"
arn: "arn:aws:iam::123456789012:user/admin"
userId: "AIDAI23HXK2XWEXAMPLE"
```

**`formatAccountInfo(info: AWSAccountInfo): string`**

계정 정보를 사람이 읽기 쉬운 형식으로 포맷합니다.

```typescript
const formatted = formatAccountInfo(accountInfo);
console.log(formatted);

// Output:
// Account ID: 123456789012
// User ARN: arn:aws:iam::123456789012:user/admin
// User ID: AIDAI23HXK2XWEXAMPLE
```

#### 에러 처리

**잘못된 인증 정보:**
```
Error: AWS credentials verification failed:
The security token included in the request is invalid.
Please check your credentials and try again.
```

**네트워크 오류:**
```
Error: AWS credentials verification failed:
Could not connect to AWS STS service.
Please check your network connection.
```

#### 사용 시나리오

**배포 전 검증:**
```typescript
async function deploy() {
  console.log('Verifying AWS credentials...');

  const { credentials } = await getCredentials(config);
  const accountInfo = await verifyCredentials(credentials, config.region);

  console.log(`✓ Authenticated as: ${accountInfo.arn}`);
  console.log(`✓ Account ID: ${accountInfo.accountId}`);

  // 배포 진행...
}
```

**Multi-account 배포:**
```typescript
// 의도한 계정인지 확인
const expectedAccountId = '123456789012';
const accountInfo = await verifyCredentials(credentials, region);

if (accountInfo.accountId !== expectedAccountId) {
  throw new Error(
    `Wrong AWS account! Expected ${expectedAccountId}, got ${accountInfo.accountId}`
  );
}
```

---

### 3. `client.ts` - AWS Client 생성 헬퍼

**목적**: S3, CloudFront, STS 클라이언트를 설정과 함께 자동으로 생성합니다.

#### 주요 함수

**`createS3Client(config: SCFConfig): S3Client`**

S3 클라이언트를 생성합니다.

```typescript
import { createS3Client } from './core/aws/client.js';
import { ListBucketsCommand } from '@aws-sdk/client-s3';

const s3Client = createS3Client(config);

const response = await s3Client.send(new ListBucketsCommand({}));
console.log(response.Buckets);
```

**자동 설정:**
- Region: `config.region`
- Credentials: `config.credentials`에서 자동 해결

**`createCloudFrontClient(config: SCFConfig): CloudFrontClient`**

CloudFront 클라이언트를 생성합니다.

```typescript
import { createCloudFrontClient } from './core/aws/client.js';
import { ListDistributionsCommand } from '@aws-sdk/client-cloudfront';

const cfClient = createCloudFrontClient(config);

const response = await cfClient.send(new ListDistributionsCommand({}));
console.log(response.DistributionList);
```

**중요:** CloudFront API는 항상 `us-east-1` 리전을 사용합니다 (AWS 제약).

**`createSTSClient(config: SCFConfig): STSClient`**

STS 클라이언트를 생성합니다.

```typescript
import { createSTSClient } from './core/aws/client.js';
import { GetCallerIdentityCommand } from '@aws-sdk/client-sts';

const stsClient = createSTSClient(config);

const response = await stsClient.send(new GetCallerIdentityCommand({}));
console.log(response.Account);
```

#### 커스텀 옵션

**`createS3ClientWithOptions(config: SCFConfig, options: ClientOptions): S3Client`**

추가 옵션으로 S3 클라이언트를 생성합니다.

```typescript
const s3Client = createS3ClientWithOptions(config, {
  region: 'us-west-2',        // 리전 오버라이드
  requestTimeout: 30000,      // 30초 타임아웃
  maxAttempts: 5,             // 최대 5회 재시도
});
```

**옵션 인터페이스:**
```typescript
interface ClientOptions {
  region?: string;          // AWS 리전 오버라이드
  requestTimeout?: number;  // 요청 타임아웃 (밀리초)
  maxAttempts?: number;     // 최대 재시도 횟수
}
```

**`createCloudFrontClientWithOptions(config: SCFConfig, options: ClientOptions): CloudFrontClient`**

추가 옵션으로 CloudFront 클라이언트를 생성합니다.

```typescript
const cfClient = createCloudFrontClientWithOptions(config, {
  requestTimeout: 60000,  // 1분 타임아웃 (Distribution 생성은 시간이 걸림)
  maxAttempts: 3,
});
```

#### 사용 예시

**S3 버킷 나열:**
```typescript
import { createS3Client } from 'scf';
import { ListBucketsCommand } from '@aws-sdk/client-s3';

const s3 = createS3Client(config);
const { Buckets } = await s3.send(new ListBucketsCommand({}));

Buckets?.forEach(bucket => {
  console.log(`- ${bucket.Name}`);
});
```

**파일 업로드:**
```typescript
import { PutObjectCommand } from '@aws-sdk/client-s3';

const s3 = createS3Client(config);

await s3.send(new PutObjectCommand({
  Bucket: 'my-bucket',
  Key: 'index.html',
  Body: '<html>Hello World</html>',
  ContentType: 'text/html',
}));
```

**CloudFront 캐시 무효화:**
```typescript
import { createCloudFrontClient } from 'scf';
import { CreateInvalidationCommand } from '@aws-sdk/client-cloudfront';

const cf = createCloudFrontClient(config);

await cf.send(new CreateInvalidationCommand({
  DistributionId: 'E1234567890ABC',
  InvalidationBatch: {
    CallerReference: Date.now().toString(),
    Paths: {
      Quantity: 1,
      Items: ['/*'],
    },
  },
}));
```

---

### 4. `index.ts` - 통합 Entry Point

**목적**: 모든 AWS 관련 기능을 단일 진입점으로 제공합니다.

#### Exports

```typescript
// Credentials
export {
  getCredentials,
  createCredentialProvider,
} from './credentials.js';

// Verification
export {
  verifyCredentials,
  formatAccountInfo,
} from './verify.js';

// Client creation
export {
  createS3Client,
  createCloudFrontClient,
  createSTSClient,
  createS3ClientWithOptions,
  createCloudFrontClientWithOptions,
  type ClientOptions,
} from './client.js';

// Types
export type {
  AWSCredentials,
  AWSAccountInfo,
  CredentialSource,
  CredentialResolution,
} from '../../types/aws.js';
```

---

## 🎯 전체 워크플로우

```mermaid
graph TD
    A[Config 로드] --> B[getCredentials]
    B --> C{Credential Source}
    C -->|1| D[Config 파일 명시적 키]
    C -->|2| E[Config 파일 Profile]
    C -->|3| F[환경 변수]
    C -->|4| G[Default Chain]
    D --> H[CredentialResolution]
    E --> H
    F --> H
    G --> H
    H --> I[verifyCredentials]
    I --> J{유효한가?}
    J -->|Yes| K[AWSAccountInfo]
    J -->|No| L[Error]
    K --> M[createS3Client / createCloudFrontClient]
    M --> N[AWS Operations]
```

---

## 💡 전체 사용 예시

### 기본 워크플로우

```typescript
import {
  loadConfig,
  getCredentials,
  verifyCredentials,
  createS3Client,
  createCloudFrontClient,
} from 'scf';

async function deploy() {
  // 1. Config 로드
  const config = await loadConfig({ env: 'prod' });

  // 2. Credentials 획득
  console.log('📋 Resolving AWS credentials...');
  const { credentials, source, profile } = await getCredentials(config);
  console.log(`✓ Using credentials from: ${source}`);
  if (profile) {
    console.log(`✓ Profile: ${profile}`);
  }

  // 3. Credentials 검증
  console.log('🔐 Verifying credentials...');
  const accountInfo = await verifyCredentials(credentials, config.region);
  console.log(`✓ Account ID: ${accountInfo.accountId}`);
  console.log(`✓ User ARN: ${accountInfo.arn}`);

  // 4. AWS Clients 생성
  const s3Client = createS3Client(config);
  const cfClient = createCloudFrontClient(config);

  // 5. 배포 작업 수행
  console.log('🚀 Starting deployment...');
  // ... S3 업로드, CloudFront 캐시 무효화 등
}

deploy().catch(console.error);
```

### Profile별 배포

```typescript
// scf.config.ts
export default defineConfig({
  app: 'my-app',
  region: 'ap-northeast-2',

  environments: {
    dev: {
      credentials: {
        profile: 'dev-account',
      },
    },
    prod: {
      credentials: {
        profile: 'prod-account',
      },
    },
  },
});
```

```typescript
// Dev 배포
const devConfig = await loadConfig({ env: 'dev' });
const devS3 = createS3Client(devConfig); // dev-account 사용

// Prod 배포
const prodConfig = await loadConfig({ env: 'prod' });
const prodS3 = createS3Client(prodConfig); // prod-account 사용
```

### CLI에서 Profile 오버라이드

```bash
# Config 파일과 관계없이 특정 profile 사용
scf deploy --profile my-custom-profile
```

```typescript
// CLI에서
const config = await loadConfig({
  env: 'prod',
  profile: cliOptions.profile, // --profile 옵션
});

const { credentials } = await getCredentials(config);
// my-custom-profile 사용
```

---

## 🔒 보안 Best Practices

### 1. Credentials를 코드에 하드코딩하지 마세요

**❌ 나쁜 예:**
```typescript
export default defineConfig({
  credentials: {
    accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
    secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
  },
});
```

**✅ 좋은 예:**
```typescript
// Profile 사용
export default defineConfig({
  credentials: {
    profile: 'my-profile',
  },
});
```

### 2. IAM 최소 권한 원칙

SCF에 필요한 최소 권한:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:CreateBucket",
        "s3:PutObject",
        "s3:PutObjectAcl",
        "s3:GetObject",
        "s3:ListBucket",
        "s3:DeleteObject",
        "s3:PutBucketWebsite",
        "s3:PutBucketPolicy"
      ],
      "Resource": [
        "arn:aws:s3:::my-bucket-*",
        "arn:aws:s3:::my-bucket-*/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "cloudfront:CreateDistribution",
        "cloudfront:GetDistribution",
        "cloudfront:UpdateDistribution",
        "cloudfront:DeleteDistribution",
        "cloudfront:CreateInvalidation"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "sts:GetCallerIdentity"
      ],
      "Resource": "*"
    }
  ]
}
```

### 3. 환경별 분리

```typescript
export default defineConfig({
  environments: {
    dev: {
      credentials: { profile: 'dev-account' },
      s3: { bucketName: 'dev-bucket' },
    },
    prod: {
      credentials: { profile: 'prod-account' },
      s3: { bucketName: 'prod-bucket' },
    },
  },
});
```

### 4. Temporary Credentials 사용

IAM Role이나 STS를 통한 임시 자격 증명 사용을 권장합니다:

```typescript
// Session Token 포함 (임시 자격 증명)
export default defineConfig({
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    sessionToken: process.env.AWS_SESSION_TOKEN,
  },
});
```

---

## 🧪 테스트

### Credentials Resolution 테스트

```typescript
import { getCredentials } from './credentials.js';

test('resolves credentials from config', async () => {
  const config = {
    app: 'test',
    region: 'us-east-1',
    credentials: {
      accessKeyId: 'TEST_KEY',
      secretAccessKey: 'TEST_SECRET',
    },
  };

  const { credentials, source } = await getCredentials(config);

  expect(credentials.accessKeyId).toBe('TEST_KEY');
  expect(source).toBe('config');
});

test('resolves credentials from profile', async () => {
  const config = {
    app: 'test',
    region: 'us-east-1',
    credentials: {
      profile: 'default',
    },
  };

  const { credentials, source, profile } = await getCredentials(config);

  expect(source).toBe('profile');
  expect(profile).toBe('default');
  expect(credentials.accessKeyId).toBeDefined();
});
```

### Verification 테스트

```typescript
import { verifyCredentials } from './verify.js';

test('verifies valid credentials', async () => {
  const credentials = {
    accessKeyId: 'VALID_KEY',
    secretAccessKey: 'VALID_SECRET',
  };

  const accountInfo = await verifyCredentials(credentials, 'us-east-1');

  expect(accountInfo.accountId).toMatch(/^\d{12}$/);
  expect(accountInfo.arn).toMatch(/^arn:aws:iam::/);
});

test('throws error for invalid credentials', async () => {
  const credentials = {
    accessKeyId: 'INVALID_KEY',
    secretAccessKey: 'INVALID_SECRET',
  };

  await expect(
    verifyCredentials(credentials, 'us-east-1')
  ).rejects.toThrow('AWS credentials verification failed');
});
```

---

## 🚨 일반적인 문제 해결

### 1. "Unable to locate credentials"

**원인:** AWS 인증 정보를 찾을 수 없음

**해결:**
```bash
# AWS CLI 설정 확인
aws configure list

# Profile 확인
aws configure list-profiles

# 환경 변수 확인
echo $AWS_ACCESS_KEY_ID
```

### 2. "The security token included in the request is invalid"

**원인:** 만료되었거나 잘못된 인증 정보

**해결:**
```bash
# Profile 재설정
aws configure --profile my-profile

# 임시 자격 증명 갱신
aws sts get-session-token
```

### 3. "Access Denied"

**원인:** IAM 권한 부족

**해결:**
```bash
# 현재 사용자 확인
aws sts get-caller-identity

# 필요한 권한이 있는지 IAM 콘솔에서 확인
```

### 4. CloudFront "InvalidViewerCertificate"

**원인:** CloudFront는 us-east-1의 ACM 인증서만 지원

**해결:**
- ACM 인증서를 `us-east-1` 리전에서 생성
- 또는 기존 인증서를 us-east-1로 마이그레이션

---

### 4. `s3-bucket.ts` - S3 버킷 관리

**목적**: S3 버킷의 생성, 설정, 관리를 담당합니다.

#### 주요 함수

**`bucketExists(client: S3Client, bucketName: string): Promise<boolean>`**

S3 버킷의 존재 여부를 확인합니다.

```typescript
import { bucketExists } from './s3-bucket.js';

const exists = await bucketExists(s3Client, 'my-bucket');

if (exists) {
  console.log('Bucket already exists');
} else {
  console.log('Bucket does not exist');
}
```

**`createBucket(client: S3Client, bucketName: string, region: string): Promise<void>`**

S3 버킷을 생성합니다.

```typescript
await createBucket(s3Client, 'my-bucket', 'ap-northeast-2');
console.log('Bucket created successfully');
```

**리전별 설정:**
- `us-east-1`: `CreateBucketConfiguration` 불필요
- 기타 리전: `LocationConstraint` 필수

```typescript
// us-east-1
{ Bucket: 'my-bucket' }

// ap-northeast-2
{
  Bucket: 'my-bucket',
  CreateBucketConfiguration: {
    LocationConstraint: 'ap-northeast-2'
  }
}
```

**`configureBucketWebsite(client: S3Client, bucketName: string, indexDocument?: string, errorDocument?: string): Promise<void>`**

Static Website Hosting을 설정합니다.

```typescript
await configureBucketWebsite(
  s3Client,
  'my-bucket',
  'index.html',
  '404.html'
);
```

**설정 내용:**
```json
{
  "IndexDocument": {
    "Suffix": "index.html"
  },
  "ErrorDocument": {
    "Key": "404.html"
  }
}
```

**`setBucketPublicReadPolicy(client: S3Client, bucketName: string): Promise<void>`**

버킷에 Public Read 정책을 설정합니다.

```typescript
await setBucketPublicReadPolicy(s3Client, 'my-bucket');
```

**설정되는 정책:**
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadGetObject",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::my-bucket/*"
    }
  ]
}
```

**주의:** Public Access Block을 먼저 제거합니다.

**`ensureBucket(client: S3Client, bucketName: string, region: string, options?): Promise<void>`**

버킷 존재 확인 및 설정을 한 번에 처리합니다.

```typescript
await ensureBucket(s3Client, 'my-bucket', 'ap-northeast-2', {
  websiteHosting: true,
  indexDocument: 'index.html',
  errorDocument: '404.html',
  publicRead: true,
});
```

**옵션:**
```typescript
interface EnsureBucketOptions {
  websiteHosting?: boolean;  // Static Website 활성화 (기본: true)
  indexDocument?: string;    // Index 문서 (기본: 'index.html')
  errorDocument?: string;    // Error 문서
  publicRead?: boolean;      // Public Read 정책 (기본: true)
}
```

**프로세스:**
1. 버킷 존재 확인
2. 없으면 생성
3. Website Hosting 설정 (옵션)
4. Public Read 정책 설정 (옵션)

**`getBucketWebsiteUrl(bucketName: string, region: string): string`**

버킷의 Website URL을 생성합니다.

```typescript
const url = getBucketWebsiteUrl('my-bucket', 'ap-northeast-2');
console.log(url);
// → "http://my-bucket.s3-website.ap-northeast-2.amazonaws.com"
```

**리전별 URL 형식:**
```typescript
// us-east-1
"http://{bucket}.s3-website-us-east-1.amazonaws.com"

// 기타 리전
"http://{bucket}.s3-website.{region}.amazonaws.com"
```

#### 사용 시나리오

**배포 전 버킷 준비:**
```typescript
import { ensureBucket, getBucketWebsiteUrl } from './s3-bucket.js';

async function prepareDeployment() {
  const bucketName = 'my-website';
  const region = 'ap-northeast-2';

  console.log('Preparing S3 bucket...');

  await ensureBucket(s3Client, bucketName, region, {
    websiteHosting: true,
    publicRead: true,
  });

  const websiteUrl = getBucketWebsiteUrl(bucketName, region);
  console.log(`Website will be available at: ${websiteUrl}`);
}
```

**에러 처리:**
```typescript
try {
  await createBucket(s3Client, bucketName, region);
} catch (error) {
  if (error.name === 'BucketAlreadyOwnedByYou') {
    console.log('Bucket already exists and is owned by you');
  } else if (error.name === 'BucketAlreadyExists') {
    throw new Error('Bucket name is already taken by another account');
  } else {
    throw error;
  }
}
```

---

### 5. `s3-deployer.ts` - S3 배포 오케스트레이터

**목적**: 전체 S3 배포 프로세스를 조율하고 진행 상황을 표시합니다.

#### 주요 함수

**`deployToS3(config: SCFConfig, options?: UploadOptions): Promise<DeploymentStats>`**

S3에 정적 사이트를 배포하는 메인 함수입니다.

```typescript
import { deployToS3 } from './s3-deployer.js';

const stats = await deployToS3(config, {
  gzip: true,
  concurrency: 10,
  showProgress: true,
  dryRun: false,
});

console.log(`
  Total files: ${stats.totalFiles}
  Uploaded: ${stats.uploaded}
  Skipped: ${stats.skipped}
  Failed: ${stats.failed}
  Duration: ${(stats.duration / 1000).toFixed(2)}s
`);
```

**반환 타입:**
```typescript
interface DeploymentStats {
  totalFiles: number;       // 스캔된 총 파일 수
  uploaded: number;         // 업로드된 파일 수
  skipped: number;          // 스킵된 파일 수 (변경 없음)
  failed: number;           // 실패한 파일 수
  totalSize: number;        // 총 파일 크기 (bytes)
  compressedSize: number;   // 압축 후 크기 (bytes)
  duration: number;         // 배포 소요 시간 (ms)
  results: UploadResult[];  // 개별 파일 업로드 결과
}
```

#### 배포 프로세스

**1단계: 버킷 확인 및 설정**
```
✓ Checking S3 bucket...
✓ S3 bucket ready: my-bucket
```

**2단계: 파일 스캔**
```
✓ Scanning files...
✓ Found 42 files (2.3 MB)
```

**3단계: 파일 업로드**
```
📤 Uploading files...

Progress |████████████████████| 100% | 42/42 files | main.js
```

**4단계: 결과 표시**
```
✓ Uploaded: 40 files
○ Skipped: 2 files (unchanged)
✗ Failed: 0 files

Total size: 2.3 MB
Compressed: 1.1 MB (52% reduction)
Duration: 3.45s

🌐 Website URL: http://my-bucket.s3-website.ap-northeast-2.amazonaws.com
```

#### 옵션 설정

```typescript
interface UploadOptions {
  gzip?: boolean;         // Gzip 압축 (기본: true)
  concurrency?: number;   // 동시 업로드 수 (기본: 10)
  showProgress?: boolean; // Progress 표시 (기본: true)
  dryRun?: boolean;       // 실제 업로드 안함 (기본: false)
}
```

**예시:**

```typescript
// 프로덕션 배포 (압축 + 병렬)
await deployToS3(config, {
  gzip: true,
  concurrency: 20,
  showProgress: true,
});

// Dry-run (테스트)
await deployToS3(config, {
  dryRun: true,
  showProgress: true,
});

// 느린 네트워크
await deployToS3(config, {
  concurrency: 5,
  showProgress: true,
});
```

#### UI 컴포넌트

**Spinner (ora)**
```typescript
const spinner = ora('Checking S3 bucket...').start();
// ... 작업 수행
spinner.succeed('S3 bucket ready');
```

**Progress Bar (cli-progress)**
```typescript
const progressBar = new cliProgress.SingleBar({
  format: 'Progress |{bar}| {percentage}% | {value}/{total} files',
});

progressBar.start(totalFiles, 0);
// ... 업로드 진행
progressBar.update(completed);
progressBar.stop();
```

**컬러 출력 (chalk)**
```typescript
console.log(chalk.green('✓ Uploaded: 40 files'));
console.log(chalk.gray('○ Skipped: 2 files'));
console.log(chalk.red('✗ Failed: 0 files'));
console.log(chalk.cyan('http://my-bucket.s3-website...'));
```

#### Config 검증

배포 전 필수 설정을 검증합니다:

```typescript
if (!config.s3) {
  throw new Error('S3 configuration is required');
}

const {
  bucketName,   // 필수
  buildDir,     // 필수
  indexDocument = 'index.html',
  errorDocument,
  websiteHosting = true,
  gzip = true,
  concurrency = 10,
  exclude = [],
} = config.s3;
```

#### 에러 처리

```typescript
try {
  const stats = await deployToS3(config);
} catch (error) {
  if (error.message.includes('S3 configuration is required')) {
    console.error('Please configure S3 in your scf.config.ts');
  } else if (error.message.includes('Bucket')) {
    console.error('Bucket error:', error.message);
  } else {
    console.error('Deployment failed:', error);
  }
}
```

#### 전체 사용 예시

```typescript
import { loadConfig, deployToS3 } from 'scf';

async function deploy() {
  try {
    // 1. Config 로드
    const config = await loadConfig({ env: 'prod' });

    // 2. 배포
    console.log('🚀 Starting deployment...\n');

    const stats = await deployToS3(config, {
      gzip: true,
      concurrency: 10,
      showProgress: true,
    });

    // 3. 결과 확인
    if (stats.failed > 0) {
      console.error('\n❌ Deployment completed with errors');
      process.exit(1);
    }

    console.log('\n✅ Deployment successful!');
    console.log(`   ${stats.uploaded} files uploaded`);
    console.log(`   ${(stats.duration / 1000).toFixed(2)}s elapsed`);

  } catch (error) {
    console.error('❌ Deployment failed:', error.message);
    process.exit(1);
  }
}

deploy();
```

#### 성능 최적화

**1. 동시성 조정**
```typescript
// 빠른 네트워크
{ concurrency: 20 }

// 일반 네트워크
{ concurrency: 10 }

// 느린 네트워크
{ concurrency: 5 }
```

**2. Gzip 압축**
```typescript
// 압축 활성화 (권장)
{ gzip: true }

// 압축률: 평균 60-70%
// HTML: 73%
// CSS: 76%
// JS: 66%
```

**3. 파일 제외**
```typescript
// scf.config.ts
export default defineConfig({
  s3: {
    exclude: [
      '**/*.map',     // Source maps
      '**/.DS_Store', // macOS
      '**/Thumbs.db', // Windows
    ],
  },
});
```

---

### 6. `cloudfront-distribution.ts` - CloudFront Distribution 관리

**목적**: CloudFront Distribution의 생성, 조회, 업데이트, 배포 대기를 담당합니다.

#### 주요 함수

**`distributionExists(client: CloudFrontClient, distributionId: string): Promise<boolean>`**

Distribution의 존재 여부를 확인합니다.

```typescript
import { distributionExists } from './cloudfront-distribution.js';

const exists = await distributionExists(cfClient, 'E1234567890ABC');

if (exists) {
  console.log('Distribution exists');
}
```

**`getDistribution(client: CloudFrontClient, distributionId: string): Promise<Distribution | null>`**

Distribution 정보를 조회합니다.

```typescript
const distribution = await getDistribution(cfClient, 'E1234567890ABC');

if (distribution) {
  console.log(`Domain: ${distribution.DomainName}`);
  console.log(`Status: ${distribution.Status}`);
}
```

**`createDistribution(client: CloudFrontClient, options: CreateDistributionOptions): Promise<Distribution>`**

새로운 CloudFront Distribution을 생성합니다.

```typescript
const distribution = await createDistribution(cfClient, {
  s3BucketName: 'my-bucket',
  s3Region: 'ap-northeast-2',
  indexDocument: 'index.html',
  priceClass: 'PriceClass_100',
  ipv6: true,
});

console.log(`Distribution ID: ${distribution.Id}`);
console.log(`Domain: ${distribution.DomainName}`);
```

**옵션:**
```typescript
interface CreateDistributionOptions {
  s3BucketName: string;              // S3 버킷 이름 (필수)
  s3Region: string;                  // S3 리전 (필수)
  indexDocument?: string;            // Index 문서 (기본: 'index.html')
  customDomain?: {                   // 커스텀 도메인 설정
    domainName: string;              // 도메인 이름 (예: example.com)
    certificateArn: string;          // ACM 인증서 ARN (us-east-1)
    aliases?: string[];              // 추가 aliases
  };
  priceClass?: 'PriceClass_100' | 'PriceClass_200' | 'PriceClass_All';
  defaultTTL?: number;               // 기본 캐시 TTL (초, 기본: 86400)
  maxTTL?: number;                   // 최대 TTL (초, 기본: 31536000)
  minTTL?: number;                   // 최소 TTL (초, 기본: 0)
  ipv6?: boolean;                    // IPv6 활성화 (기본: true)
}
```

**생성되는 설정:**
- Origin: S3 Website Endpoint (index document 처리용)
- Protocol Policy: Redirect to HTTPS
- Compression: 활성화
- Cache Methods: GET, HEAD
- Price Class: 선택 가능 (기본: PriceClass_100)

**`updateDistribution(client: CloudFrontClient, distributionId: string, updates: Partial<CreateDistributionOptions>): Promise<Distribution>`**

기존 Distribution을 업데이트합니다.

```typescript
const updated = await updateDistribution(cfClient, 'E1234567890ABC', {
  priceClass: 'PriceClass_All',
  defaultTTL: 3600,
  customDomain: {
    domainName: 'www.example.com',
    certificateArn: 'arn:aws:acm:us-east-1:...',
  },
});

console.log('Distribution updated');
```

**주의사항:**
- ETag를 사용하여 동시 수정 방지
- 업데이트 후 배포 진행 중 상태가 됨 (InProgress)

**`waitForDistributionDeployed(client: CloudFrontClient, distributionId: string, options?): Promise<void>`**

Distribution 배포 완료를 대기합니다.

```typescript
console.log('Waiting for distribution deployment...');

await waitForDistributionDeployed(cfClient, 'E1234567890ABC', {
  maxWaitTime: 1200,  // 최대 20분
  minDelay: 20,       // 최소 20초 간격
  maxDelay: 60,       // 최대 60초 간격
});

console.log('Distribution deployed!');
```

**대기 옵션:**
```typescript
interface WaitOptions {
  maxWaitTime?: number;  // 최대 대기 시간 (초, 기본: 1200)
  minDelay?: number;     // 최소 polling 간격 (초, 기본: 20)
  maxDelay?: number;     // 최대 polling 간격 (초, 기본: 60)
}
```

**`getDistributionUrl(distribution: Distribution): string`**

Distribution의 HTTPS URL을 반환합니다.

```typescript
const url = getDistributionUrl(distribution);
console.log(url);
// → "https://d123456abcdef.cloudfront.net"
```

#### 사용 시나리오

**신규 Distribution 생성:**
```typescript
import { createDistribution, waitForDistributionDeployed } from './cloudfront-distribution.js';

async function setupCDN() {
  // 1. Distribution 생성
  const distribution = await createDistribution(cfClient, {
    s3BucketName: 'my-website',
    s3Region: 'ap-northeast-2',
    priceClass: 'PriceClass_100',
    defaultTTL: 86400,
  });

  console.log(`Created: ${distribution.Id}`);

  // 2. 배포 완료 대기 (선택)
  await waitForDistributionDeployed(cfClient, distribution.Id!);

  console.log(`Available at: ${getDistributionUrl(distribution)}`);
}
```

**커스텀 도메인 설정:**
```typescript
const distribution = await createDistribution(cfClient, {
  s3BucketName: 'my-website',
  s3Region: 'ap-northeast-2',
  customDomain: {
    domainName: 'www.example.com',
    certificateArn: 'arn:aws:acm:us-east-1:123456789012:certificate/...',
    aliases: ['www.example.com', 'example.com'],
  },
});

console.log('Custom domain configured');
console.log('Update DNS CNAME to:', distribution.DomainName);
```

**중요:** ACM 인증서는 반드시 `us-east-1` 리전에 생성되어야 합니다.

---

### 7. `cloudfront-invalidation.ts` - CloudFront 캐시 무효화

**목적**: CloudFront 캐시를 무효화하여 최신 콘텐츠를 즉시 반영합니다.

#### 주요 함수

**`createInvalidation(client: CloudFrontClient, distributionId: string, options: InvalidationOptions): Promise<Invalidation>`**

캐시 무효화를 생성합니다.

```typescript
import { createInvalidation } from './cloudfront-invalidation.js';

const invalidation = await createInvalidation(cfClient, 'E1234567890ABC', {
  paths: ['/index.html', '/css/*', '/js/*'],
});

console.log(`Invalidation ID: ${invalidation.Id}`);
console.log(`Status: ${invalidation.Status}`);
```

**옵션:**
```typescript
interface InvalidationOptions {
  paths: string[];           // 무효화할 경로 목록 (필수)
  callerReference?: string;  // 고유 식별자 (기본: scf-{timestamp})
}
```

**경로 패턴:**
```typescript
// 특정 파일
paths: ['/index.html', '/about.html']

// 디렉토리 전체
paths: ['/css/*', '/js/*']

// 모든 파일
paths: ['/*']

// 특정 확장자
paths: ['/*.html', '/*.css', '/*.js']
```

**`invalidateCache(client: CloudFrontClient, distributionId: string, paths: string[], options?): Promise<Invalidation>`**

캐시 무효화 생성 및 대기를 한 번에 처리합니다.

```typescript
const invalidation = await invalidateCache(
  cfClient,
  'E1234567890ABC',
  ['/index.html', '/main.js'],
  {
    wait: true,          // 완료 대기 (기본: true)
    maxWaitTime: 600,    // 최대 10분
  }
);

console.log('Cache invalidated!');
```

**`invalidateAll(client: CloudFrontClient, distributionId: string, options?): Promise<Invalidation>`**

모든 캐시를 무효화합니다 (`/*` 패턴 사용).

```typescript
await invalidateAll(cfClient, 'E1234567890ABC', {
  wait: true,
});

console.log('All caches cleared!');
```

**주의:** 월 1,000건까지 무료, 이후 건당 $0.005

**`waitForInvalidationCompleted(client: CloudFrontClient, distributionId: string, invalidationId: string, options?): Promise<void>`**

무효화 완료를 대기합니다.

```typescript
await waitForInvalidationCompleted(
  cfClient,
  'E1234567890ABC',
  'I2J3K4L5M6N7O8P9Q0',
  {
    maxWaitTime: 600,  // 최대 10분
    minDelay: 20,
    maxDelay: 60,
  }
);
```

**일반적인 소요 시간:** 1-5분

**`getInvalidation(client: CloudFrontClient, distributionId: string, invalidationId: string): Promise<Invalidation | null>`**

무효화 상태를 조회합니다.

```typescript
const invalidation = await getInvalidation(
  cfClient,
  'E1234567890ABC',
  'I2J3K4L5M6N7O8P9Q0'
);

console.log(`Status: ${invalidation?.Status}`);
// "InProgress" | "Completed"
```

#### 사용 시나리오

**배포 후 자동 무효화:**
```typescript
async function deployAndInvalidate() {
  // 1. S3 업로드
  await deployToS3(config);

  // 2. 전체 캐시 무효화
  console.log('Invalidating CloudFront cache...');

  await invalidateAll(cfClient, distributionId, {
    wait: true,
  });

  console.log('Cache invalidated. New content is live!');
}
```

**특정 파일만 무효화:**
```typescript
// 변경된 파일만 무효화
const changedFiles = ['/index.html', '/main.js', '/style.css'];

await invalidateCache(cfClient, distributionId, changedFiles, {
  wait: false,  // 백그라운드 진행
});

console.log('Invalidation started');
```

**여러 패턴 무효화:**
```typescript
await invalidateCache(cfClient, distributionId, [
  '/index.html',      // 메인 페이지
  '/api/*',           // API 응답
  '/static/css/*',    // CSS 파일
  '/static/js/*',     // JS 파일
]);
```

#### 비용 최적화

**무료 무효화 할당:**
- 월 1,000건 무효화 무료
- 각 무효화는 최대 3,000개 경로 포함 가능

**권장 사항:**
```typescript
// ❌ 비효율적 (1,000건 소진)
for (const file of files) {
  await createInvalidation(cfClient, distId, { paths: [file] });
}

// ✅ 효율적 (1건만 사용)
await createInvalidation(cfClient, distId, {
  paths: files.slice(0, 3000),  // 최대 3,000개
});

// ✅ 가장 효율적 (전체 무효화)
await invalidateAll(cfClient, distId);
```

---

### 8. `cloudfront-deployer.ts` - CloudFront 배포 오케스트레이터

**목적**: S3 배포와 CloudFront를 통합하여 전체 배포 프로세스를 조율합니다.

#### 주요 함수

**`deployToCloudFront(config: SCFConfig, s3DeploymentStats: DeploymentStats, options?): Promise<CloudFrontDeploymentResult>`**

CloudFront에 배포하고 캐시를 무효화합니다.

```typescript
import { deployToCloudFront } from './cloudfront-deployer.js';

// S3 배포 먼저 수행
const s3Stats = await deployToS3(config);

// CloudFront 배포
const cfResult = await deployToCloudFront(config, s3Stats, {
  distributionId: 'E1234567890ABC',  // 기존 Distribution
  invalidateAll: true,
  waitForDeployment: true,
  waitForInvalidation: true,
});

console.log(`Distribution URL: ${cfResult.distributionUrl}`);
```

**옵션:**
```typescript
interface CloudFrontDeploymentOptions {
  distributionId?: string;         // 기존 Distribution ID
  invalidatePaths?: string[];      // 무효화할 경로 목록
  invalidateAll?: boolean;         // 전체 무효화 (기본: false)
  waitForDeployment?: boolean;     // 배포 완료 대기 (기본: true)
  waitForInvalidation?: boolean;   // 무효화 완료 대기 (기본: true)
  showProgress?: boolean;          // Progress 표시 (기본: true)
}
```

**반환 타입:**
```typescript
interface CloudFrontDeploymentResult {
  distributionId: string;        // Distribution ID
  distributionDomain: string;    // CloudFront 도메인
  distributionUrl: string;       // 전체 HTTPS URL
  invalidationId?: string;       // Invalidation ID
  isNewDistribution: boolean;    // 신규 생성 여부
  deploymentTime: number;        // 배포 소요 시간 (ms)
}
```

**`deployWithCloudFront(config: SCFConfig, deployToS3Function, options?): Promise<{s3Stats, cloudFront}>`**

S3 + CloudFront 통합 배포 함수입니다.

```typescript
import { deployWithCloudFront, deployToS3 } from 'scf';

const result = await deployWithCloudFront(config, deployToS3, {
  s3Options: {
    gzip: true,
    concurrency: 10,
  },
  cloudFrontOptions: {
    invalidateAll: true,
    waitForInvalidation: true,
  },
});

console.log(`S3: ${result.s3Stats.uploaded} files uploaded`);
console.log(`CloudFront: ${result.cloudFront.distributionUrl}`);
```

#### 배포 프로세스

**1단계: S3 배포**
```
🚀 Starting deployment...

📦 Step 1: S3 Deployment

✓ S3 bucket ready: my-bucket
✓ Found 42 files (2.3 MB)
📤 Uploading files...
✓ Uploaded: 40 files
```

**2단계: CloudFront 배포**
```
☁️  Step 2: CloudFront Deployment

✓ CloudFront distribution found: E1234567890ABC
✓ Distribution deployed
✓ Cache invalidation created: I2J3K4L5M6N7O8P9Q0

🌐 CloudFront Deployment Complete
Distribution ID: E1234567890ABC
Domain: d123456abcdef.cloudfront.net
URL: https://d123456abcdef.cloudfront.net
Deployment time: 45.23s
```

**3단계: 완료**
```
✨ Deployment completed successfully!
```

#### 자동 캐시 무효화

배포 방식에 따라 자동으로 캐시를 무효화합니다:

**1. 전체 무효화 (invalidateAll: true)**
```typescript
await deployToCloudFront(config, s3Stats, {
  invalidateAll: true,
});
// → 모든 캐시 무효화 (/*  패턴)
```

**2. 특정 경로 무효화**
```typescript
await deployToCloudFront(config, s3Stats, {
  invalidatePaths: ['/index.html', '/main.js'],
});
// → 지정된 경로만 무효화
```

**3. 자동 무효화 (업로드된 파일 기준)**
```typescript
await deployToCloudFront(config, s3Stats, {
  // invalidatePaths 지정 안함
});
// → S3에 업로드된 파일이 있으면 전체 무효화
```

**4. 무효화 안함**
```typescript
await deployToCloudFront(config, s3Stats, {
  invalidatePaths: [],
  invalidateAll: false,
});
// → 캐시 무효화 하지 않음
```

#### Distribution 생성 vs 업데이트

**기존 Distribution 사용:**
```typescript
// Config에 distributionId 지정
const result = await deployToCloudFront(config, s3Stats, {
  distributionId: 'E1234567890ABC',
});

console.log(result.isNewDistribution);  // false
```

**신규 Distribution 생성:**
```typescript
// distributionId 없으면 자동 생성
const result = await deployToCloudFront(config, s3Stats, {
  // distributionId 생략
});

console.log(result.isNewDistribution);  // true
console.log(result.distributionId);     // 새로 생성된 ID
```

#### Config 설정

```typescript
// scf.config.ts
export default defineConfig({
  app: 'my-website',
  region: 'ap-northeast-2',

  s3: {
    bucketName: 'my-website',
    buildDir: './dist',
  },

  cloudfront: {
    enabled: true,
    priceClass: 'PriceClass_100',
    defaultTTL: 86400,
    customDomain: {
      domainName: 'www.example.com',
      certificateArn: 'arn:aws:acm:us-east-1:...',
    },
  },
});
```

#### 전체 사용 예시

```typescript
import { loadConfig, deployWithCloudFront, deployToS3 } from 'scf';

async function fullDeploy() {
  // 1. Config 로드
  const config = await loadConfig({ env: 'prod' });

  // 2. S3 + CloudFront 통합 배포
  const result = await deployWithCloudFront(config, deployToS3, {
    s3Options: {
      gzip: true,
      concurrency: 10,
      showProgress: true,
    },
    cloudFrontOptions: {
      distributionId: 'E1234567890ABC',
      invalidateAll: true,
      waitForInvalidation: true,
      showProgress: true,
    },
  });

  // 3. 결과 확인
  console.log('\n📊 Deployment Summary:');
  console.log(`S3 Files: ${result.s3Stats.uploaded} uploaded`);
  console.log(`S3 Duration: ${(result.s3Stats.duration / 1000).toFixed(2)}s`);
  console.log(`CloudFront URL: ${result.cloudFront.distributionUrl}`);
  console.log(`Total Time: ${((result.s3Stats.duration + result.cloudFront.deploymentTime) / 1000).toFixed(2)}s`);
}

fullDeploy().catch(console.error);
```

#### 에러 처리

```typescript
try {
  const result = await deployToCloudFront(config, s3Stats, options);
} catch (error) {
  if (error.message.includes('CloudFront is not enabled')) {
    console.error('Enable CloudFront in your config');
  } else if (error.message.includes('Distribution') && error.message.includes('not found')) {
    console.error('Invalid distribution ID');
  } else if (error.message.includes('ACM')) {
    console.error('Certificate must be in us-east-1 region');
  } else {
    console.error('CloudFront deployment failed:', error);
  }
}
```

#### 성능 팁

**1. 병렬 대기 비활성화 (빠른 배포)**
```typescript
await deployToCloudFront(config, s3Stats, {
  waitForDeployment: false,      // 백그라운드 배포
  waitForInvalidation: false,    // 백그라운드 무효화
});
// 즉시 완료 (배포는 백그라운드에서 진행)
```

**2. 무효화만 대기**
```typescript
await deployToCloudFront(config, s3Stats, {
  waitForDeployment: false,      // Distribution 배포 대기 안함
  waitForInvalidation: true,     // 무효화는 대기
});
// 무효화 완료까지만 대기 (1-5분)
```

**3. 전부 대기 (안전한 배포)**
```typescript
await deployToCloudFront(config, s3Stats, {
  waitForDeployment: true,       // 모든 배포 대기
  waitForInvalidation: true,     // 모든 무효화 대기
});
// 완전히 배포 완료까지 대기 (10-20분)
```

---

## 📚 참고 자료

- [AWS SDK for JavaScript v3](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/)
- [AWS Credential Provider Chain](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/setting-credentials-node.html)
- [AWS STS GetCallerIdentity](https://docs.aws.amazon.com/STS/latest/APIReference/API_GetCallerIdentity.html)
- [IAM Best Practices](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html)
- [S3 API Reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-s3/)
- [CloudFront API Reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-cloudfront/)

---

## 📝 TODO

### Credentials & Auth
- [ ] Credentials 캐싱 지원 (성능 최적화)
- [ ] MFA (Multi-Factor Authentication) 지원
- [ ] Assume Role 지원 (Cross-account 배포)
- [ ] Credentials 만료 자동 갱신

### S3 Deployment
- [ ] 증분 배포 (State 관리 연동)
- [ ] 병렬 해시 계산
- [ ] 청크 업로드 progress (Multipart)
- [ ] S3 Transfer Acceleration 지원
- [ ] 버킷 버전 관리 지원

### CloudFront Deployment
- [x] Distribution 생성/관리
- [x] 캐시 무효화 자동화
- [x] 커스텀 도메인 설정
- [ ] Lambda@Edge 함수 연동
- [ ] WAF (Web Application Firewall) 통합
- [ ] CloudFront Functions 지원
- [ ] 실시간 로그 스트리밍
- [ ] 에러 페이지 커스터마이징 확장

### 공통
- [ ] Retry 전략 커스터마이징
- [ ] CloudWatch Logs 통합
- [ ] 배포 롤백 기능
- [ ] 배포 히스토리 추적
