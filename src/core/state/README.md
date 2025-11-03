# State Management Module

SCF의 State 관리 모듈입니다. 배포 상태를 추적하여 증분 배포(Incremental Deployment)와 리소스 정리를 지원합니다.

## 📁 파일 구조

```
src/core/state/
├── manager.ts         # State 파일 저장/로드
├── file-state.ts      # 파일 해시 추적 및 변경 감지
├── resource-state.ts  # AWS 리소스 메타데이터 관리
├── index.ts           # 통합 exports
└── README.md          # 본 문서
```

---

## 🎯 주요 기능

### 1. 증분 배포 (Incremental Deployment)
- 파일 해시 비교로 변경된 파일만 업로드
- 불필요한 업로드 방지로 배포 속도 향상
- 대역폭 및 비용 절감

### 2. 리소스 추적 (Resource Tracking)
- S3 버킷, CloudFront Distribution ID 저장
- 배포된 리소스 자동 추적
- `scf remove` 명령 시 정확한 리소스 삭제

### 3. 환경별 State 분리
- dev, prod 등 환경별 독립 State 파일
- 환경 간 간섭 없는 배포
- 다중 환경 동시 관리

---

## 📄 State 파일 구조

State 파일은 `.deploy/` 디렉토리에 JSON 형식으로 저장됩니다.

### 파일 위치
```
.deploy/
├── state.json              # default 환경
├── state.dev.json          # dev 환경
├── state.prod.json         # prod 환경
└── state.staging.json      # staging 환경
```

### 파일 내용
```json
{
  "app": "my-static-site",
  "environment": "prod",
  "version": "1.0.0",
  "lastDeployed": "2025-11-03T10:00:00.000Z",
  "resources": {
    "s3": {
      "bucketName": "my-site-prod-abc123",
      "region": "ap-northeast-2",
      "websiteUrl": "http://my-site-prod-abc123.s3-website.ap-northeast-2.amazonaws.com"
    },
    "cloudfront": {
      "distributionId": "E1234567890ABC",
      "domainName": "d123456abcdef.cloudfront.net",
      "distributionUrl": "https://d123456abcdef.cloudfront.net",
      "aliases": ["www.example.com", "example.com"]
    }
  },
  "files": {
    "index.html": "a1b2c3d4e5f6...",
    "css/main.css": "f6e5d4c3b2a1...",
    "js/app.js": "1a2b3c4d5e6f..."
  }
}
```

---

## 📚 API 문서

### 1. `manager.ts` - State 파일 관리

#### `loadState(options?: StateOptions): DeploymentState | null`

State 파일을 로드합니다.

```typescript
import { loadState } from './state/manager.js';

const state = loadState({ environment: 'prod' });

if (state) {
  console.log(`Last deployed: ${state.lastDeployed}`);
  console.log(`Files tracked: ${Object.keys(state.files).length}`);
}
```

**반환:**
- State 파일이 존재하면 `DeploymentState` 반환
- 없으면 `null` 반환

#### `saveState(state: DeploymentState, options?: StateOptions): void`

State를 파일에 저장합니다.

```typescript
import { saveState, initializeState } from './state/manager.js';

const state = initializeState('my-app', 'prod');

// 리소스 추가
state.resources.s3 = {
  bucketName: 'my-bucket',
  region: 'ap-northeast-2',
};

saveState(state, { environment: 'prod' });
```

**기능:**
- State 디렉토리 자동 생성
- `lastDeployed` 타임스탬프 자동 업데이트
- JSON 포맷으로 저장 (pretty print)

#### `stateExists(options?: StateOptions): boolean`

State 파일 존재 여부를 확인합니다.

```typescript
import { stateExists } from './state/manager.js';

if (stateExists({ environment: 'prod' })) {
  console.log('Previous deployment found');
} else {
  console.log('First deployment');
}
```

#### `getOrCreateState(app: string, options?: StateOptions): DeploymentState`

State를 로드하거나 없으면 새로 생성합니다.

```typescript
import { getOrCreateState } from './state/manager.js';

const state = getOrCreateState('my-app', { environment: 'prod' });
// 항상 유효한 DeploymentState 반환
```

#### `deleteState(options?: StateOptions): boolean`

State 파일을 삭제합니다.

```typescript
import { deleteState } from './state/manager.js';

const deleted = deleteState({ environment: 'dev' });

if (deleted) {
  console.log('State deleted');
}
```

