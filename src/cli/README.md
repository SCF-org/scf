# SCF CLI Documentation

SCF (S3 + CloudFront) CLI는 정적 웹사이트를 AWS S3와 CloudFront에 자동으로 배포하고 관리하는 명령줄 도구입니다.

## 목차

- [설치](#설치)
- [기본 사용법](#기본-사용법)
- [명령어](#명령어)
  - [deploy](#deploy)
  - [remove](#remove)
  - [status](#status)
- [공통 옵션](#공통-옵션)
- [환경 설정](#환경-설정)
- [내부 구조](#내부-구조)

## 설치

```bash
# NPM으로 설치
npm install -g scf

# 또는 npx로 직접 실행
npx scf deploy
```

## 기본 사용법

```bash
# 버전 확인
scf --version

# 도움말 확인
scf --help

# 명령어별 도움말
scf deploy --help
scf remove --help
scf status --help
```

## 명령어

### deploy

정적 사이트를 S3에 업로드하고 CloudFront를 통해 배포합니다.

#### 사용법

```bash
scf deploy [options]
```

#### 옵션

| 옵션 | 설명 | 기본값 |
|------|------|--------|
| `-e, --env <environment>` | 환경 이름 (dev, prod 등) | `default` |
| `-c, --config <path>` | 설정 파일 경로 | `scf.config.ts` |
| `-p, --profile <profile>` | AWS 프로필 이름 | - |
| `--dry-run` | 실제 업로드 없이 미리보기 | `false` |
| `--no-cloudfront` | CloudFront 배포 건너뛰기 | `false` |
| `--force` | 전체 재배포 (state 무시) | `false` |
| `--skip-cache` | CloudFront 캐시 무효화 건너뛰기 | `false` |

#### 동작 과정

1. **설정 파일 로드**: `scf.config.ts` 파일을 읽고 검증
2. **AWS 자격증명 확인**: AWS 계정 접근 권한 확인
3. **S3 배포**:
   - 빌드 디렉토리 스캔
   - 파일 해시 비교 (증분 배포)
   - 변경된 파일만 업로드
   - State 저장
4. **CloudFront 배포** (옵션):
   - Distribution 생성 또는 업데이트
   - 캐시 무효화
   - State 저장
5. **배포 요약 출력**

#### 예제

```bash
# 기본 배포
scf deploy

# 프로덕션 환경 배포
scf deploy --env prod

# 특정 AWS 프로필 사용
scf deploy --profile my-company-profile

# 미리보기 (실제 업로드 없음)
scf deploy --dry-run

# CloudFront 없이 S3만 배포
scf deploy --no-cloudfront

# 전체 파일 재배포 (캐시 무시)
scf deploy --force

# 개발 환경에 커스텀 설정 파일로 배포
scf deploy --env dev --config config/scf.dev.ts
```

#### 증분 배포

기본적으로 deploy 명령어는 증분 배포를 수행합니다:

- **첫 배포**: 모든 파일 업로드
- **후속 배포**: 변경된 파일만 업로드 (SHA-256 해시 비교)
- **시간 절약**: 80-95% 배포 시간 단축

증분 배포를 비활성화하려면 `--force` 옵션을 사용하세요.

### remove

배포된 AWS 리소스를 삭제합니다.

#### 사용법

```bash
scf remove [options]
```

#### 옵션

| 옵션 | 설명 | 기본값 |
|------|------|--------|
| `-e, --env <environment>` | 환경 이름 | `default` |
| `-c, --config <path>` | 설정 파일 경로 | `scf.config.ts` |
| `-p, --profile <profile>` | AWS 프로필 이름 | - |
| `-f, --force` | 확인 프롬프트 건너뛰기 | `false` |
| `--keep-bucket` | S3 버킷 유지 (파일만 삭제) | `false` |
| `--keep-distribution` | CloudFront Distribution 유지 | `false` |

#### 동작 과정

1. **배포 State 로드**: 삭제할 리소스 확인
2. **리소스 요약 출력**: 삭제될 리소스 표시
3. **확인 프롬프트**: 사용자 확인 요청 (`--force` 없을 때)
4. **AWS 자격증명 확인**
5. **CloudFront Distribution 삭제**:
   - Distribution 비활성화
   - 배포 완료 대기
   - Distribution 삭제
6. **S3 버킷 삭제**:
   - 모든 객체 삭제
   - 버킷 삭제
7. **State 파일 삭제**

#### 예제

```bash
# 기본 삭제 (확인 프롬프트 표시)
scf remove

# 특정 환경 삭제
scf remove --env dev

# 확인 없이 강제 삭제
scf remove --force

# S3 파일만 삭제하고 버킷 유지
scf remove --keep-bucket

# CloudFront만 유지하고 S3 삭제
scf remove --keep-distribution

# 프로덕션 환경 강제 삭제
scf remove --env prod --force
```

#### 주의사항

- **돌이킬 수 없는 작업**: 삭제된 리소스는 복구할 수 없습니다
- **확인 프롬프트**: 기본적으로 삭제 전 확인을 요청합니다
- **CloudFront 삭제 시간**: Distribution 비활성화 및 삭제에 최대 20분 소요될 수 있습니다
- **프로덕션 주의**: `--force` 옵션 사용 시 각별히 주의하세요

### status

현재 배포 상태를 확인합니다.

#### 사용법

```bash
scf status [options]
```

#### 옵션

| 옵션 | 설명 | 기본값 |
|------|------|--------|
| `-e, --env <environment>` | 환경 이름 | `default` |
| `-d, --detailed` | 상세 정보 표시 | `false` |
| `--json` | JSON 형식으로 출력 | `false` |

#### 출력 정보

**기본 정보**:
- 앱 이름
- 환경 이름
- 마지막 배포 시간
- 추적 중인 파일 개수

**S3 정보** (배포된 경우):
- 버킷 이름
- 리전
- 웹사이트 URL

**CloudFront 정보** (배포된 경우):
- Distribution ID
- CloudFront URL
- 커스텀 도메인 (설정된 경우)

**상세 모드** (`--detailed`):
- 배포된 파일 목록 (최대 20개 표시)
- 각 파일의 해시값

**여러 환경**:
- 모든 배포된 환경 목록
- 각 환경의 마지막 배포 시간

#### 예제

```bash
# 기본 상태 확인
scf status

# 특정 환경 상태 확인
scf status --env prod

# 상세 정보 포함
scf status --detailed

# JSON 형식으로 출력
scf status --json

# JSON + 상세 정보
scf status --json --detailed
```

#### JSON 출력 형식

```json
{
  "app": "my-static-site",
  "environment": "prod",
  "lastDeployed": "2025-11-03T10:30:00.000Z",
  "resources": {
    "s3": {
      "bucketName": "my-site-prod-abc123",
      "region": "ap-northeast-2",
      "websiteUrl": "http://my-site-prod-abc123.s3-website.ap-northeast-2.amazonaws.com"
    },
    "cloudfront": {
      "distributionId": "E1234567890ABC",
      "domainName": "d123456.cloudfront.net",
      "distributionUrl": "https://d123456.cloudfront.net"
    }
  },
  "fileCount": 42,
  "version": "1.0.0"
}
```

## 공통 옵션

### 환경 설정 (`--env`)

여러 환경(dev, staging, prod 등)을 구분하여 관리할 수 있습니다.

```bash
# 개발 환경
scf deploy --env dev

# 스테이징 환경
scf deploy --env staging

# 프로덕션 환경
scf deploy --env prod
```

각 환경은:
- 독립적인 State 파일 유지 (`.deploy/state.{env}.json`)
- 환경별 설정 오버라이드 가능 (`scf.config.ts`의 `environments` 섹션)

### AWS 프로필 (`--profile`)

AWS CLI 프로필을 지정하여 다른 AWS 계정이나 권한을 사용할 수 있습니다.

```bash
scf deploy --profile company-prod
scf deploy --profile personal-dev
```

프로필은 `~/.aws/credentials` 파일에서 설정됩니다.

### 설정 파일 경로 (`--config`)

기본 설정 파일(`scf.config.ts`) 대신 다른 파일을 사용할 수 있습니다.

```bash
scf deploy --config config/prod.config.ts
scf deploy --config ../shared/scf.config.js
```

## 환경 설정

### scf.config.ts

CLI는 TypeScript로 작성된 설정 파일을 지원합니다.

```typescript
import { defineConfig } from 'scf';

export default defineConfig({
  app: 'my-static-site',
  region: 'ap-northeast-2',

  s3: {
    bucketName: 'my-site-bucket',
    buildDir: './dist',
    indexDocument: 'index.html',
    errorDocument: '404.html',
  },

  cloudfront: {
    enabled: true,
    priceClass: 'PriceClass_100',
    customDomain: {
      domainName: 'example.com',
      certificateArn: 'arn:aws:acm:us-east-1:123456789012:certificate/abc-def',
    },
  },

  // 환경별 설정 오버라이드
  environments: {
    dev: {
      s3: { bucketName: 'my-site-dev' },
      cloudfront: { enabled: false },
    },
    prod: {
      cloudfront: { priceClass: 'PriceClass_All' },
    },
  },
});
```

### AWS 자격증명

CLI는 다음 순서로 AWS 자격증명을 찾습니다:

1. **명령줄 옵션**: `--profile` 플래그
2. **설정 파일**: `scf.config.ts`의 `credentials` 섹션
3. **환경 변수**: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`
4. **AWS CLI 프로필**: `~/.aws/credentials`
5. **IAM Role**: EC2, ECS 등 AWS 환경에서 실행 시

## 내부 구조

### 디렉토리 구조

```
src/cli/
├── commands/
│   ├── deploy.ts      # deploy 명령어 구현
│   ├── remove.ts      # remove 명령어 구현
│   └── status.ts      # status 명령어 구현
├── utils/
│   └── logger.ts      # 로깅 유틸리티
├── cli.ts             # Commander.js 프로그램 설정
├── index.ts           # CLI 진입점
└── README.md          # 이 문서
```

### 명령어 구현 패턴

각 명령어는 다음 패턴을 따릅니다:

```typescript
// 1. 옵션 인터페이스 정의
interface CommandOptions {
  env?: string;
  config?: string;
  // ... 기타 옵션
}

// 2. Commander 명령어 생성 함수
export function createCommandCommand(): Command {
  const command = new Command('command-name');

  command
    .description('명령어 설명')
    .option('-e, --env <environment>', '환경 이름', 'default')
    .action(async (options: CommandOptions) => {
      try {
        await commandHandler(options);
      } catch (error: any) {
        logger.error(error.message);
        process.exit(1);
      }
    });

  return command;
}

// 3. 실제 비즈니스 로직 핸들러
async function commandHandler(options: CommandOptions): Promise<void> {
  // 명령어 로직 구현
}
```

### 로깅 유틸리티

`utils/logger.ts`는 일관된 CLI 출력을 위한 헬퍼 함수를 제공합니다:

```typescript
import * as logger from '../utils/logger.js';

logger.info('정보 메시지');      // ℹ 정보 메시지
logger.success('성공 메시지');   // ✓ 성공 메시지 (녹색)
logger.warn('경고 메시지');      // ⚠ 경고 메시지 (노란색)
logger.error('에러 메시지');     // ✗ 에러 메시지 (빨간색)
logger.section('섹션 제목');     // === 섹션 제목 === (파란색, 굵게)
logger.keyValue('키', '값');     // 키: 값 (정렬된 형식)
```

### 에러 처리

모든 명령어는 통일된 에러 처리를 수행합니다:

```typescript
try {
  await commandHandler(options);
} catch (error: any) {
  logger.error(error.message);
  process.exit(1);
}
```

사용자에게는 명확한 에러 메시지가 표시되며, 프로세스는 exit code 1로 종료됩니다.

## 문제 해결

### 명령어가 작동하지 않음

```bash
# CLI가 설치되었는지 확인
which scf

# 전역 재설치
npm uninstall -g scf
npm install -g scf

# 또는 npx로 실행
npx scf deploy
```

### AWS 자격증명 오류

```bash
# AWS 자격증명 확인
aws sts get-caller-identity

# 또는 특정 프로필로 확인
aws sts get-caller-identity --profile my-profile

# SCF에서 프로필 사용
scf deploy --profile my-profile
```

### 설정 파일을 찾을 수 없음

```bash
# 현재 디렉토리에 scf.config.ts가 있는지 확인
ls -la scf.config.ts

# 또는 경로 명시
scf deploy --config ./config/scf.config.ts
```

### State 파일 충돌

```bash
# State 파일 확인
ls -la .deploy/

# 특정 환경의 State 삭제 (주의!)
rm .deploy/state.prod.json

# 전체 재배포
scf deploy --force
```

## 추가 리소스

- [메인 프로젝트 문서](../../CLAUDE.md)
- [배포 가이드](../core/state/README.md)
- [설정 스키마](../types/config.ts)

## 라이센스

MIT
