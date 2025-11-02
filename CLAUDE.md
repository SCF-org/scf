# S3 + CloudFront 정적 배포 자동화 도구 (SCF)

## 프로젝트 개요

S3 + CloudFront 정적 배포 자동화 CLI 도구입니다. npx 명령어를 통해 간편하게 정적 웹사이트를 AWS에 배포하고 관리할 수 있습니다.

## 핵심 기능

- **npx 명령어 실행**: `npx scf deploy` 형태로 간편한 배포
- **TypeScript 기반 설정**: `scf.config.ts` 파일로 타입 안전한 설정 관리
- **AWS Credentials 통합**: AWS Profile, 환경변수, IAM Role 등 다양한 인증 방식 지원
- **증분 배포**: 파일 해시 비교를 통해 변경된 파일만 업로드하여 배포 속도 최적화
- **CloudFront 자동화**: 배포 후 자동으로 CloudFront 캐시 무효화 수행
- **상태 관리**: 로컬 state 파일로 배포된 리소스 추적 및 관리
- **환경별 배포**: dev, prod 등 다양한 환경 설정 지원

## 기술 스택

### 언어 및 프레임워크

- **TypeScript**: 전체 코드베이스
- **Commander.js**: CLI 프레임워크
- **tsx/jiti**: TypeScript config 파일 런타임 실행

### AWS SDK

- `@aws-sdk/client-s3`: S3 버킷 관리 및 파일 업로드
- `@aws-sdk/client-cloudfront`: CloudFront 배포 및 캐시 무효화
- `@aws-sdk/client-sts`: AWS 인증 정보 확인
- `@aws-sdk/credential-providers`: 다양한 인증 방식 지원
- `@aws-sdk/lib-storage`: Multipart 업로드 지원

### 유틸리티 라이브러리

- **Zod**: Config 스키마 검증
- **chalk**: 컬러풀한 CLI 출력
- **ora**: 로딩 스피너
- **cli-progress**: Progress bar
- **inquirer**: 사용자 인터랙션
- **fast-glob**: 파일 스캔
- **hasha**: 파일 해시 계산
- **p-limit**: 병렬 업로드 동시성 제어
- **mime-types**: Content-Type 자동 설정

### 빌드 도구

- **tsup**: 빌드 및 번들링

## 프로젝트 구조

```
scf/
├── packages/
│   ├── cli/              # CLI 진입점
│   │   ├── src/
│   │   │   ├── commands/
│   │   │   │   ├── deploy.ts    # 배포 명령어
│   │   │   │   ├── remove.ts    # 삭제 명령어
│   │   │   │   └── status.ts    # 상태 확인
│   │   │   ├── index.ts
│   │   │   └── cli.ts
│   │   └── package.json
│   │
│   ├── core/             # 핵심 로직
│   │   ├── src/
│   │   │   ├── config/          # Config 파싱 및 검증
│   │   │   ├── aws/             # AWS 리소스 관리
│   │   │   │   ├── credentials.ts
│   │   │   │   ├── s3-deployer.ts
│   │   │   │   └── cloudfront-deployer.ts
│   │   │   ├── state/           # 상태 관리
│   │   │   └── deployer/        # 배포 오케스트레이션
│   │   └── package.json
│   │
│   └── types/            # 공유 타입 정의
│       └── src/
│           └── config.ts
│
├── examples/             # 예제 프로젝트
└── package.json          # Monorepo 루트
```

## 핵심 아키텍처

### 1. CLI 레이어

사용자 명령어를 처리하고 적절한 core 함수를 호출합니다. Commander.js를 사용하여 `deploy`, `remove`, `status` 명령어를 제공합니다.

### 2. Config 레이어

TypeScript로 작성된 설정 파일을 런타임에 실행하고 Zod로 검증합니다. 환경별 설정 오버라이드를 지원합니다.

```typescript
// scf.config.ts
export default defineConfig({
  app: "my-static-site",
  region: "ap-northeast-2",
  s3: {
    bucketName: "my-site-bucket",
    buildDir: "./dist",
    indexDocument: "index.html",
    errorDocument: "404.html",
  },
  cloudfront: {
    enabled: true,
    priceClass: "PriceClass_100",
    customDomain: {
      domainName: "example.com",
      certificateArn: "arn:aws:acm:...",
    },
  },
  environments: {
    dev: { s3: { bucketName: "my-site-dev" } },
    prod: { cloudfront: { priceClass: "PriceClass_All" } },
  },
});
```

### 3. AWS 레이어

AWS SDK를 통해 실제 리소스를 생성하고 관리합니다.

**Credential 처리:**

- 환경변수 우선 (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)
- AWS Profile (~/.aws/credentials)
- IAM Role (EC2/ECS 등 CI/CD 환경)
- 임시 세션 토큰 지원

**S3 Deployer:**

- 버킷 존재 확인 및 생성
- 빌드 디렉토리 파일 스캔
- 파일 해시 비교로 변경 감지
- 병렬 업로드 (동시성 제어)
- Content-Type 자동 설정
- Gzip 압축 (텍스트 파일)
- Multipart 업로드 (큰 파일)
- Static Website 설정