#### `listStateFiles(stateDir?: string): string[]`

모든 State 파일 목록을 반환합니다.

```typescript
import { listStateFiles } from './state/manager.js';

const files = listStateFiles();
console.log(files);
// ['state.json', 'state.dev.json', 'state.prod.json']
```

---

### 2. `file-state.ts` - 파일 상태 추적

#### `compareFileHashes(currentFiles: FileInfo[], previousHashes: FileHashMap): FileChanges`

현재 파일과 이전 해시를 비교하여 변경사항을 감지합니다.

```typescript
import { compareFileHashes } from './state/file-state.js';
import { scanFiles } from '../deployer/file-scanner.js';

const currentFiles = await scanFiles({ buildDir: './dist' });
const previousHashes = state.files;

const changes = compareFileHashes(currentFiles, previousHashes);

console.log(`Added: ${changes.added.length}`);
console.log(`Modified: ${changes.modified.length}`);
console.log(`Unchanged: ${changes.unchanged.length}`);
console.log(`Deleted: ${changes.deleted.length}`);
```

**반환 타입:**
```typescript
interface FileChanges {
  added: FileChange[];       // 새로 추가된 파일
  modified: FileChange[];    // 수정된 파일
  unchanged: FileChange[];   // 변경 없는 파일
  deleted: FileChange[];     // 삭제된 파일
  totalChanges: number;      // 총 변경 수
}
```

#### `getFilesToUpload(currentFiles: FileInfo[], previousHashes: FileHashMap): FileInfo[]`

업로드가 필요한 파일만 필터링합니다.

```typescript
import { getFilesToUpload } from './state/file-state.js';

const currentFiles = await scanFiles({ buildDir: './dist' });
const filesToUpload = getFilesToUpload(currentFiles, state.files);

console.log(`Need to upload: ${filesToUpload.length} files`);
```

**반환:**
- 추가된 파일 + 수정된 파일
- 변경 없는 파일은 제외

#### `updateFileHashes(state: DeploymentState, files: FileInfo[]): DeploymentState`

State의 파일 해시를 업데이트합니다 (전체 교체).

```typescript
import { updateFileHashes } from './state/file-state.js';

const newState = updateFileHashes(state, currentFiles);
// 기존 파일 해시는 모두 삭제되고 새로운 해시로 교체
```

#### `mergeFileHashes(state: DeploymentState, files: FileInfo[]): DeploymentState`

파일 해시를 병합합니다 (추가/업데이트만).

```typescript
import { mergeFileHashes } from './state/file-state.js';

const newState = mergeFileHashes(state, uploadedFiles);
// 기존 파일 해시는 유지하고 업로드된 파일만 업데이트
```

#### `formatFileChanges(changes: FileChanges): string`

변경사항을 사람이 읽기 쉬운 형식으로 포맷합니다.

```typescript
import { formatFileChanges } from './state/file-state.js';

const formatted = formatFileChanges(changes);
console.log(formatted);
/*
✓ Added: 5 files
✓ Modified: 3 files
✓ Deleted: 1 files
○ Unchanged: 42 files
*/
```

---

### 3. `resource-state.ts` - 리소스 상태 관리

#### `updateS3Resource(state: DeploymentState, resource: S3ResourceState): DeploymentState`

S3 리소스 정보를 업데이트합니다.

```typescript
import { updateS3Resource, createS3ResourceState } from './state/resource-state.js';

const s3Resource = createS3ResourceState(
  'my-bucket',
  'ap-northeast-2',
  'http://my-bucket.s3-website.ap-northeast-2.amazonaws.com'
);

const newState = updateS3Resource(state, s3Resource);
```

#### `updateCloudFrontResource(state: DeploymentState, resource: CloudFrontResourceState): DeploymentState`

CloudFront 리소스 정보를 업데이트합니다.

```typescript
import { updateCloudFrontResource, createCloudFrontResourceState } from './state/resource-state.js';

const cfResource = createCloudFrontResourceState(
  'E1234567890ABC',
  'd123456.cloudfront.net',
  'https://d123456.cloudfront.net',
  ['www.example.com']
);

const newState = updateCloudFrontResource(state, cfResource);
```

#### `getS3Resource(state: DeploymentState): S3ResourceState | undefined`

S3 리소스 정보를 조회합니다.

