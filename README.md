# scf-deploy - S3 + CloudFront Deployment CLI

[![npm version](https://img.shields.io/npm/v/scf-deploy.svg)](https://www.npmjs.com/package/scf-deploy)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node Version](https://img.shields.io/node/v/scf-deploy.svg)](https://nodejs.org)

Automate static website deployment to AWS S3 and CloudFront with a simple, powerful CLI tool.

**Current Version:** 2.1.0

> **What's New in v2.0.0**: CloudFront Free tier pricing plan compatible! Now uses AWS Managed Cache Policy (CachingOptimized) instead of legacy cache settings. Switch your distribution to Free plan ($0/mo) in AWS Console to avoid unexpected charges.

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
  - [SPA Mode](#spa-mode-single-page-application)
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
- **SPA Mode (Default)**: Automatic 403/404 → index.html redirect for client-side routing
- **Cache Warming**: Pre-warm edge locations to eliminate cold start latency
- **Custom Domains**: Built-in support for custom domains with automatic SSL
- **CDN Optimization**: Configurable price classes with CachingOptimized policy
- **Free Tier Compatible**: Uses AWS Managed Cache Policy for CloudFront Free tier pricing plan eligibility

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

### Environment Variables

scf-deploy supports environment-specific variables through `.env` files. This is the **recommended way** to manage sensitive information like AWS credentials and custom domain certificates.

#### How It Works

Environment variables are loaded automatically before config file execution:

1. **Default**: `.env` and `.env.local` (no `--env` flag)
2. **Development**: `.env.dev` and `.env.dev.local` (use `--env dev`)
3. **Production**: `.env.prod` and `.env.prod.local` (use `--env prod`)

**Loading Priority** (highest to lowest):
```
.env.{environment}.local  (e.g., .env.prod.local)
.env.{environment}         (e.g., .env.prod)
.env.local
.env
```

#### Setup

**1. Create environment files:**

```bash
# .env.dev
AWS_REGION=us-east-1
S3_BUCKET_NAME=my-app-bucket-dev
CLOUDFRONT_ENABLED=false

# .env.prod
AWS_REGION=us-east-1
S3_BUCKET_NAME=my-app-bucket-prod
CLOUDFRONT_ENABLED=true
CLOUDFRONT_DOMAIN=www.example.com
ACM_CERTIFICATE_ARN=arn:aws:acm:us-east-1:123456789012:certificate/xxx
```

**2. Use in `scf.config.ts`:**

```typescript
import type { SCFConfig } from "scf-deploy";

const config: SCFConfig = {
  app: process.env.APP_NAME || "my-app",
  region: process.env.AWS_REGION || "us-east-1",

  s3: {
    bucketName: process.env.S3_BUCKET_NAME || "my-app-bucket",
    indexDocument: "index.html",
  },

  cloudfront: {
    enabled: process.env.CLOUDFRONT_ENABLED === "true",
    customDomain: process.env.CLOUDFRONT_DOMAIN
      ? {
          domainName: process.env.CLOUDFRONT_DOMAIN,
          certificateArn: process.env.ACM_CERTIFICATE_ARN,
        }
      : undefined,
  },
};

export default config;
```

**3. Deploy with environment:**

```bash
# Development (loads .env.dev)
scf-deploy deploy --env dev

# Production (loads .env.prod)
scf-deploy deploy --env prod
```

#### Security Best Practices

- ✅ **Always** add `.env*` to `.gitignore`
- ✅ Use `.env.example` files to document required variables
- ✅ Store sensitive values (AWS keys, certificate ARNs) in `.env` files
- ❌ **Never** commit actual `.env` files to git
- ✅ Use `.env.local` for local overrides that shouldn't be shared

#### Example Files

Check your project root for:
- `.env.example` - Template with all available variables
- `.env.dev.example` - Development environment template
- `.env.prod.example` - Production environment template

Copy these to create your actual `.env` files:
```bash
cp .env.example .env
cp .env.dev.example .env.dev
cp .env.prod.example .env.prod
```

#### Missing Environment File Warning

If you use `--env` flag but the corresponding `.env` file doesn't exist, scf-deploy will show a warning:

```bash
$ scf-deploy deploy --env dev
  ⚠ Warning: .env.dev file not found. Using default values from scf.config.ts
```

This is just a warning - deployment will continue using the default values defined in `scf.config.ts`.

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

### SPA Mode (Single Page Application)

CloudFront is configured with **SPA mode enabled by default** (`spa: true`). This automatically redirects 403/404 errors to `index.html` with a 200 status code, enabling client-side routing for React Router, Vue Router, Angular Router, etc.

```typescript
import type { SCFConfig } from "scf-deploy";

const config: SCFConfig = {
  app: "my-spa-app",
  region: "us-east-1",

  s3: {
    bucketName: "my-spa-bucket",
  },

  cloudfront: {
    enabled: true,
    // SPA mode is true by default - no configuration needed!
    // spa: true,  // Redirect 403/404 to index.html (default)
  },
};

export default config;
```

**How SPA Mode Works:**

When `spa: true` (default):
- 403 errors (Access Denied) → `/index.html` with 200 status
- 404 errors (Not Found) → `/index.html` with 200 status
- Client-side routing handles the actual URL

**For Static HTML Sites (disable SPA mode):**

If you have a traditional static site that needs to show actual 404 error pages:

```typescript
cloudfront: {
  enabled: true,
  spa: false,  // Disable SPA mode - return default 404 errors
}
```

**Custom Error Pages (advanced):**

For fine-grained control, use `errorPages` configuration:

```typescript
cloudfront: {
  enabled: true,
  spa: false,  // Disable default SPA behavior
  errorPages: [
    { errorCode: 404, responsePath: '/404.html', responseCode: 404, cacheTTL: 300 },
    { errorCode: 403, responsePath: '/403.html', responseCode: 403, cacheTTL: 300 },
  ],
}
```

### CloudFront Pricing Plans (New in Nov 2025)

SCF creates CloudFront distributions using the **CachingOptimized** managed cache policy, which makes them eligible for AWS's new flat-rate pricing plans:

| Plan | Price | Requests | Data Transfer |
|------|-------|----------|---------------|
| **Free** | $0/mo | 1M | 100GB |
| Pro | $15/mo | 10M | 50TB |
| Business | $200/mo | 125M | 50TB |

**Key Benefits of Free Plan:**
- ✅ No overage charges (performance throttling instead)
- ✅ Protection from traffic spikes and DDoS attacks
- ✅ Up to 3 Free plans per AWS account

After deployment, SCF displays instructions to switch to the Free plan in the AWS Console.

> **Note**: Pricing plans can only be configured in the AWS Console (not via API/SDK).

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
- `--no-rollback` - Keep S3 bucket if CloudFront deployment fails (NEW in v2.1.0)
- `--no-cleanup` - Skip deletion of removed files from S3 (NEW in v2.1.0)

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
    spa: false, // Disable SPA mode - show actual 404 pages for missing URLs
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

SCF uses Husky to ensure code quality at different stages of development.

### Pre-Commit Checks

When you commit, the following check runs automatically:

```bash
git commit -m "your message"
```

This will run:

1. **🔍 Lint Check** - Ensures code follows style guidelines

### Pre-Push Checks

When you push, comprehensive checks run automatically:

```bash
git push origin main
```

This will run:

1. **📦 Build Check** - Ensures the project builds without errors
2. **🔍 Lint Check** - Ensures code follows style guidelines
3. **🧪 Unit Tests** - Runs all 256 unit tests
4. **🔗 Integration Tests** - Runs all 104 integration tests

If any check fails, the push will be blocked. You must fix the issues before pushing.

### Manual Check

You can run the checks manually:

```bash
# Pre-commit check
.husky/pre-commit

# Pre-push check
.husky/pre-push
```

### Bypassing Checks (Not Recommended)

In emergency situations, you can bypass the checks:

```bash
git commit --no-verify -m "message"
git push --no-verify
```

⚠️ **Warning**: Only use this in emergencies! It's better to fix the issues.

## Testing

SCF uses Jest as the testing framework with comprehensive test coverage across unit, integration, and E2E tests.

### Running Tests

```bash
# Run all tests
npm test

# Run only unit tests (256 tests)
npm run test:unit

# Run integration tests (104 tests)
npm run test:integration

# Run E2E tests (requires AWS credentials)
npm run test:e2e

# Run tests in watch mode
npm run test:watch

# Run tests with coverage report
npm run test:coverage
```

### Test Structure

```
src/__tests__/
├── unit/              # Unit tests for core modules (256 tests)
│   ├── aws/           # ACM, Route53, CloudFront, S3 managers
│   ├── config/        # Config parsing, validation, merging
│   ├── deployer/      # File scanning, hashing
│   └── state/         # State management
├── integration/       # Integration tests (104 tests)
│   ├── aws/           # AWS service integration tests
│   ├── config/        # Config loading integration
│   └── deployer/      # Deployment workflow tests
├── e2e/              # End-to-end tests (real AWS resources)
│   ├── s3.e2e.test.ts
│   ├── cloudfront.e2e.test.ts
│   ├── acm.e2e.test.ts
│   └── route53.e2e.test.ts
└── fixtures/          # Test data and config files
```

### Test Types

| Type | Count | Description |
| ---- | ----- | ----------- |
| Unit Tests | 256 | Fast, isolated tests with mocked dependencies |
| Integration Tests | 104 | Tests for module interactions with mocked AWS |
| E2E Tests | Variable | Real AWS resource tests (requires credentials) |
| **Total** | **360+** | Comprehensive test coverage |

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

## CI/CD (GitHub Actions)

SCF uses GitHub Actions for automated testing on every PR and merge.

### PR Workflow

When a Pull Request is created or updated:

```yaml
# .github/workflows/pr.yml
- Build project
- Run linter
- Run unit tests (256 tests)
- Run integration tests (104 tests)
```

### Main Branch Workflow

When code is merged to main:

```yaml
# .github/workflows/main.yml
- Build project
- Run linter
- Run unit tests
- Run integration tests
- Run E2E tests (real AWS resources)
```

### Setting Up GitHub Secrets

For E2E tests to run in GitHub Actions, you need to configure AWS credentials:

1. Go to your repository **Settings** > **Secrets and variables** > **Actions**
2. Add the following secrets:

| Secret Name | Description |
| ----------- | ----------- |
| `AWS_ACCESS_KEY_ID` | AWS access key with required permissions |
| `AWS_SECRET_ACCESS_KEY` | AWS secret access key |

**Required IAM Permissions for E2E Tests:**
- S3: CreateBucket, DeleteBucket, PutObject, GetObject, DeleteObject
- CloudFront: CreateDistribution, GetDistribution, DeleteDistribution
- ACM: RequestCertificate, DescribeCertificate, DeleteCertificate
- Route53: CreateHostedZone, DeleteHostedZone, ChangeResourceRecordSets

### Local vs CI Testing

| Environment | Unit | Integration | E2E |
| ----------- | ---- | ----------- | --- |
| Pre-commit (local) | - | - | - |
| Pre-push (local) | ✅ | ✅ | - |
| PR (GitHub) | ✅ | ✅ | - |
| Main merge (GitHub) | ✅ | ✅ | ✅ |

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

### v2.1.0

**🛡️ Deployment Stability & Resource Management**

- ✨ **S3 File Cleanup**: Automatically delete files from S3 that were removed locally during incremental deploy
- ✨ **CloudFront Rollback**: Auto-rollback newly created S3 bucket when CloudFront deployment fails
- ✨ **Partial Resource Cleanup**: ACM/Route53 cleanup on CloudFront deployment failure
- ✨ **AWS API Retry**: Exponential backoff retry logic for transient AWS errors
- ✨ **Extended Timeout**: CloudFront deployment timeout increased (20min → 30min)
- ✨ **Immediate State Updates**: State file updated after each resource deletion (remove command)

**New CLI Options:**

- `--no-rollback` - Keep S3 bucket even if CloudFront deployment fails
- `--no-cleanup` - Skip S3 file cleanup during incremental deploy

**Bug Fixes:**

- 🔧 Fixed race condition in S3 bucket rollback logic
- 🔧 Fixed duplicate hash comparison during incremental deploy

---

### v2.0.2

- 🔧 **Free Plan Compatibility**: Fixed error when updating distributions on Free pricing plan
- 🔧 `priceClass` update is now automatically skipped for Free plan distributions
- ℹ️ Free plan uses all edge locations (equivalent to PriceClass_All)

---

### v2.0.1

- 🔧 Fixed remaining TTL references in Zod schema and config utils
- 🔧 Updated test cases to remove TTL validation tests
- 📝 Updated README with v2.0.0 changelog

---

### v2.0.0

**🆓 CloudFront Free Tier Pricing Plan Compatible**

- ✨ **Cache Policy Migration**: Switched from Legacy cache settings (ForwardedValues) to AWS Managed Cache Policy (CachingOptimized)
- ✨ **Free Tier Eligible**: Distributions are now compatible with CloudFront's new flat-rate pricing plans (Nov 2025)
- ✨ **Pricing Plan Info**: After deployment, displays information about CloudFront pricing plans and recommends Free plan
- 🗑️ **TTL Options Removed**: `defaultTTL`, `minTTL`, `maxTTL` config options removed (now managed by Cache Policy)

**CloudFront Pricing Plans (New in Nov 2025):**

| Plan | Price | Requests | Transfer |
|------|-------|----------|----------|
| Free | $0/mo | 1M | 100GB |
| Pro | $15/mo | 10M | 50TB |
| Business | $200/mo | 125M | 50TB |

**Breaking Changes:**

- ⚠️ **TTL options removed**: If you have `defaultTTL`, `minTTL`, or `maxTTL` in your config, please remove them
- TTL is now managed by AWS Managed Cache Policy (CachingOptimized): Min 1s, Default 1 day, Max 1 year

---

### v1.1.0

**🌐 SPA Mode & Client-Side Routing Support**

- ✨ **SPA Mode (Default Enabled)**: CloudFront now automatically redirects 403/404 errors to `index.html` with 200 status
- ✨ **Client-Side Routing Support**: Works out of the box with React Router, Vue Router, Angular Router, etc.
- ✨ **Configurable SPA Mode**: Use `spa: false` to disable for static HTML sites that need actual 404 pages
- ✨ **Custom Error Pages**: New `errorPages` configuration for fine-grained control
- 📝 **Init Template Updated**: SPA mode option now documented in generated `scf.config.ts`

**How It Works:**

```typescript
cloudfront: {
  enabled: true,
  // spa: true,   // Default - redirect 403/404 to index.html (SPA)
  // spa: false,  // Disable SPA mode for static HTML sites
}
```

**Breaking Changes:**

- None - existing deployments continue to work. SPA mode is additive and enabled by default.

---

### v1.0.0

**🎉 Production Ready Release**

- 🚀 First stable production release
- 🧪 360+ comprehensive tests (256 unit + 104 integration + E2E)
- 🔄 GitHub Actions CI/CD pipelines (PR + Main workflows)
- 🐶 Enhanced Husky hooks (pre-commit + pre-push with 4-step validation)
- 📝 Comprehensive documentation updates

**🧪 Testing Infrastructure**

- ✨ 256 unit tests with mocked dependencies
- ✨ 104 integration tests for module interactions
- ✨ E2E tests with real AWS resources (S3, CloudFront, ACM, Route53)
- ✨ Automated test execution in CI/CD

**🔄 CI/CD Pipeline**

- ✨ PR workflow: Build → Lint → Unit → Integration
- ✨ Main workflow: Full test suite including E2E
- ✨ GitHub Secrets integration for AWS credentials

**Breaking Changes:**

- None - fully backward compatible with v0.5.0

---

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
