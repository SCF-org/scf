# scf-deploy - S3 + CloudFront Deployment CLI

Automate static website deployment to AWS S3 and CloudFront with a simple CLI tool.

## Features

- **Easy Setup**: Interactive `init` command with helpful post-install message
- **Simple Deployment**: Deploy with a single command `npx scf-deploy deploy`
- **TypeScript Configuration**: Type-safe config files with `scf.config.ts`
- **Auto Build Detection**: Automatically finds your build directory (dist, build, out, etc.)
- **Build Validation**: Ensures deployable files exist before creating AWS resources
- **Multiple Templates**: Pre-configured templates for React, Vue, Next.js
- **Incremental Deployment**: Only upload changed files (SHA-256 hash comparison)
- **CloudFront Integration**: Automatic cache invalidation after deployment
- **Multi-Environment Support**: Manage dev, staging, and prod environments
- **AWS Credentials Integration**: Supports AWS profiles, environment variables, and IAM roles
- **State Management**: Track deployed resources locally with automatic .gitignore handling
- **State Recovery**: Recover lost state files from AWS resource tags
- **Progress Tracking**: Real-time upload progress with visual feedback
- **SSR Detection**: Prevents accidental deployment of SSR builds (.next, .nuxt)

## Installation

### Global Installation

```bash
npm install -g scf-deploy
```

### Direct Execution with npx (Recommended)

```bash
npx scf-deploy deploy
```

## Quick Start

### 1. Initialize Configuration

Run the init command to create `scf.config.ts`:

```bash
npx scf-deploy init
```

This will guide you through an interactive setup or you can use defaults:

```bash
npx scf-deploy init --yes
```

Or manually create `scf.config.ts` in your project root:

```typescript
const config = {
  app: 'my-static-site',
  region: 'ap-northeast-2',

  s3: {
    bucketName: 'my-site-bucket',
    // buildDir is auto-detected (dist, build, out, etc.)
    // You can override: buildDir: './custom-dir',
    indexDocument: 'index.html',
    errorDocument: '404.html',
  },

  cloudfront: {
    enabled: true,
    // priceClass: 'PriceClass_100', // Optional, defaults to PriceClass_100
  },
};

export default config;
```

### 2. Build Your Site

```bash
# For React, Vue, etc.
npm run build

# For plain HTML
# Just make sure your files are in the buildDir
```

### 3. Deploy

```bash
npx scf-deploy deploy
```

That's it! Your site is now live on S3 and CloudFront.

## Configuration

### Basic Configuration

```typescript
const config = {
  app: 'my-app',           // Application name
  region: 'us-east-1',     // AWS region

  s3: {
    bucketName: 'my-bucket',
    // buildDir is optional - auto-detected from: dist, build, out, .output/public, _site
    indexDocument: 'index.html',
    errorDocument: '404.html',
  },

  cloudfront: {
    enabled: true,
    // priceClass: 'PriceClass_100',  // Optional: PriceClass_100, PriceClass_200, PriceClass_All
  },
};

export default config;
```

### Build Directory Auto-Detection

scf-deploy automatically detects your build directory by searching for:

- `dist` - Vite, Rollup, Vue, etc.
- `build` - Create React App, Next.js, etc.
- `out` - Next.js static export
- `.output/public` - Nuxt 3
- `_site` - Jekyll, 11ty
- `output` - Some SSGs

**Requirements:**
- Directory must contain `index.html` as the entry point
- Must have deployable web files (.html, .js, .css, etc.)

**SSR Build Detection:**
scf-deploy will reject SSR build directories that require a server:
- `.next` - Next.js SSR build
- `.nuxt` - Nuxt SSR build

For Next.js, use `next export` to generate static files in `./out`:
```bash
# next.config.js
module.exports = {
  output: 'export',
};

# Then build
npm run build
# Creates ./out directory with static files
```

### Environment-Specific Configuration

```typescript
const config = {
  app: 'my-app',
  region: 'ap-northeast-2',

  s3: {
    bucketName: 'my-site-prod',
  },

  cloudfront: {
    enabled: true,
  },

  // Environment overrides
  environments: {
    dev: {
      s3: { bucketName: 'my-site-dev' },
      cloudfront: { enabled: false },  // Skip CloudFront in dev
    },
    staging: {
      s3: { bucketName: 'my-site-staging' },
    },
    prod: {
      cloudfront: { priceClass: 'PriceClass_All' },  // Use all edge locations in prod
    },
  },
};

export default config;
```

