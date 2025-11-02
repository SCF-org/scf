# AWS Integration Module

SCF의 AWS 통합 모듈입니다. AWS 인증 정보 관리, 검증, 그리고 S3/CloudFront 클라이언트 생성을 담당합니다.

## 📁 파일 구조

```
src/core/aws/
├── credentials.ts    # AWS 인증 정보 Resolution
├── verify.ts         # STS를 통한 인증 검증
├── client.ts         # AWS Client 생성 헬퍼
├── index.ts          # 통합 entry point
└── README.md         # 본 문서
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

## 📚 참고 자료

- [AWS SDK for JavaScript v3](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/)
- [AWS Credential Provider Chain](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/setting-credentials-node.html)
- [AWS STS GetCallerIdentity](https://docs.aws.amazon.com/STS/latest/APIReference/API_GetCallerIdentity.html)
- [IAM Best Practices](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html)
- [S3 API Reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-s3/)
- [CloudFront API Reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-cloudfront/)

---

## 📝 TODO

- [ ] Credentials 캐싱 지원 (성능 최적화)
- [ ] MFA (Multi-Factor Authentication) 지원
- [ ] Assume Role 지원 (Cross-account 배포)
- [ ] Credentials 만료 자동 갱신
- [ ] Retry 전략 커스터마이징
- [ ] CloudWatch Logs 통합
