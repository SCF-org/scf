# SCF - S3 + CloudFront Deployment CLI

Automate static website deployment to AWS S3 and CloudFront with a simple CLI tool.

## Features

- **Simple Deployment**: Deploy with a single command `npx scf deploy`
- **TypeScript Configuration**: Type-safe config files with `scf.config.ts`
- **Incremental Deployment**: Only upload changed files (SHA-256 hash comparison)
- **CloudFront Integration**: Automatic cache invalidation after deployment
- **Multi-Environment Support**: Manage dev, staging, and prod environments
- **AWS Credentials Integration**: Supports AWS profiles, environment variables, and IAM roles
- **State Management**: Track deployed resources locally
- **Progress Tracking**: Real-time upload progress with visual feedback

## Installation

### Global Installation

```bash
npm install -g scf
```

### Direct Execution with npx

```bash
npx scf deploy
```

## Quick Start

### 1. Create Configuration File

Create `scf.config.ts` in your project root:

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
  },
});
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
scf deploy
```

That's it! Your site is now live on S3 and CloudFront.

## Configuration

### Basic Configuration

```typescript
import { defineConfig } from 'scf';

export default defineConfig({
  app: 'my-app',           // Application name
  region: 'us-east-1',     // AWS region

  s3: {
    bucketName: 'my-bucket',
    buildDir: './dist',
    indexDocument: 'index.html',
    errorDocument: '404.html',
  },

  cloudfront: {
    enabled: true,
    priceClass: 'PriceClass_100',  // PriceClass_100, PriceClass_200, PriceClass_All
  },
});
```

### Environment-Specific Configuration

```typescript
export default defineConfig({
  app: 'my-app',
  region: 'ap-northeast-2',

  s3: {
    bucketName: 'my-site-prod',
    buildDir: './dist',
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
      cloudfront: { priceClass: 'PriceClass_All' },
    },
  },
});
```

### Custom Domain Configuration

```typescript
export default defineConfig({
  app: 'my-app',
  region: 'us-east-1',

  s3: {
    bucketName: 'my-site',
    buildDir: './dist',
  },

  cloudfront: {
    enabled: true,
    customDomain: {
      domainName: 'example.com',
      certificateArn: 'arn:aws:acm:us-east-1:123456789012:certificate/abc-def',
    },
  },
});
```

## Commands

### deploy

Deploy your static site to S3 and CloudFront.

```bash
# Basic deployment
scf deploy

# Deploy to specific environment
scf deploy --env prod

# Use specific AWS profile
scf deploy --profile my-aws-profile

# Preview without uploading
scf deploy --dry-run

# Skip CloudFront (S3 only)
scf deploy --no-cloudfront

# Force full deployment (ignore cached state)
scf deploy --force
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
scf remove

# Force remove without confirmation
scf remove --force

# Remove specific environment
scf remove --env dev

# Keep S3 bucket (only delete files)
scf remove --keep-bucket

# Keep CloudFront distribution
scf remove --keep-distribution
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
scf status

# Specific environment
scf status --env prod

# Detailed information
scf status --detailed

# JSON output
scf status --json
```

**Options:**
- `-e, --env <environment>` - Environment name (default: "default")
- `-d, --detailed` - Show detailed information
- `--json` - Output as JSON

## AWS Credentials

SCF looks for AWS credentials in the following order:

1. **Command-line option**: `--profile` flag
2. **Environment variables**: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`
3. **AWS CLI profiles**: `~/.aws/credentials`
4. **IAM Role**: When running on EC2, ECS, etc.

### Using AWS Profile

```bash
scf deploy --profile my-company-profile
```

### Using Environment Variables

```bash
export AWS_ACCESS_KEY_ID=your_access_key
export AWS_SECRET_ACCESS_KEY=your_secret_key
scf deploy
```

## Features in Detail

### Incremental Deployment

SCF uses SHA-256 hashing to detect file changes:

- **First deployment**: All files are uploaded
- **Subsequent deployments**: Only changed files are uploaded
- **Time savings**: 80-95% faster deployment times

State is stored in `.deploy/state.{env}.json` (add to `.gitignore`).

### CloudFront Cache Invalidation

After deployment, SCF automatically:

1. Creates or updates CloudFront distribution
2. Invalidates cache for changed files
3. Waits for distribution to be fully deployed
4. Shows real-time progress

### Multi-Environment Support

Manage multiple environments with ease:

```bash
scf deploy --env dev
scf deploy --env staging
scf deploy --env prod
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
scf deploy --env prod
```

Configuration:

```typescript
export default defineConfig({
  app: 'my-react-app',
  region: 'us-east-1',
  s3: {
    bucketName: 'my-react-app',
    buildDir: './build',  // React default
    indexDocument: 'index.html',
  },
  cloudfront: {
    enabled: true,
  },
});
```

### Vue Application

```bash
# Build your Vue app
npm run build

# Deploy
scf deploy
```

Configuration:

```typescript
export default defineConfig({
  app: 'my-vue-app',
  region: 'eu-west-1',
  s3: {
    bucketName: 'my-vue-app',
    buildDir: './dist',  // Vue default
    indexDocument: 'index.html',
  },
  cloudfront: {
    enabled: true,
  },
});
```

### Static HTML Site

```typescript
export default defineConfig({
  app: 'my-website',
  region: 'ap-northeast-2',
  s3: {
    bucketName: 'my-website',
    buildDir: './public',
    indexDocument: 'index.html',
    errorDocument: '404.html',
  },
  cloudfront: {
    enabled: true,
  },
});
```

## Troubleshooting

### Command not found

```bash
# Check if installed
which scf

# Reinstall globally
npm uninstall -g scf
npm install -g scf

# Or use npx
npx scf deploy
```

### AWS Credentials Error

```bash
# Verify AWS credentials
aws sts get-caller-identity

# Use specific profile
scf deploy --profile my-profile
```

### Config file not found

```bash
# Check if scf.config.ts exists
ls -la scf.config.ts

# Specify custom path
scf deploy --config ./config/scf.config.ts
```

### State file conflicts

```bash
# Check state files
ls -la .deploy/

# Force full redeployment
scf deploy --force
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
        "cloudfront:CreateDistribution",
        "cloudfront:GetDistribution",
        "cloudfront:UpdateDistribution",
        "cloudfront:DeleteDistribution",
        "cloudfront:CreateInvalidation"
      ],
      "Resource": "*"
    }
  ]
}
```

## Best Practices

1. **Add `.deploy/` to `.gitignore`**: Don't commit state files
2. **Use environment-specific configs**: Separate dev/staging/prod
3. **Test with `--dry-run` first**: Preview changes before deploying
4. **Use IAM roles in CI/CD**: Don't hardcode credentials
5. **Enable CloudFront in production**: Better performance and HTTPS
6. **Set up custom domain with ACM certificate**: Professional appearance

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
- **NPM**: https://www.npmjs.com/package/scf

## Author

jeonghodong <fire13764@gmail.com>
