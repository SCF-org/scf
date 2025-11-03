// 모든 테스트 전에 환경변수 초기화
beforeEach(() => {
  // AWS credentials를 테스트용으로 설정
  process.env.AWS_ACCESS_KEY_ID = 'test-access-key';
  process.env.AWS_SECRET_ACCESS_KEY = 'test-secret-key';
  process.env.AWS_REGION = 'us-east-1';
});

// 각 테스트 후 환경변수 정리
afterEach(() => {
  // E2E 테스트가 아닌 경우에만 정리
  if (!process.env.E2E_TEST) {
    delete process.env.AWS_ACCESS_KEY_ID;
    delete process.env.AWS_SECRET_ACCESS_KEY;
    delete process.env.AWS_REGION;
  }
});
