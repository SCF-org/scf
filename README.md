# scf-deploy - S3 + CloudFront Deployment CLI

Automate static website deployment to AWS S3 and CloudFront with a simple CLI tool.

## Features

- **Easy Setup**: Interactive `init` command with helpful post-install message
- **Simple Deployment**: Deploy with a single command `npx scf-deploy deploy`
- **TypeScript Configuration**: Type-safe config files with `scf.config.ts`
- **Multiple Templates**: Pre-configured templates for React, Vue, Next.js
- **Incremental Deployment**: Only upload changed files (SHA-256 hash comparison)
- **CloudFront Integration**: Automatic cache invalidation after deployment
- **Multi-Environment Support**: Manage dev, staging, and prod environments
- **AWS Credentials Integration**: Supports AWS profiles, environment variables, and IAM roles
- **State Management**: Track deployed resources locally
- **Progress Tracking**: Real-time upload progress with visual feedback

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
import { defineConfig } from 'scf-deploy';

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
npx scf-deploy deploy
```

That's it! Your site is now live on S3 and CloudFront.

## Configuration

### Basic Configuration

```typescript
import { defineConfig } from 'scf-deploy';

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

### Incremental Deployment

scf-deploy uses SHA-256 hashing to detect file changes:

- **First deployment**: All files are uploaded
- **Subsequent deployments**: Only changed files are uploaded
- **Time savings**: 80-95% faster deployment times

State is stored in `.deploy/state.{env}.json` (add to `.gitignore`).

### CloudFront Cache Invalidation

After deployment, scf-deploy automatically:

1. Creates or updates CloudFront distribution
2. Invalidates cache for changed files
3. Waits for distribution to be fully deployed
4. Shows real-time progress

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
scf-deploy deploy
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
- **NPM**: https://www.npmjs.com/package/scf-deploy

## Author

jeonghodong <fire13764@gmail.com>
