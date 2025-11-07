# scf-deploy - S3 + CloudFront Deployment CLI

[![npm version](https://img.shields.io/npm/v/scf-deploy.svg)](https://www.npmjs.com/package/scf-deploy)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node Version](https://img.shields.io/node/v/scf-deploy.svg)](https://nodejs.org)

Automate static website deployment to AWS S3 and CloudFront with a simple, powerful CLI tool.

**Current Version:** 0.5.0

> **What's New in v0.5.0**: Automatic SSL certificates, Route53 hosted zone creation, enhanced resource recovery with ACM/Route53 support, and complete resource deletion with tag-based discovery!

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [Automatic SSL Certificate Creation](#automatic-ssl-certificate-creation)
- [Commands](#commands)
  - [init](#init)
  - [deploy](#deploy)
  - [remove](#remove)
  - [status](#status)
  - [recover](#recover)
- [AWS Credentials](#aws-credentials)
- [Features in Detail](#features-in-detail)
- [Examples](#examples)
- [Troubleshooting](#troubleshooting)
- [Requirements](#requirements)
- [Best Practices](#best-practices)
- [Testing](#testing)
- [Contributing](#contributing)

## Features

### 🚀 Deployment & Build

- **Simple Deployment**: Deploy with a single command `npx scf-deploy deploy`
- **Auto Build**: Automatically builds your project before deployment
- **Auto Build Detection**: Automatically finds your build directory (dist, build, out, etc.)
- **Build Validation**: Ensures deployable files exist before creating AWS resources
- **SSR Detection**: Prevents accidental deployment of SSR builds (.next, .nuxt)
- **Incremental Deployment**: Only upload changed files (SHA-256 hash comparison)

### ⚙️ Configuration & Setup

- **Easy Setup**: Interactive `init` command with guided configuration
- **TypeScript Configuration**: Type-safe config files with full IDE support
- **Multi-Environment Support**: Manage dev, staging, and prod environments
- **AWS Credentials Integration**: Supports AWS profiles, environment variables, and IAM roles

### 🔐 SSL & Custom Domains (NEW in v0.5.0)

- **Automatic SSL Certificate Creation**: Just provide your domain name - SSL certificate is created automatically
- **Route53 Hosted Zone Auto-Creation**: Automatically creates hosted zones if they don't exist
- **DNS Alias Records**: Automatic A/AAAA alias record creation for CloudFront distributions
- **Route53 Integration**: Automatic DNS validation record creation
- **Certificate Reuse**: Automatically detects and reuses existing certificates
- **Zero Configuration HTTPS**: No need to manually create ACM certificates or hosted zones
- **Domain Ownership Verification**: Validates Route53 hosted zone before deployment

### ☁️ CloudFront & Performance

- **CloudFront Integration**: Automatic cache invalidation after deployment
- **Cache Warming**: Pre-warm edge locations to eliminate cold start latency
- **Custom Domains**: Built-in support for custom domains with automatic SSL
- **CDN Optimization**: Configurable price classes and TTL settings

### 📦 State & Resource Management (Enhanced in v0.5.0)

- **State Management**: Track deployed resources locally with automatic .gitignore handling
- **Enhanced State Recovery**: Recover lost state files from AWS resource tags (S3, CloudFront, ACM, Route53)
- **Tag-Based Resource Discovery**: Find and manage all SCF-managed resources without state files
- **Comprehensive Resource Tagging**: All AWS resources automatically tagged (`scf:managed`, `scf:app`, `scf:environment`)
- **Complete Resource Deletion**: Remove command now deletes ACM certificates and Route53 hosted zones
- **Resource Tracking**: View all deployed resources even without state files

### 💻 Developer Experience

- **Progress Tracking**: Real-time upload progress with visual feedback
- **Detailed Logging**: Clear, colorful output with step-by-step feedback
- **Error Handling**: Helpful error messages with actionable suggestions

## Installation

```bash
npm install -g scf-deploy
```

```bash
npm install scf-deploy
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
import type { SCFConfig } from "scf-deploy";

const config: SCFConfig = {
  app: "my-static-site",
  region: "ap-northeast-2",

  s3: {
    bucketName: "my-site-bucket",
    // buildDir is auto-detected (dist, build, out, etc.)
    // You can override: buildDir: './custom-dir',
    indexDocument: "index.html",
    errorDocument: "404.html",
  },

  cloudfront: {
    enabled: true,
    // priceClass: 'PriceClass_100', // Optional, defaults to PriceClass_100
  },
};

export default config;
```

**Benefits of type annotation:**

- ✅ **IDE auto-completion**: Get suggestions for all available properties
- ✅ **Type checking**: Catch errors before deployment
- ✅ **Documentation**: Hover tooltips show property descriptions
- ✅ **Validation**: Required properties are enforced at compile time

### 2. Deploy

```bash
npx scf-deploy deploy
```

That's it! scf-deploy will:

1. ✅ Automatically build your project (runs `npm run build` if available)
2. ✅ Auto-detect your build directory (dist, build, out, etc.)
3. ✅ Validate build output (checks for index.html and web files)
4. ✅ Upload to S3 with incremental deployment
5. ✅ Deploy to CloudFront and invalidate cache
6. ✅ Warm up edge locations (if cache warming is enabled)

**Note:** You can skip auto-build with `--skip-build` flag if needed:

```bash
npx scf-deploy deploy --skip-build
```

## Configuration

### Basic Configuration

```typescript
import type { SCFConfig } from "scf-deploy";

const config: SCFConfig = {
  app: "my-app", // Application name
  region: "us-east-1", // AWS region

  s3: {
    bucketName: "my-bucket",
    // buildDir is optional - auto-detected from: dist, build, out, .output/public, _site
    indexDocument: "index.html",
    errorDocument: "404.html",
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
import type { SCFConfig } from "scf-deploy";

const config: SCFConfig = {
  app: "my-app",
  region: "ap-northeast-2",

  s3: {
    bucketName: "my-site-prod",
  },

  cloudfront: {
    enabled: true,
  },

  // Environment overrides
  environments: {
    dev: {
      s3: { bucketName: "my-site-dev" },
      cloudfront: { enabled: false }, // Skip CloudFront in dev
    },
    staging: {
      s3: { bucketName: "my-site-staging" },
    },
    prod: {
      cloudfront: { priceClass: "PriceClass_All" }, // Use all edge locations in prod
    },
  },
};

export default config;
```

## Automatic SSL Certificate Creation

**NEW in v0.5.0** - Zero-configuration HTTPS for your custom domains!

### Simple Configuration (Automatic SSL)

Just provide your domain name - scf-deploy handles the rest:

```typescript
import type { SCFConfig } from "scf-deploy";

const config: SCFConfig = {
  app: "my-app",
  region: "us-east-1",

  s3: {
    bucketName: "my-site",
  },

  cloudfront: {
    enabled: true,
    customDomain: {
      domainName: "example.com", // That's it! SSL certificate is created automatically
    },
  },
};

export default config;
```

### What Happens Automatically

When you deploy with just `domainName`:

1. ✅ **Route53 Hosted Zone Check** - Checks if hosted zone exists for domain
2. ✅ **Auto-Create Hosted Zone** - Creates hosted zone automatically if not found (NEW!)
3. ✅ **Certificate Search** - Looks for existing valid certificates
4. ✅ **Certificate Creation** - Requests new ACM certificate if needed (in us-east-1)
5. ✅ **DNS Validation** - Creates DNS validation records in Route53
6. ✅ **Validation Wait** - Waits for certificate to be validated (5-30 minutes)
7. ✅ **CloudFront Setup** - Applies certificate to CloudFront distribution
8. ✅ **DNS Alias Records** - Creates A/AAAA alias records pointing to CloudFront (NEW!)
9. ✅ **HTTPS Ready** - Your site is live with HTTPS!

### Deployment Output

```bash
$ npx scf-deploy deploy --env prod

🔐 Custom domain detected without certificate
   Domain: example.com
   Starting automatic SSL certificate creation...

✓ Route53 hosted zone found: Z123456789ABC
✓ Existing certificate found: abc-123
   Reusing existing certificate
✓ SSL certificate ready for CloudFront

📦 S3 uploading...
☁️ CloudFront deploying...
✓ Deployment complete!
   Custom Domain: https://example.com
```

### Manual Certificate (Optional)

If you already have a certificate or want to manage it manually:

```typescript
import type { SCFConfig } from "scf-deploy";

const config: SCFConfig = {
  app: "my-app",
  region: "us-east-1",

  s3: {
    bucketName: "my-site",
  },

  cloudfront: {
    enabled: true,
    customDomain: {
      domainName: "example.com",
      certificateArn: "arn:aws:acm:us-east-1:123456789012:certificate/abc-def", // Use existing certificate
    },
  },
};

export default config;
```

### Requirements for Automatic SSL

1. **Route53 Hosted Zone**: Your domain must be registered in Route53 (or will be created automatically)
2. **AWS Permissions**: ACM and Route53 permissions required (see below)
3. **Time**: First deployment takes 5-30 minutes for certificate validation
4. **Region**: Certificate is automatically created in us-east-1 (CloudFront requirement)

**Note**: If a hosted zone doesn't exist for your domain, scf-deploy will automatically create one. You'll need to update your domain's nameservers at your registrar to point to the Route53 nameservers (displayed after creation).

### Certificate Reuse

scf-deploy automatically detects and reuses existing certificates:

- Subsequent deployments: ~5 seconds (no certificate creation)
- Multiple apps with same domain: Certificate is shared automatically
- Manual certificates: Always respected when `certificateArn` is provided

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
- `--skip-build` - Skip automatic build

### remove

Remove deployed AWS resources (Enhanced in v0.5.0).

```bash
# Remove all resources (with confirmation prompt)
scf-deploy remove

# Force remove without confirmation
scf-deploy remove --force

# Remove specific environment
scf-deploy remove --env dev

# Keep S3 bucket (only delete files)
scf-deploy remove --keep-bucket

# Keep CloudFront distribution
scf-deploy remove --keep-distribution

# Keep ACM certificate
scf-deploy remove --keep-certificate

# Keep Route53 hosted zone
scf-deploy remove --keep-hosted-zone
```

**What gets deleted:**

The `remove` command will delete ALL resources created by scf-deploy:

1. 🗑️ **CloudFront Distribution** - Distribution is disabled and deleted
2. 🗑️ **ACM Certificate** - SSL certificate is removed (NEW in v0.5.0)
3. 🗑️ **S3 Bucket** - All files and the bucket are deleted
4. 🗑️ **Route53 Hosted Zone** - Hosted zone and all DNS records deleted (NEW in v0.5.0)

Before deletion, you'll see a detailed list of all resources that will be removed.

**Tag-Based Discovery** (NEW in v0.5.0):

Even without a state file, `remove` can discover and delete resources using AWS tags:

```bash
# Works even if .deploy/state.json is missing!
scf-deploy remove --env prod
```

**Options:**

- `-e, --env <environment>` - Environment name (default: "default")
- `-c, --config <path>` - Config file path (default: "scf.config.ts")
- `-p, --profile <profile>` - AWS profile name
- `-f, --force` - Skip confirmation prompt
- `--keep-bucket` - Keep S3 bucket (only delete files)
- `--keep-distribution` - Keep CloudFront distribution
- `--keep-certificate` - Keep ACM certificate (NEW in v0.5.0)
- `--keep-hosted-zone` - Keep Route53 hosted zone (NEW in v0.5.0)

**Example:**

```bash
$ scf-deploy remove --env prod

🗑️  SCF Resource Removal

📋 Resources to be removed:

S3 Bucket:
  Bucket Name: my-app-prod-abc123
  Region: us-east-1

CloudFront Distribution:
  Distribution ID: E1234567890ABC
  Domain Name: d123456.cloudfront.net

ACM Certificate:
  Certificate ARN: arn:aws:acm:us-east-1:...
  Domain Name: example.com

Route53 Hosted Zone:
  Zone ID: Z1234567890ABC
  Zone Name: example.com.

⚠️  Warning: This action cannot be undone!
? Are you sure you want to delete these resources? (y/N)
```

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

Recover lost deployment state from AWS resources (Enhanced in v0.5.0).

If you accidentally delete the `.deploy/state.json` file, you can recover it from AWS resource tags.

```bash
# Recover state for default environment
scf-deploy recover

# Recover specific environment
scf-deploy recover --env prod

# Show all SCF-managed resources
scf-deploy recover --all

# Overwrite existing state file
scf-deploy recover --force
```

**Enhanced Resource Discovery** (NEW in v0.5.0):

Now discovers ALL AWS resources, not just S3 and CloudFront:

1. 📦 **S3 Buckets** - Tagged buckets with app/environment
2. ☁️ **CloudFront Distributions** - Distributions with matching tags
3. 🔐 **ACM Certificates** - SSL certificates with domain info (NEW!)
4. 🌐 **Route53 Hosted Zones** - DNS zones with domain records (NEW!)

**How it works:**

1. Searches for all resources with `scf:managed=true` tag
2. Filters by app name and environment from config
3. Discovers S3 buckets, CloudFront distributions, ACM certificates, and Route53 zones
4. Reconstructs the complete state file from AWS metadata

**Options:**

- `-e, --env <environment>` - Environment name to recover
- `-c, --config <path>` - Config file path (default: "scf.config.ts")
- `-p, --profile <profile>` - AWS profile name
- `-f, --force` - Overwrite existing state file
- `-a, --all` - Show all SCF-managed resources across all apps/environments (NEW!)

**Example with `--all` flag:**

```bash
$ scf-deploy recover --all

🔄 SCF State Recovery

All SCF-managed resources:

S3 Buckets:
  ✓ my-app-prod (app: my-app, env: prod)
  ✓ my-app-dev (app: my-app, env: dev)

CloudFront Distributions:
  ✓ E1234567890ABC (app: my-app, env: prod)
    Domain: d123456.cloudfront.net

ACM Certificates:
  ✓ example.com (my-app, prod)
    Status: ISSUED

Route53 Hosted Zones:
  ✓ example.com. (my-app, prod)
```

**Automatic Resource Tags:**

All AWS resources created by scf-deploy are automatically tagged:

- `scf:managed=true` - Indicates resource is managed by scf-deploy
- `scf:app=<app-name>` - Application name from config
- `scf:environment=<env>` - Environment name
- `scf:tool=scf-deploy` - Tool identifier
- Resource-specific tags (domain, region, etc.)

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

### State Recovery (Enhanced in v0.5.0)

If you accidentally delete `.deploy/state.json`, you can recover it:

```bash
scf-deploy recover --env prod
```

**How it works:**

- All AWS resources are tagged with `scf:managed`, `scf:app`, `scf:environment`, `scf:tool`
- `recover` command searches for these tagged resources across all AWS services
- State file is reconstructed from AWS metadata
- You can continue deploying without recreating resources

**What can be recovered** (Enhanced in v0.5.0):

- ✅ S3 bucket information (name, region, website URL)
- ✅ CloudFront distribution (ID, domain, ARN)
- ✅ ACM certificate (ARN, domain, status) - NEW!
- ✅ Route53 hosted zone (zone ID, name, nameservers) - NEW!
- ✅ Resource tags and metadata
- ✅ Environment configuration

**Note:** File hashes are not recoverable, so the next deployment will re-upload all files.

**Tag-Based Resource Discovery:**

scf-deploy now uses a comprehensive tagging system across all AWS resources:

```javascript
// Example tags on S3 bucket
{
  'scf:managed': 'true',
  'scf:app': 'my-app',
  'scf:environment': 'prod',
  'scf:tool': 'scf-deploy',
  'scf:region': 'us-east-1'
}

// Example tags on CloudFront distribution
{
  'scf:managed': 'true',
  'scf:app': 'my-app',
  'scf:environment': 'prod',
  'scf:tool': 'scf-deploy'
}

// Example tags on ACM certificate
{
  'scf:managed': 'true',
  'scf:app': 'my-app',
  'scf:environment': 'prod',
  'scf:tool': 'scf-deploy',
  'scf:domain': 'example.com',
  'scf:auto-created': 'true'  // If created automatically
}

// Example tags on Route53 hosted zone
{
  'scf:managed': 'true',
  'scf:app': 'my-app',
  'scf:environment': 'prod',
  'scf:tool': 'scf-deploy',
  'scf:domain': 'example.com'
}
```

This comprehensive tagging enables:

- 🔍 **Resource Discovery** - Find all resources without state files
- 🗑️ **Complete Deletion** - Remove command finds all related resources
- 📊 **Cost Tracking** - Filter AWS costs by `scf:app` or `scf:environment`
- 🛡️ **Safety** - Prevent accidental deletion of non-SCF resources

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
import type { SCFConfig } from "scf-deploy";

const config: SCFConfig = {
  // ... other config
  cloudfront: {
    enabled: true,
    cacheWarming: {
      enabled: true,
      paths: ["/", "/index.html", "/app.js"], // Critical paths only
      concurrency: 3, // Concurrent requests (max: 10)
      delay: 500, // Delay between requests (ms)
    },
  },
};

export default config;
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
import type { SCFConfig } from "scf-deploy";

const config: SCFConfig = {
  app: "my-app",
  region: "us-east-1",

  s3: {
    bucketName: "my-app-bucket",
  },

  cloudfront: {
    enabled: true,
  },

  environments: {
    dev: {
      cloudfront: {
        enabled: false, // No CloudFront = no warming needed
      },
    },
    staging: {
      cloudfront: {
        enabled: true,
        cacheWarming: { enabled: false }, // Skip warming in staging
      },
    },
    prod: {
      cloudfront: {
        cacheWarming: {
          enabled: true,
          paths: ["/", "/index.html"], // Minimal paths
          concurrency: 3,
          delay: 500,
        },
      },
    },
  },
};

export default config;
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
import type { SCFConfig } from "scf-deploy";

const config: SCFConfig = {
  app: "my-react-app",
  region: "us-east-1",
  s3: {
    bucketName: "my-react-app",
    // buildDir auto-detected (React uses ./build by default)
    indexDocument: "index.html",
  },
  cloudfront: {
    enabled: true,
  },
};

export default config;
```

### Vue Application with Custom Domain

```bash
# Build your Vue app
npm run build

# Deploy with automatic SSL
scf-deploy deploy --env prod
```

Configuration:

```typescript
import type { SCFConfig } from "scf-deploy";

const config: SCFConfig = {
  app: "my-vue-app",
  region: "eu-west-1",
  s3: {
    bucketName: "my-vue-app",
    // buildDir auto-detected (Vue uses ./dist by default)
    indexDocument: "index.html",
  },
  cloudfront: {
    enabled: true,
    customDomain: {
      domainName: "myapp.com", // SSL certificate created automatically!
    },
  },
};

export default config;
```

### Static HTML Site

```typescript
import type { SCFConfig } from "scf-deploy";

const config: SCFConfig = {
  app: "my-website",
  region: "ap-northeast-2",
  s3: {
    bucketName: "my-website",
    // For custom build directory (not auto-detected)
    buildDir: "./public",
    indexDocument: "index.html",
    errorDocument: "404.html",
  },
  cloudfront: {
    enabled: true,
  },
};

export default config;
```

### Production Site with Full Configuration

```typescript
import type { SCFConfig } from "scf-deploy";

const config: SCFConfig = {
  app: "production-app",
  region: "us-east-1",

  s3: {
    bucketName: "production-app-site",
    indexDocument: "index.html",
    errorDocument: "404.html",
  },

  cloudfront: {
    enabled: true,
    priceClass: "PriceClass_All", // Global coverage

    customDomain: {
      domainName: "www.example.com",
      // Certificate created automatically (requires Route53)
    },

    cacheWarming: {
      enabled: true,
      paths: ["/", "/index.html"],
      concurrency: 5,
      delay: 300,
    },
  },

  environments: {
    staging: {
      s3: { bucketName: "staging-app-site" },
      cloudfront: {
        priceClass: "PriceClass_100",
        customDomain: {
          domainName: "staging.example.com",
        },
        cacheWarming: { enabled: false },
      },
    },
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

### Route53 Hosted Zone Not Found

**NEW in v0.5.0**: Hosted zones are now created automatically!

```bash
# scf-deploy now automatically creates hosted zones if they don't exist
$ scf-deploy deploy --env prod

⚠ Route53 hosted zone not found for example.com
  Creating public hosted zone automatically...

✓ Hosted zone created: Z123456789ABC

  Name servers (update at your domain registrar):
  - ns-123.awsdns-12.com
  - ns-456.awsdns-45.net
  - ns-789.awsdns-78.org
  - ns-012.awsdns-01.co.uk
```

**After automatic creation:**

1. Copy the nameservers displayed in the output
2. Log into your domain registrar (GoDaddy, Namecheap, etc.)
3. Update your domain's nameservers to the Route53 nameservers
4. Wait for DNS propagation (5 minutes to 48 hours)
5. Retry deployment - certificate validation will complete once DNS propagates

**Manual hosted zone creation (if preferred):**

```bash
# 1. Go to AWS Route53 Console
# 2. Create hosted zone for your domain
# 3. Update domain nameservers to Route53 nameservers
# 4. Deploy with scf-deploy

# Or use manual certificate:
cloudfront: {
  enabled: true,
  customDomain: {
    domainName: "example.com",
    certificateArn: "arn:aws:acm:us-east-1:123456789012:certificate/abc-def",
  },
}
```

### Certificate Validation Timeout

```bash
# Error: Certificate validation timed out after 30 minutes
# Possible causes:
# 1. DNS records not propagated yet
# 2. Incorrect Route53 configuration
# 3. Domain nameservers not pointing to Route53

# Solution:
# 1. Check DNS validation records in Route53
# 2. Verify domain nameservers: dig NS example.com
# 3. Wait for DNS propagation (up to 48 hours)
# 4. Retry deployment: scf-deploy deploy --env prod
```

### ACM or Route53 Permission Denied

```bash
# Error: AccessDenied - route53:ChangeResourceRecordSets
# Solution: Add required permissions to your IAM user/role

# Required permissions for automatic SSL:
# - acm:RequestCertificate
# - acm:DescribeCertificate
# - acm:ListCertificates
# - route53:ListHostedZones
# - route53:ChangeResourceRecordSets
```

## Requirements

- **Node.js**: >= 18.0.0
- **AWS Account**: With appropriate permissions
- **AWS Credentials**: Configured via CLI, environment, or IAM role

### Required AWS Permissions

#### Basic Deployment (S3 + CloudFront)

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

#### Additional Permissions for Automatic SSL (NEW in v0.5.0)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "acm:RequestCertificate",
        "acm:DescribeCertificate",
        "acm:ListCertificates",
        "acm:DeleteCertificate",
        "acm:ListTagsForCertificate",
        "route53:ListHostedZones",
        "route53:GetHostedZone",
        "route53:CreateHostedZone",
        "route53:DeleteHostedZone",
        "route53:ChangeResourceRecordSets",
        "route53:ListResourceRecordSets",
        "route53:GetChange",
        "route53:ChangeTagsForResource",
        "route53:ListTagsForResource"
      ],
      "Resource": "*"
    }
  ]
}
```

**Enhanced Permissions Explained** (v0.5.0):

- `acm:DeleteCertificate` - For `remove` command to delete certificates
- `acm:ListTagsForCertificate` - For resource discovery and recovery
- `route53:CreateHostedZone` - For automatic hosted zone creation
- `route53:DeleteHostedZone` - For `remove` command to delete zones
- `route53:ListResourceRecordSets` - For DNS record management
- `route53:ChangeTagsForResource` - For tagging hosted zones
- `route53:ListTagsForResource` - For resource discovery
- `route53:GetHostedZone` - For nameserver retrieval

**Note:** Tagging permissions are required for the enhanced state recovery and resource discovery features.

## Best Practices

1. **Leverage auto-build**: scf-deploy automatically builds your project

   ```bash
   # Auto-build is enabled by default
   npx scf-deploy deploy

   # Or manually build first if you prefer
   npm run build && npx scf-deploy deploy --skip-build
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

7. **Use automatic SSL for custom domains** (NEW in v0.5.0):

   - Just provide `domainName` - certificate is created automatically
   - Requires Route53 hosted zone for your domain
   - First deployment takes 5-30 minutes for certificate validation
   - Subsequent deployments: instant (certificate is reused)

   ```typescript
   cloudfront: {
     enabled: true,
     customDomain: {
       domainName: "example.com",  // SSL handled automatically!
     },
   }
   ```

8. **Static export for Next.js**: Use `output: 'export'`

   ```javascript
   // next.config.js
   module.exports = {
     output: "export",
   };
   ```

9. **Monitor AWS costs**:

   - Check S3 storage and transfer costs
   - Monitor CloudFront data transfer
   - Use CloudWatch for usage metrics
   - ACM certificates are free (no additional cost)

10. **Keep your CLI updated**:
    ```bash
    npm update -g scf-deploy
    # Or with npx (always uses latest)
    npx scf-deploy@latest deploy
    ```

## Git Hooks (Husky)

SCF uses Husky to ensure code quality before pushing to the repository. When you try to push, the following checks run automatically:

### Pre-Push Checks

```bash
git push origin main
```

This will automatically run:

1. **📦 Build Check** - Ensures the project builds without errors
2. **🔍 Lint Check** - Ensures code follows style guidelines
3. **🧪 Unit Tests** - Runs all 143 unit tests

If any check fails, the push will be blocked. You must fix the issues before pushing.

### Manual Check

You can run the pre-push checks manually:

```bash
.husky/pre-push
```

### Bypassing Checks (Not Recommended)

In emergency situations, you can bypass the checks:

```bash
git push --no-verify
```

⚠️ **Warning**: Only use this in emergencies! It's better to fix the issues.

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
│   ├── aws/           # ACM, Route53, CloudFront, S3 managers
│   ├── config/        # Config parsing, validation, merging
│   ├── deployer/      # File scanning, hashing
│   └── state/         # State management
├── integration/       # Integration tests (future)
├── e2e/              # End-to-end tests (future)
└── fixtures/          # Test data and config files
```

### Test Coverage

Current test coverage for core modules:

| Module          | Coverage |
| --------------- | -------- |
| Config Schema   | 100%     |
| Config Merger   | 100%     |
| Config Loader   | 91.66%   |
| File Scanner    | 100%     |
| State Manager   | 93.1%    |
| ACM Manager     | 85%      |
| Route53 Manager | 88%      |

**Total Unit Tests**: 143 tests

### Writing Tests

When contributing, please ensure:

1. **Add tests for new features**: All new functionality should include tests
2. **Maintain coverage**: Keep coverage above 90% for core modules
3. **Use fixtures**: Add test data to `src/__tests__/fixtures/`
4. **Follow patterns**: Match existing test structure and naming

Example test:

```typescript
import { describe, it, expect } from "@jest/globals";
import { validateConfig } from "../../../core/config/schema.js";

describe("Config Validation", () => {
  it("should validate a minimal config", () => {
    const config = {
      app: "test-app",
      region: "us-east-1",
      s3: { bucketName: "test-bucket", buildDir: "./dist" },
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

## Changelog

### v0.5.0

**🔐 SSL & Custom Domain Automation**

- ✨ Zero-configuration HTTPS for custom domains
- ✨ Automatic ACM certificate creation and validation
- ✨ Route53 DNS validation record automation
- ✨ **Automatic Route53 hosted zone creation** (NEW!)
- ✨ **CloudFront A/AAAA alias record creation** (NEW!)
- ✨ Certificate reuse detection
- ✨ Domain ownership verification
- 📝 certificateArn is now optional

**📦 Enhanced Resource Management**

- ✨ **Tag-based resource discovery system** - Find resources without state files
- ✨ **Comprehensive resource tagging** - All AWS resources tagged (S3, CloudFront, ACM, Route53)
- ✨ **Enhanced recover command** - Now discovers ACM certificates and Route53 hosted zones
- ✨ **Complete remove command** - Delete ACM certificates and Route53 hosted zones
- ✨ **Resource listing** - View all SCF-managed resources with `recover --all`
- 🗑️ Remove command now works without state files (tag-based discovery)

**🧪 Testing & Quality**

- 🧪 143 unit tests (was 130)
- ✅ Comprehensive test coverage for new features
- 🔨 Husky pre-push hooks for build, lint, and test checks

**Breaking Changes:**

- None - fully backward compatible

**Migration Notes:**

- Existing deployments will be automatically tagged on next deployment
- No action required - all features work with existing resources
- Recover command can now discover more resources (ACM, Route53)

## Links

- **Homepage**: https://github.com/SCF-org
- **Issues**: https://github.com/SCF-org/scf/issues
- **NPM**: https://www.npmjs.com/package/scf-deploy

## Author

jeonghodong <fire13764@gmail.com>