### Custom Domain Configuration

```typescript
const config = {
  app: 'my-app',
  region: 'us-east-1',

  s3: {
    bucketName: 'my-site',
  },

  cloudfront: {
    enabled: true,
    customDomain: {
      domainName: 'example.com',
      certificateArn: 'arn:aws:acm:us-east-1:123456789012:certificate/abc-def',
    },
  },
};

export default config;
```

## Commands

### init

Initialize `scf.config.ts` configuration file.

```bash
# Interactive mode (asks questions)
scf-deploy init

# Non-interactive mode (use defaults)
scf-deploy init --yes

# Use a template (react, vue, next, custom)
scf-deploy init --template react

# Overwrite existing config
scf-deploy init --force
```

**Options:**
- `-f, --force` - Overwrite existing config file
- `-y, --yes` - Skip prompts and use default values
- `-t, --template <template>` - Use template (custom, react, vue, next)

**Templates:**
- `custom` - Custom configuration (default build dir: `./dist`)
- `react` - React/CRA configuration (build dir: `./build`)
- `vue` - Vue.js configuration (build dir: `./dist`)
- `next` - Next.js static export (build dir: `./out`)

### deploy

Deploy your static site to S3 and CloudFront.

```bash
# Basic deployment
scf-deploy deploy

# Deploy to specific environment
scf-deploy deploy --env prod

# Use specific AWS profile
scf-deploy deploy --profile my-aws-profile

# Preview without uploading
scf-deploy deploy --dry-run

# Skip CloudFront (S3 only)
scf-deploy deploy --no-cloudfront

# Force full deployment (ignore cached state)
scf-deploy deploy --force
```

**Options:**
- `-e, --env <environment>` - Environment name (default: "default")
- `-c, --config <path>` - Config file path (default: "scf.config.ts")
- `-p, --profile <profile>` - AWS profile name
- `--dry-run` - Preview deployment without uploading
- `--no-cloudfront` - Skip CloudFront deployment
- `--force` - Force full deployment (ignore state)
- `--skip-cache` - Skip CloudFront cache invalidation

### remove

Remove deployed AWS resources.

```bash
# Remove resources (with confirmation prompt)
scf-deploy remove

# Force remove without confirmation
scf-deploy remove --force

# Remove specific environment
scf-deploy remove --env dev

# Keep S3 bucket (only delete files)
scf-deploy remove --keep-bucket

# Keep CloudFront distribution
scf-deploy remove --keep-distribution
```

**Options:**
- `-e, --env <environment>` - Environment name (default: "default")
- `-c, --config <path>` - Config file path (default: "scf.config.ts")
- `-p, --profile <profile>` - AWS profile name
- `-f, --force` - Skip confirmation prompt
- `--keep-bucket` - Keep S3 bucket (only delete files)
- `--keep-distribution` - Keep CloudFront distribution

### status

Check current deployment status.

```bash
# Basic status
scf-deploy status

# Specific environment
scf-deploy status --env prod

# Detailed information
scf-deploy status --detailed

# JSON output
scf-deploy status --json
```

**Options:**
- `-e, --env <environment>` - Environment name (default: "default")
- `-d, --detailed` - Show detailed information
- `--json` - Output as JSON

### recover

Recover lost deployment state from AWS resources.

If you accidentally delete the `.deploy/state.json` file, you can recover it from AWS resource tags.

```bash
# Recover state for default environment
scf-deploy recover

# Recover specific environment
scf-deploy recover --env prod

# Overwrite existing state file
scf-deploy recover --force
```

**How it works:**
1. Searches for S3 buckets with `scf:managed=true` tag
2. Finds associated CloudFront distributions
3. Filters by app name and environment
4. Reconstructs the state file from AWS resources

**Options:**
- `-e, --env <environment>` - Environment name to recover
- `-c, --config <path>` - Config file path (default: "scf.config.ts")
- `-p, --profile <profile>` - AWS profile name
- `-f, --force` - Overwrite existing state file

