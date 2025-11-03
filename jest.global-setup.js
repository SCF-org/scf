export default async function globalSetup() {
  console.log('\n🧪 Starting SCF test suite...\n');

  // E2E 테스트를 위한 환경변수 체크
  if (process.env.E2E_TEST === 'true') {
    console.log('⚠️  E2E mode enabled - will use real AWS resources\n');

    // 실제 AWS credentials 확인
    if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
      console.warn('⚠️  Warning: AWS credentials not found for E2E tests');
      console.warn('   Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY environment variables\n');
    }
  } else {
    console.log('🎭 Mock mode - AWS SDK calls will be mocked\n');
  }
}