```typescript
import { getS3Resource } from './state/resource-state.js';

const s3 = getS3Resource(state);

if (s3) {
  console.log(`Bucket: ${s3.bucketName}`);
  console.log(`Region: ${s3.region}`);
}
```

#### `formatResourceSummary(state: DeploymentState): string`

리소스 정보를 요약하여 표시합니다.

```typescript
import { formatResourceSummary } from './state/resource-state.js';

const summary = formatResourceSummary(state);
console.log(summary);
/*
App: my-static-site
Environment: prod
Last Deployed: 11/3/2025, 10:00:00 AM

S3 Bucket:
  Name: my-site-prod-abc123
  Region: ap-northeast-2
  URL: http://...

CloudFront Distribution:
  ID: E1234567890ABC
  URL: https://d123456.cloudfront.net
  Aliases: www.example.com

Files: 50 tracked
*/
```

#### `getResourceIdentifiers(state: DeploymentState): {...}`

리소스 식별자를 추출합니다 (삭제 시 사용).

```typescript
import { getResourceIdentifiers } from './state/resource-state.js';

const identifiers = getResourceIdentifiers(state);

if (identifiers.distributionId) {
  await deleteDistribution(identifiers.distributionId);
}

if (identifiers.s3BucketName) {
  await deleteBucket(identifiers.s3BucketName);
}
```

---

## 💡 사용 시나리오

### 시나리오 1: 첫 배포 (State 생성)

```typescript
import { getOrCreateState, saveState, updateFileHashes, updateS3Resource } from 'scf';

async function firstDeploy() {
  // 1. State 로드 또는 생성
  const state = getOrCreateState('my-app', { environment: 'prod' });

  // 2. S3 배포
  const stats = await deployToS3(config);

  // 3. State에 리소스 저장
  const newState = updateS3Resource(state, {
    bucketName: 'my-bucket',
    region: 'ap-northeast-2',
  });

  // 4. 파일 해시 저장
  const finalState = updateFileHashes(newState, scannedFiles);

  // 5. State 파일 저장
  saveState(finalState, { environment: 'prod' });
}
```

### 시나리오 2: 증분 배포 (변경된 파일만)

```typescript
import { loadState, getFilesToUpload, mergeFileHashes, saveState } from 'scf';

async function incrementalDeploy() {
  // 1. 기존 State 로드
  const state = loadState({ environment: 'prod' });

  if (!state) {
    throw new Error('No previous deployment found');
  }

  // 2. 현재 파일 스캔
  const currentFiles = await scanFiles({ buildDir: './dist' });

  // 3. 변경된 파일만 필터링
  const filesToUpload = getFilesToUpload(currentFiles, state.files);

  console.log(`Uploading ${filesToUpload.length} changed files`);

  // 4. 변경된 파일만 업로드
  await uploadFiles(s3Client, bucketName, filesToUpload);

  // 5. State 업데이트 (병합)
  const newState = mergeFileHashes(state, filesToUpload);

  // 6. 저장
  saveState(newState, { environment: 'prod' });
}
```

### 시나리오 3: 변경사항 확인

```typescript
import { loadState, compareFileHashes, formatFileChanges } from 'scf';

async function checkChanges() {
  const state = loadState({ environment: 'prod' });

  if (!state) {
    console.log('No previous deployment');
    return;
  }

  const currentFiles = await scanFiles({ buildDir: './dist' });
  const changes = compareFileHashes(currentFiles, state.files);

  console.log(formatFileChanges(changes));

  if (changes.totalChanges === 0) {
    console.log('No changes detected. Deployment not needed.');
  }
}
```

### 시나리오 4: 리소스 정리

```typescript
import { loadState, getResourceIdentifiers, deleteState } from 'scf';

async function cleanup() {
  const state = loadState({ environment: 'dev' });

  if (!state) {
    console.log('No resources to clean up');
    return;
  }

  const identifiers = getResourceIdentifiers(state);

  // CloudFront 삭제
  if (identifiers.distributionId) {
    await deleteDistribution(identifiers.distributionId);
  }

  // S3 버킷 삭제
  if (identifiers.s3BucketName) {
    await emptyAndDeleteBucket(identifiers.s3BucketName);
  }

  // State 파일 삭제
  deleteState({ environment: 'dev' });
}
```

### 시나리오 5: 다중 환경 관리