**Note:** All AWS resources created by scf-deploy are automatically tagged for recovery:
- `scf:managed=true` - Indicates resource is managed by scf-deploy
- `scf:app=<app-name>` - Application name from config
- `scf:environment=<env>` - Environment name

## AWS Credentials

scf-deploy looks for AWS credentials in the following order:

1. **Command-line option**: `--profile` flag
2. **Environment variables**: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`
3. **AWS CLI profiles**: `~/.aws/credentials`
4. **IAM Role**: When running on EC2, ECS, etc.

### Using AWS Profile

```bash
scf-deploy deploy --profile my-company-profile
```

### Using Environment Variables

```bash
export AWS_ACCESS_KEY_ID=your_access_key
export AWS_SECRET_ACCESS_KEY=your_secret_key
scf-deploy deploy
```

## Features in Detail

### Build Validation

Before creating any AWS resources, scf-deploy validates your build:

- **Auto-detection**: Searches for common build directories (dist, build, out, etc.)
- **index.html check**: Ensures an entry point exists
- **Deployable files**: Verifies web files (.html, .js, .css, etc.) are present
- **SSR rejection**: Prevents deployment of SSR builds that require a server

This prevents wasted time and costs by catching issues before AWS resources are created.

### Automatic .gitignore Management

scf-deploy automatically manages your `.gitignore` file:

- **Auto-detection**: Checks if your project is a Git repository
- **Safe addition**: Adds `.deploy/` if not already present
- **Non-intrusive**: Creates `.gitignore` if it doesn't exist
- **One-time**: Only modifies once, won't duplicate entries

This happens automatically during:
- `scf-deploy init` - When initializing configuration
- `scf-deploy deploy` - After first successful deployment

### State Recovery

If you accidentally delete `.deploy/state.json`, you can recover it:

```bash
scf-deploy recover --env prod
```

**How it works:**
- All AWS resources are tagged with `scf:managed`, `scf:app`, `scf:environment`
- `recover` command searches for these tagged resources
- State file is reconstructed from AWS metadata
- You can continue deploying without recreating resources

**What can be recovered:**
- S3 bucket information
- CloudFront distribution ID and domain
- Resource creation timestamps
- Environment configuration

**Note:** File hashes are not recoverable, so the next deployment will re-upload all files.

### Incremental Deployment

scf-deploy uses SHA-256 hashing to detect file changes:

- **First deployment**: All files are uploaded
- **Subsequent deployments**: Only changed files are uploaded
- **Time savings**: 80-95% faster deployment times

State is stored in `.deploy/state.{env}.json` (automatically added to `.gitignore`).

### CloudFront Cache Invalidation

After deployment, scf-deploy automatically:

1. Creates or updates CloudFront distribution
2. Invalidates cache for changed files
3. Waits for distribution to be fully deployed
4. Shows real-time progress

### CloudFront Cache Warming

Reduce cold start latency by pre-warming CloudFront edge locations after deployment:

```typescript
cloudfront: {
  enabled: true,
  cacheWarming: {
    enabled: true,
    paths: ['/', '/index.html', '/app.js'],  // Critical paths only
    concurrency: 3,                          // Concurrent requests (max: 10)
    delay: 500,                              // Delay between requests (ms)
  },
}
```

**How it works:**
- After CloudFront deployment completes, scf-deploy makes HTTP requests to specified paths
- Files are downloaded and cached at edge locations
- First users get cached responses immediately (no cold start)

**Cost considerations:**
- ⚠️ **Data transfer costs**: Downloads files, incurs CloudFront outbound traffic charges
- **Example**: 10 files × 100KB each × $0.085/GB = ~$0.00009 per deployment
- **Best practice**: Only warm essential files (HTML, critical JS/CSS)
- **Avoid**: Large images, videos, or non-critical assets

**When to use:**
- ✅ Production deployments where first-load performance is critical
- ✅ After major releases to ensure global availability
- ❌ Development/staging environments (disable to save costs)
- ❌ High-frequency deployments (costs accumulate)

**Configuration tips:**
```typescript
environments: {
  dev: {
    cloudfront: {
      enabled: false,  // No CloudFront = no warming needed
    },
  },
  staging: {
    cloudfront: {
      enabled: true,
      cacheWarming: { enabled: false },  // Skip warming in staging
    },
  },
  prod: {
    cloudfront: {
      cacheWarming: {
        enabled: true,
        paths: ['/', '/index.html'],  // Minimal paths
        concurrency: 3,
        delay: 500,
      },
    },
  },
}
```

### Multi-Environment Support

Manage multiple environments with ease:

```bash
scf-deploy deploy --env dev
scf-deploy deploy --env staging
scf-deploy deploy --env prod
```

Each environment:
- Has its own state file
- Can override configuration
- Is completely isolated

### Progress Tracking

Visual feedback during deployment:

- File scanning progress
- Upload progress bar
- Real-time status updates
- Detailed error messages

## Examples

### React Application

```bash
# Build your React app
npm run build