**CloudFront Deployer:**

- Distribution 존재 확인
- 신규 생성 또는 기존 업데이트
- 캐시 무효화 (Invalidation)
- 배포 활성화 대기 (진행률 표시)
- 커스텀 도메인 및 SSL 인증서 설정

### 4. State 관리 레이어

배포된 리소스를 추적하고 증분 배포 및 삭제를 지원합니다.

```json
{
  "app": "my-static-site",
  "environment": "prod",
  "lastDeployed": "2025-10-30T10:00:00Z",
  "resources": {
    "s3": {
      "bucketName": "my-site-prod-abc123",
      "region": "ap-northeast-2"
    },
    "cloudfront": {
      "distributionId": "E1234567890ABC",
      "domainName": "d123456.cloudfront.net"
    }
  },
  "files": {
    "index.html": "abc123...",
    "main.js": "def456..."
  }
}
```

## 주요 명령어

### deploy

정적 사이트를 S3에 업로드하고 CloudFront를 통해 배포합니다.

```bash
# 기본 배포
npx scf deploy

# 특정 환경으로 배포
npx scf deploy --env prod

# 커스텀 설정 파일 사용
npx scf deploy --config custom.config.ts

# AWS Profile 지정
npx scf deploy --profile my-aws-profile

# Dry-run 모드
npx scf deploy --dry-run
```

### remove

배포된 리소스를 삭제합니다.

```bash
# 리소스 삭제 (확인 프롬프트)
npx scf remove

# 확인 없이 강제 삭제
npx scf remove --force

# 특정 환경 삭제
npx scf remove --env dev
```

### status

현재 배포 상태를 확인합니다.

```bash
npx scf status
```

## 최적화 기능

### 증분 배포

- 파일 내용의 SHA-256 해시를 계산
- 이전 배포와 비교하여 변경된 파일만 업로드
- State 파일에 파일별 해시 저장

### 병렬 업로드

- p-limit으로 동시성 제어 (기본 10개)
- Progress bar로 업로드 진행률 표시
- 큰 파일은 Multipart 업로드 자동 사용

### Gzip 압축

- HTML, CSS, JS 등 텍스트 파일 자동 압축
- Content-Encoding 헤더 설정
- 전송 크기 최소화

### CloudFront 캐시 최적화

- 배포 후 자동 캐시 무효화
- 커스텀 TTL 설정 지원
- Price Class 설정으로 비용 최적화

## 보안 고려사항

- **Credential 보호**: State 파일에 Credential 절대 저장 금지
- **버킷 이름 충돌 방지**: Random suffix로 고유한 버킷 이름 생성
- **gitignore**: `.deploy/` 폴더를 gitignore에 추가 권장
- **최소 권한 원칙**: 필요한 AWS 권한만 요구

## 확장성

### Plugin 시스템

추후 Lambda@Edge, Serverless Functions 등 추가 기능을 플러그인으로 확장 가능

### Hook 시스템

- pre-deploy: 배포 전 실행 (빌드, 테스트 등)
- post-deploy: 배포 후 실행 (알림, 로깅 등)

### 다른 플랫폼 지원

Vercel, Netlify 등 다른 정적 호스팅 플랫폼 지원 계획

## NPM 배포

```bash
# 로컬 테스트
npm link
scf deploy

# 배포 전 dry-run
npm publish --dry-run

# 실제 배포
npm publish

# 베타 버전
npm publish --tag beta
```

## 사용자 사용법

```bash
# npx로 직접 실행
npx @your-org/scf deploy

# 글로벌 설치
npm install -g @your-org/scf
scf deploy
```

## 개발 우선순위

1. **CLI + Config 시스템**: 기본 틀 구축
2. **S3 배포**: 핵심 기능 구현
3. **CloudFront 연동**: CDN 자동화
4. **State 관리 + Remove**: 리소스 추적 및 삭제
5. **최적화 + 에러 핸들링**: 사용자 경험 개선
6. **문서화 + 예제**: README, 예제 프로젝트
7. **베타 테스트**: 실제 프로젝트 적용 및 피드백
8. **정식 릴리즈**: NPM 배포

## 핵심 체크포인트

### 배포 전 확인

1. 빌드가 정상적으로 되는지 확인
2. Shebang (`#!/usr/bin/env node`) 존재 확인
3. 로컬에서 명령어 실행 테스트
4. 필수 파일만 포함되는지 확인 (`npm pack --dry-run`)

### 특별히 주의할 부분

1. **증분 배포**: 해시 비교로 변경된 파일만 업로드
2. **CloudFront 캐시 무효화**: 배포 후 자동 실행 필수
3. **State 관리**: 삭제할 리소스 추적
4. **Shebang**: CLI 진입점 첫 줄에 필수
5. **ESM 모드**: chalk, ora v5+ 는 ESM only

## 참고 자료

- [AWS SDK v3 문서](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/)
- [Commander.js](https://github.com/tj/commander.js)
- [NPM 배포 가이드](https://docs.npmjs.com/cli/v10/commands/npm-publish)