```typescript
import { loadState, listStateFiles } from 'scf';

async function listDeployments() {
  const stateFiles = listStateFiles();

  for (const file of stateFiles) {
    const env = file.replace('state.', '').replace('.json', '');
    const state = loadState({ environment: env });

    if (state) {
      console.log(`\n=== ${env.toUpperCase()} ===`);
      console.log(`Last deployed: ${state.lastDeployed}`);
      console.log(`Files: ${Object.keys(state.files).length}`);
    }
  }
}
```

---

## 🔒 보안 고려사항

### 1. State 파일에 민감 정보 저장 금지

**❌ 나쁜 예:**
```json
{
  "resources": {
    "s3": {
      "bucketName": "my-bucket",
      "accessKeyId": "AKIAIOSFODNN7EXAMPLE",  // ❌ 절대 저장 금지!
      "secretAccessKey": "wJalrXUt..."         // ❌ 절대 저장 금지!
    }
  }
}
```

**✅ 좋은 예:**
```json
{
  "resources": {
    "s3": {
      "bucketName": "my-bucket",
      "region": "ap-northeast-2"
    }
  }
}
```

### 2. .gitignore에 State 디렉토리 추가

```gitignore
# Deployment state
.deploy/
```

**이유:**
- State 파일은 로컬 배포 상태를 추적
- 팀원마다 다른 환경에 배포할 수 있음
- Git에 커밋하면 충돌 발생 가능

### 3. State 파일 검증

```typescript
import { validateResourceState } from 'scf';

const state = loadState({ environment: 'prod' });

if (state) {
  const validation = validateResourceState(state);

  if (!validation.valid) {
    console.error('Invalid state:', validation.errors);
  }
}
```

---

## 🧪 테스트 예시

```typescript
import { initializeState, updateFileHashes, compareFileHashes } from './state';

test('should detect file changes', () => {
  const state = initializeState('test-app', 'test');

  const files1 = [
    { key: 'index.html', hash: 'abc123' },
    { key: 'main.js', hash: 'def456' },
  ];

  const state1 = updateFileHashes(state, files1);

  const files2 = [
    { key: 'index.html', hash: 'abc123' },  // unchanged
    { key: 'main.js', hash: 'xyz789' },     // modified
    { key: 'style.css', hash: 'ghi012' },   // added
  ];

  const changes = compareFileHashes(files2, state1.files);

  expect(changes.unchanged.length).toBe(1);
  expect(changes.modified.length).toBe(1);
  expect(changes.added.length).toBe(1);
  expect(changes.deleted.length).toBe(0);
});
```

---

## 📊 성능 최적화

### 증분 배포로 절감되는 시간

**시나리오: 50개 파일, 10MB 전체 크기**

| 배포 방식 | 업로드 파일 수 | 소요 시간 | 대역폭 |
|---------|------------|----------|--------|
| 전체 배포 | 50개 | 30초 | 10MB |
| 증분 배포 (10% 변경) | 5개 | 3초 | 1MB |
| 증분 배포 (50% 변경) | 25개 | 15초 | 5MB |

**결과:**
- 평균 **70-90% 시간 절감**
- 대역폭 사용량 **70-90% 감소**

---

## 🚨 문제 해결

### 1. State 파일이 손상됨

```typescript
// State 파일 삭제 후 재배포
import { deleteState } from 'scf';

deleteState({ environment: 'prod' });
// 다음 배포에서 새로운 State 생성됨
```

### 2. 모든 파일을 강제로 재업로드하고 싶음

```typescript
// State 무시하고 전체 배포
const allFiles = await scanFiles({ buildDir: './dist' });
await uploadFiles(s3Client, bucketName, allFiles);

// 새로운 해시로 State 업데이트
const newState = updateFileHashes(state, allFiles);
saveState(newState, { environment: 'prod' });
```

### 3. 환경별 State가 섞임

```bash
# State 파일 확인
ls -la .deploy/

# 올바른 환경 지정
scf deploy --env prod  # state.prod.json 사용
scf deploy --env dev   # state.dev.json 사용
```

---

## 📚 참고 자료

- [Incremental Deployment 패턴](https://martinfowler.com/bliki/BlueGreenDeployment.html)
- [File Hashing 알고리즘](https://nodejs.org/api/crypto.html)
- [State 관리 Best Practices](https://12factor.net/config)
