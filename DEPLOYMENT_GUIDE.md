# SCF Deployment Guide with State Management

## 증분 배포 (Incremental Deployment)

SCF는 State 관리 시스템을 통해 자동으로 증분 배포를 지원합니다. 파일 해시를 비교하여 변경된 파일만 업로드하므로 배포 시간과 비용을 크게 절감할 수 있습니다.

### 자동 증분 배포

기본적으로 SCF는 증분 배포 모드로 작동합니다:

```typescript
import { loadConfig, deployToS3 } from "scf";

const config = await loadConfig();

// 첫 배포: 모든 파일 업로드
await deployToS3(config, {
  environment: "prod",
});

// 두 번째 배포: 변경된 파일만 업로드
await deployToS3(config, {
  environment: "prod",
});
```

### 배포 출력 예시

**첫 번째 배포 (전체 배포):**

```
✓ S3 bucket ready: my-bucket
✓ Found 50 files (2.5 MB)

📤 Uploading files...

Progress |████████████████████| 100% | 50/50 files

✓ Uploaded: 50 files
Total size: 2.5 MB
Compressed: 1.2 MB (52% reduction)
Duration: 5.23s

🌐 Website URL: http://my-bucket.s3-website.ap-northeast-2.amazonaws.com
✓ State saved (.deploy/state.prod.json)
```

**두 번째 배포 (증분 배포):**

```
✓ S3 bucket ready: my-bucket
✓ Found 50 files (2.5 MB)
✓ File changes analyzed

✓ Modified: 3 files
○ Unchanged: 47 files

📤 Uploading 3 changed files...

Progress |████████████████████| 100% | 3/3 files

✓ Uploaded: 3 files
Total size: 2.5 MB
Compressed: 1.2 MB (52% reduction)
Duration: 0.8s

🌐 Website URL: http://my-bucket.s3-website.ap-northeast-2.amazonaws.com
✓ State saved (.deploy/state.prod.json)
```

### 변경사항 없을 때

```
✓ S3 bucket ready: my-bucket
✓ Found 50 files (2.5 MB)
✓ File changes analyzed

○ Unchanged: 50 files

✨ No changes detected. Deployment not needed.
```

---

## 배포 옵션

### UploadOptions

```typescript
interface UploadOptions {
  // 기존 옵션
  gzip?: boolean; // Gzip 압축 (기본: true)
  concurrency?: number; // 동시 업로드 수 (기본: 10)
  showProgress?: boolean; // Progress 표시 (기본: true)
  dryRun?: boolean; // Dry-run 모드 (기본: false)

  // State 관리 옵션
  environment?: string; // 환경 이름 (기본: 'default')
  useIncrementalDeploy?: boolean; // 증분 배포 사용 (기본: true)
  forceFullDeploy?: boolean; // 강제 전체 배포 (기본: false)
  saveState?: boolean; // State 저장 (기본: true)
}
```

### 강제 전체 배포

State를 무시하고 모든 파일을 다시 업로드하려면:

```typescript
await deployToS3(config, {
  environment: "prod",
  forceFullDeploy: true, // State 무시, 전체 배포
});
```

**출력:**

```
⚠ Force full deployment enabled

📤 Uploading files...
```

### State 저장 비활성화

State 파일을 저장하지 않으려면 (테스트 배포 등):

```typescript
await deployToS3(config, {
  environment: "test",
  saveState: false, // State 저장 안함
});
```

### 증분 배포 비활성화

항상 전체 배포를 원하면:

```typescript
await deployToS3(config, {
  environment: "prod",
  useIncrementalDeploy: false, // 증분 배포 비활성화
});
```

---

## CloudFront State 통합

CloudFront 배포도 State와 자동 통합됩니다.

### Distribution ID 자동 관리

```typescript
import { deployToCloudFront } from "scf";

// 첫 배포: Distribution 생성
const result1 = await deployToCloudFront(config, s3Stats, {
  environment: "prod",
});
console.log(result1.distributionId); // E1234567890ABC
console.log(result1.isNewDistribution); // true

// 두 번째 배포: State에서 자동으로 Distribution ID 로드
const result2 = await deployToCloudFront(config, s3Stats, {
  environment: "prod",
  // distributionId 지정 안해도 자동으로 찾음
});
console.log(result2.distributionId); // E1234567890ABC (동일)
console.log(result2.isNewDistribution); // false
```

### CloudFront 배포 옵션

```typescript
interface CloudFrontDeploymentOptions {
  distributionId?: string; // Distribution ID (State에서 자동 로드)
  invalidatePaths?: string[]; // 무효화할 경로
  invalidateAll?: boolean; // 전체 무효화 (기본: false)
  waitForDeployment?: boolean; // 배포 대기 (기본: true)
  waitForInvalidation?: boolean; // 무효화 대기 (기본: true)
  showProgress?: boolean; // Progress 표시 (기본: true)
  environment?: string; // 환경 이름 (기본: 'default')
  saveState?: boolean; // State 저장 (기본: true)
}
```

### 통합 배포

S3 + CloudFront 통합 배포 시 환경을 일치시켜야 합니다:

```typescript
import { deployWithCloudFront, deployToS3 } from "scf";

const result = await deployWithCloudFront(config, deployToS3, {
  s3Options: {
    environment: "prod",
    useIncrementalDeploy: true,
  },
  cloudFrontOptions: {
    environment: "prod", // 동일한 environment 사용
    invalidateAll: true,
  },
});
```

---

## State 파일 관리

### State 파일 위치

```
.deploy/
├── state.json          # default 환경
├── state.dev.json      # dev 환경
├── state.prod.json     # prod 환경
└── state.staging.json  # staging 환경
```

### State 파일 내용

```json
{
  "app": "my-static-site",
  "environment": "prod",
  "version": "1.0.0",
  "lastDeployed": "2025-11-03T10:30:00.000Z",
  "resources": {
    "s3": {
      "bucketName": "my-site-prod",
      "region": "ap-northeast-2",
      "websiteUrl": "http://my-site-prod.s3-website.ap-northeast-2.amazonaws.com"
    },
    "cloudfront": {
      "distributionId": "E1234567890ABC",
      "domainName": "d123456.cloudfront.net",
      "distributionUrl": "https://d123456.cloudfront.net",
      "aliases": ["www.example.com"]
    }
  },
  "files": {
    "index.html": "a1b2c3d4e5f6...",
    "css/main.css": "f6e5d4c3b2a1...",
    "js/app.js": "1a2b3c4d5e6f..."
  }
}
```

### .gitignore에 추가

State 파일은 로컬 배포 상태를 추적하므로 Git에 커밋하지 마세요:

```gitignore
# Deployment state
.deploy/
```

---

## 환경별 배포

### 다중 환경 설정

```typescript
// scf.config.ts
export default defineConfig({
  app: "my-static-site",
  region: "ap-northeast-2",

  s3: {
    bucketName: "my-site-default",
    buildDir: "./dist",
  },

  environments: {
    dev: {
      s3: {
        bucketName: "my-site-dev",
      },
    },
    prod: {
      s3: {
        bucketName: "my-site-prod",
      },
      cloudfront: {
        enabled: true,
        priceClass: "PriceClass_All",
      },
    },
  },
});
```

### 환경별 배포 실행

```typescript
// Dev 환경 배포
await deployToS3(config, {
  environment: "dev",
});
// State: .deploy/state.dev.json

// Prod 환경 배포
await deployToS3(config, {
  environment: "prod",
});
// State: .deploy/state.prod.json
```

---

## 성능 최적화

### 증분 배포로 절감되는 시간

**시나리오: 50개 파일, 10MB 전체 크기**

| 배포 방식            | 업로드 파일 수 | 소요 시간 | 대역폭 |
| -------------------- | -------------- | --------- | ------ |
| 전체 배포 (첫 배포)  | 50개           | 30초      | 10MB   |
| 증분 배포 (5% 변경)  | 3개            | 1초       | 0.5MB  |
| 증분 배포 (10% 변경) | 5개            | 3초       | 1MB    |
| 증분 배포 (50% 변경) | 25개           | 15초      | 5MB    |
| 변경 없음            | 0개            | 0.2초     | 0MB    |

**결과:**

- 평균 **80-95% 시간 절감**
- 대역폭 사용량 **80-95% 감소**
- 불필요한 배포 자동 방지

---

## 문제 해결

### State 파일 손상

State 파일이 손상되었다면 삭제 후 재배포:

```bash
rm .deploy/state.prod.json
```

다음 배포 시 새로운 State가 생성됩니다.

### 모든 파일을 강제로 재업로드

```typescript
await deployToS3(config, {
  environment: "prod",
  forceFullDeploy: true,
});
```

### State 없이 배포

```typescript
await deployToS3(config, {
  environment: "test",
  useIncrementalDeploy: false,
  saveState: false,
});
```

---

## 모범 사례

### 1. 환경별 State 분리

```typescript
// ✅ 좋은 예: 환경별 독립 State
await deployToS3(config, { environment: "dev" });
await deployToS3(config, { environment: "prod" });
```

### 2. State 파일 백업 (선택)

중요한 프로덕션 환경의 경우:

```bash
# State 백업
cp .deploy/state.prod.json .deploy/state.prod.backup.json
```

### 3. CI/CD에서 State 활용

```yaml
# GitHub Actions 예시
- name: Deploy to S3
  run: |
    npx scf deploy --env prod

# State는 각 환경마다 독립적으로 관리
```

### 4. Dry-run으로 변경사항 확인

```typescript
// 실제 배포 전 확인
await deployToS3(config, {
  environment: "prod",
  dryRun: true, // 실제 업로드 안함
});
```

---

## 요약

- ✅ **자동 증분 배포**: 변경된 파일만 업로드
- ✅ **80-95% 시간 절감**: 대부분의 배포에서 극적인 속도 향상
- ✅ **State 자동 관리**: 리소스 추적 및 파일 해시 저장
- ✅ **환경별 독립**: dev, prod 등 환경마다 독립적인 State
- ✅ **CloudFront 통합**: Distribution ID 자동 관리
- ✅ **변경 없음 감지**: 불필요한 배포 자동 방지

증분 배포는 기본적으로 활성화되어 있으며, 별도 설정 없이 자동으로 작동합니다!
