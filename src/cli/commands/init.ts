/**
 * Init command - Initialize scf.config.ts
 */

import { Command } from "commander";
import inquirer from "inquirer";
import fs from "node:fs";
import path from "node:path";
import chalk from "chalk";
import { ensureDeployInGitignore } from "../../core/utils/gitignore.js";

interface InitAnswers {
  app: string;
  region: string;
  bucketName: string;
  enableCloudFront: boolean;
}

const AWS_REGIONS = [
  "us-east-1",
  "us-west-2",
  "ap-northeast-1",
  "ap-northeast-2",
  "ap-southeast-1",
  "eu-west-1",
  "eu-central-1",
];

function generateConfigContent(answers: InitAnswers): string {
  const { app, region, bucketName, enableCloudFront } = answers;

  return `/**
 * SCF Deploy Configuration
 *
 * Build directory is auto-detected (dist, build, out, etc.)
 * You can override it by adding: s3: { buildDir: './custom-dir' }
 */
import type { SCFConfig } from 'scf-deploy';

const config: SCFConfig = {
  app: '${app}',
  region: '${region}',

  s3: {
    bucketName: '${bucketName}',
    indexDocument: 'index.html',
    errorDocument: '404.html',
  },

  cloudfront: {
    enabled: ${enableCloudFront},
    // priceClass: 'PriceClass_100',
    // Cache warming: warm up edge locations after deployment (incurs data transfer costs)
    // cacheWarming: {
    //   enabled: true,
    //   paths: ['/', '/index.html'],        // Essential paths only (avoid large files)
    //   concurrency: 3,                     // Concurrent requests (default: 3, max: 10)
    //   delay: 500,                         // Delay between requests in ms (default: 500ms)
    // },

    // Custom Domain with HTTPS (automatic SSL certificate creation)
    // Uncomment to enable custom domain with automatic SSL:
    // customDomain: {
    //   domainName: 'example.com',
    //   // certificateArn is OPTIONAL - will be auto-created if not provided
    //   // Requirements for auto-creation:
    //   //   1. Domain must be registered in Route53
    //   //   2. DNS validation will take 5-30 minutes
    //   //   3. Requires ACM and Route53 permissions
    //   // certificateArn: 'arn:aws:acm:us-east-1:123456789012:certificate/abc-def', // Optional
    // },
  },

  // Environment-specific overrides
  environments: {
    dev: {
      s3: { bucketName: '${bucketName}-dev' },
      cloudfront: { enabled: false },
    },
    staging: {
      s3: { bucketName: '${bucketName}-staging' },
    },
    prod: {
      s3: { bucketName: '${bucketName}-prod' },
    },
  },
};

export default config;
`;
}

async function promptUser(interactive: boolean): Promise<InitAnswers> {
  if (!interactive) {
    // Non-interactive mode: use defaults
    return {
      app: "my-app",
      region: "us-east-1",
      bucketName: "my-app-bucket",
      enableCloudFront: true,
    };
  }

  // Interactive mode
  const answers = await inquirer.prompt<InitAnswers>([
    {
      type: "input",
      name: "app",
      message: "Application name:",
      default: "my-app",
      validate: (input: string) => {
        if (!input.trim()) return "Application name is required";
        if (!/^[a-z0-9-]+$/.test(input))
          return "Only lowercase letters, numbers, and hyphens are allowed";
        return true;
      },
    },
    {
      type: "list",
      name: "region",
      message: "AWS Region:",
      choices: AWS_REGIONS,
      default: "us-east-1",
    },
    {
      type: "input",
      name: "bucketName",
      message: "S3 Bucket name:",
      default: (answers: Partial<InitAnswers>) => `${answers.app}-bucket`,
      validate: (input: string) => {
        if (!input.trim()) return "Bucket name is required";
        if (!/^[a-z0-9-]+$/.test(input))
          return "Only lowercase letters, numbers, and hyphens are allowed";
        return true;
      },
    },
    {
      type: "confirm",
      name: "enableCloudFront",
      message: "Enable CloudFront CDN?",
      default: true,
    },
  ]);

  return answers;
}

export function createInitCommand(): Command {
  return new Command("init")
    .description("Initialize scf.config.ts configuration file")
    .option("-f, --force", "Overwrite existing config file")
    .option("-y, --yes", "Skip prompts and use default values")
    .action(async (options) => {
      const configPath = path.join(process.cwd(), "scf.config.ts");
      const configExists = fs.existsSync(configPath);

      // Check if config already exists
      if (configExists && !options.force) {
        console.log(chalk.yellow("\n⚠️  scf.config.ts already exists!"));
        console.log(
          chalk.dim("Use --force to overwrite or edit the file manually.\n")
        );
        process.exit(1);
      }

      try {
        console.log(
          chalk.blue("\n🚀 Initializing scf-deploy configuration...\n")
        );

        // Get user input
        const answers = await promptUser(!options.yes);

        // Generate config content
        const configContent = generateConfigContent(answers);

        // Write config file
        fs.writeFileSync(configPath, configContent, "utf-8");

        console.log(
          chalk.green("\n✅ Configuration file created successfully!\n")
        );
        console.log(chalk.dim("📄 Created: scf.config.ts\n"));

        // Ensure .gitignore has .deploy entry
        ensureDeployInGitignore();
        console.log();

        // Show next steps
        console.log(chalk.bold("Next steps:\n"));
        console.log(chalk.dim("  1. Build your application"));
        console.log(chalk.dim(`     ${chalk.cyan("npm run build")}\n`));
        console.log(chalk.dim("  2. Deploy to AWS"));
        console.log(chalk.dim(`     ${chalk.cyan("npx scf-deploy deploy")}\n`));
        console.log(
          chalk.dim("  3. Deploy to specific environment (dev, staging, prod)")
        );
        console.log(
          chalk.dim(`     ${chalk.cyan("npx scf-deploy deploy --env prod")}\n`)
        );
      } catch (error) {
        if ((error as { isTtyError?: boolean }).isTtyError) {
          console.error(
            chalk.red("\n❌ Prompt could not be rendered in this environment.")
          );
          console.log(chalk.dim("Use --yes flag for non-interactive mode.\n"));
        } else {
          console.error(chalk.red("\n❌ Failed to create config file:"), error);
        }
        process.exit(1);
      }
    });
}