# Deploy to production
scf-deploy deploy --env prod
```

Configuration:

```typescript
const config = {
  app: 'my-react-app',
  region: 'us-east-1',
  s3: {
    bucketName: 'my-react-app',
    // buildDir auto-detected (React uses ./build by default)
    indexDocument: 'index.html',
  },
  cloudfront: {
    enabled: true,
  },
};

export default config;
```

### Vue Application

```bash
# Build your Vue app
npm run build

# Deploy
scf-deploy deploy
```

Configuration:

```typescript
const config = {
  app: 'my-vue-app',
  region: 'eu-west-1',
  s3: {
    bucketName: 'my-vue-app',
    // buildDir auto-detected (Vue uses ./dist by default)
    indexDocument: 'index.html',
  },
  cloudfront: {
    enabled: true,
  },
};

export default config;
```

### Static HTML Site

```typescript
const config = {
  app: 'my-website',
  region: 'ap-northeast-2',
  s3: {
    bucketName: 'my-website',
    // For custom build directory (not auto-detected)
    buildDir: './public',
    indexDocument: 'index.html',
    errorDocument: '404.html',
  },
  cloudfront: {
    enabled: true,
  },
};

export default config;
```

## Troubleshooting

### Command not found

```bash
# Check if installed
which scf-deploy

# Reinstall globally
npm uninstall -g scf-deploy
npm install -g scf-deploy

# Or use npx (recommended)
npx scf-deploy deploy
```

### AWS Credentials Error

```bash
# Verify AWS credentials
aws sts get-caller-identity

# Use specific profile
scf-deploy deploy --profile my-profile
```

### Config file not found

```bash
# Check if scf.config.ts exists
ls -la scf.config.ts

# Specify custom path
scf-deploy deploy --config ./config/scf.config.ts
```

### State file conflicts

```bash
# Check state files
ls -la .deploy/

# Force full redeployment
scf-deploy deploy --force
```

### Build directory not found

```bash
# Error: Could not find build directory
# Solution: Ensure you've built your project first
npm run build

# Or specify a custom build directory
# In scf.config.ts:
s3: {
  bucketName: 'my-bucket',
  buildDir: './my-custom-output',
}
```

### SSR build detected error

```bash
# Error: Cannot deploy SSR build directory (.next, .nuxt)
# For Next.js: Enable static export
# next.config.js:
module.exports = {
  output: 'export',  // Generates static files in ./out
};

# For Nuxt: Use static generation
# nuxt.config.js:
export default {
  ssr: false,  // SPA mode
  target: 'static',
};
```

### Lost state file recovery

```bash
# If you accidentally deleted .deploy/state.json
scf-deploy recover --env prod

# Then continue deploying as normal
scf-deploy deploy --env prod
```

## Requirements

- **Node.js**: >= 18.0.0
- **AWS Account**: With appropriate permissions
- **AWS Credentials**: Configured via CLI, environment, or IAM role

### Required AWS Permissions

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:CreateBucket",
        "s3:DeleteBucket",
        "s3:ListBucket",
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject",
        "s3:PutBucketWebsite",
        "s3:PutBucketTagging",
        "s3:GetBucketTagging",
        "s3:ListAllMyBuckets",
        "cloudfront:CreateDistribution",
        "cloudfront:GetDistribution",
        "cloudfront:UpdateDistribution",
        "cloudfront:DeleteDistribution",
        "cloudfront:CreateInvalidation",
        "cloudfront:ListDistributions",
        "cloudfront:TagResource",
        "cloudfront:ListTagsForResource"
      ],
      "Resource": "*"
    }
  ]
}
```

**Note:** Tagging permissions are required for the state recovery feature.

## Best Practices

1. **Build before deploying**: Always run your build command before deployment
   ```bash
   npm run build && npx scf-deploy deploy
   ```

2. **State file management**:
   - `.deploy/` is automatically added to `.gitignore`
   - Never commit state files to Git
   - Use `scf-deploy recover` if state is lost

3. **Use environment-specific configs**: Separate dev/staging/prod
   ```bash
   scf-deploy deploy --env dev    # For development
   scf-deploy deploy --env prod   # For production
   ```

4. **Test with `--dry-run` first**: Preview changes before deploying
   ```bash
   scf-deploy deploy --dry-run
   ```

5. **Use IAM roles in CI/CD**: Don't hardcode credentials
   - Prefer IAM roles over access keys
   - Use AWS profiles locally
   - Let EC2/ECS IAM roles work automatically

6. **Enable CloudFront in production**: Better performance and HTTPS
   - Disable CloudFront in dev to save costs
   - Use `PriceClass_100` for cost optimization
   - Upgrade to `PriceClass_All` for global coverage

7. **Set up custom domain with ACM certificate**: Professional appearance
   - Request ACM certificate in `us-east-1` for CloudFront
   - Verify domain ownership
   - Add domain to CloudFront config

8. **Static export for Next.js**: Use `output: 'export'`
   ```javascript
   // next.config.js
   module.exports = {
     output: 'export',
   };
   ```

9. **Monitor AWS costs**:
   - Check S3 storage and transfer costs
   - Monitor CloudFront data transfer
   - Use CloudWatch for usage metrics

10. **Keep your CLI updated**:
    ```bash
    npm update -g scf-deploy
    # Or with npx (always uses latest)
    npx scf-deploy@latest deploy
    ```

## Testing

SCF uses Jest as the testing framework with comprehensive unit tests for core functionality.

### Running Tests

```bash
# Run all tests
npm test

# Run only unit tests
npm run test:unit

# Run tests in watch mode
npm run test:watch

# Run tests with coverage report
npm run test:coverage
```

### Test Structure

```
src/__tests__/
├── unit/              # Unit tests for core modules
│   ├── config/        # Config parsing, validation, merging
│   ├── deployer/      # File scanning, hashing
│   └── state/         # State management
├── integration/       # Integration tests (future)
├── e2e/              # End-to-end tests (future)
└── fixtures/          # Test data and config files
```

### Test Coverage

Current test coverage for core modules:

| Module | Coverage |
|--------|----------|
| Config Schema | 100% |
| Config Merger | 100% |
| Config Loader | 91.66% |
| File Scanner | 100% |
| State Manager | 93.1% |

**Total Unit Tests**: 130 tests

### Writing Tests

When contributing, please ensure:

1. **Add tests for new features**: All new functionality should include tests
2. **Maintain coverage**: Keep coverage above 90% for core modules
3. **Use fixtures**: Add test data to `src/__tests__/fixtures/`
4. **Follow patterns**: Match existing test structure and naming

Example test:

```typescript
import { describe, it, expect } from '@jest/globals';
import { validateConfig } from '../../../core/config/schema.js';

describe('Config Validation', () => {
  it('should validate a minimal config', () => {
    const config = {
      app: 'test-app',
      region: 'us-east-1',
      s3: { bucketName: 'test-bucket', buildDir: './dist' },
    };

    expect(() => validateConfig(config)).not.toThrow();
  });
});
```

### Test Scripts

- `test` - Run all tests
- `test:unit` - Run only unit tests
- `test:watch` - Run tests in watch mode
- `test:coverage` - Generate coverage report (saved to `coverage/`)

Coverage reports are generated in:
- **HTML**: `coverage/index.html` (open in browser)
- **LCOV**: `coverage/lcov-report/` (for CI/CD tools)

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT License - see [LICENSE](LICENSE) file for details

## Links

- **Homepage**: https://github.com/SCF-org
- **Issues**: https://github.com/SCF-org/scf/issues
- **NPM**: https://www.npmjs.com/package/scf-deploy

## Author

jeonghodong <fire13764@gmail.com>
