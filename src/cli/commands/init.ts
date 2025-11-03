/**
 * Init command - Initialize scf.config.ts
 */

import { Command } from 'commander';
import inquirer from 'inquirer';
import fs from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';

interface InitAnswers {
  app: string;
  region: string;
  bucketName: string;
  buildDir: string;
  enableCloudFront: boolean;
  template?: 'custom' | 'react' | 'vue' | 'next';
}

const TEMPLATES = {
  custom: {
    buildDir: './dist',
    description: 'Custom configuration',
  },
  react: {
    buildDir: './build',
    description: 'React (Create React App)',
  },
  vue: {
    buildDir: './dist',
    description: 'Vue.js',
  },
  next: {
    buildDir: './out',
    description: 'Next.js (Static Export)',
  },
};

const AWS_REGIONS = [
  'us-east-1',
  'us-west-2',
  'ap-northeast-1',
  'ap-northeast-2',
  'ap-southeast-1',
  'eu-west-1',
  'eu-central-1',
];

function generateConfigContent(answers: InitAnswers): string {
  const { app, region, bucketName, buildDir, enableCloudFront } = answers;

  return `import { defineConfig } from 'scf-deploy';

export default defineConfig({
  app: '${app}',
  region: '${region}',

  s3: {
    bucketName: '${bucketName}',
    buildDir: '${buildDir}',
    indexDocument: 'index.html',
    errorDocument: '404.html',
  },

  cloudfront: {
    enabled: ${enableCloudFront},
    priceClass: 'PriceClass_100',
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
      cloudfront: { priceClass: 'PriceClass_All' },
    },
  },
});
`;
}

async function promptUser(interactive: boolean): Promise<InitAnswers> {
  if (!interactive) {
    // Non-interactive mode: use defaults
    return {
      app: 'my-app',
      region: 'us-east-1',
      bucketName: 'my-app-bucket',
      buildDir: './dist',
      enableCloudFront: true,
      template: 'custom',
    };
  }

  // Interactive mode
  const answers = await inquirer.prompt<InitAnswers>([
    {
      type: 'list',
      name: 'template',
      message: 'Select a template:',
      choices: [
        { name: 'Custom configuration', value: 'custom' },
        { name: 'React (Create React App)', value: 'react' },
        { name: 'Vue.js', value: 'vue' },
        { name: 'Next.js (Static Export)', value: 'next' },
      ],
      default: 'custom',
    },
    {
      type: 'input',
      name: 'app',
      message: 'Application name:',
      default: 'my-app',
      validate: (input: string) => {
        if (!input.trim()) return 'Application name is required';
        if (!/^[a-z0-9-]+$/.test(input))
          return 'Only lowercase letters, numbers, and hyphens are allowed';
        return true;
      },
    },
    {
      type: 'list',
      name: 'region',
      message: 'AWS Region:',
      choices: AWS_REGIONS,
      default: 'us-east-1',
    },
    {
      type: 'input',
      name: 'bucketName',
      message: 'S3 Bucket name:',
      default: (answers: Partial<InitAnswers>) => `${answers.app}-bucket`,
      validate: (input: string) => {
        if (!input.trim()) return 'Bucket name is required';
        if (!/^[a-z0-9-]+$/.test(input))
          return 'Only lowercase letters, numbers, and hyphens are allowed';
        return true;
      },
    },
    {
      type: 'input',
      name: 'buildDir',
      message: 'Build directory:',
      default: (answers: Partial<InitAnswers>) => {
        const template = answers.template || 'custom';
        return TEMPLATES[template].buildDir;
      },
    },
    {
      type: 'confirm',
      name: 'enableCloudFront',
      message: 'Enable CloudFront CDN?',
      default: true,
    },
  ]);

  return answers;
}

export function createInitCommand(): Command {
  return new Command('init')
    .description('Initialize scf.config.ts configuration file')
    .option('-f, --force', 'Overwrite existing config file')
    .option('-y, --yes', 'Skip prompts and use default values')
    .option(
      '-t, --template <template>',
      'Use template (custom, react, vue, next)'
    )
    .action(async (options) => {
      const configPath = path.join(process.cwd(), 'scf.config.ts');
      const configExists = fs.existsSync(configPath);

      // Check if config already exists
      if (configExists && !options.force) {
        console.log(chalk.yellow('\n⚠️  scf.config.ts already exists!'));
        console.log(
          chalk.dim('Use --force to overwrite or edit the file manually.\n')
        );
        process.exit(1);
      }

      try {
        console.log(chalk.blue('\n🚀 Initializing scf-deploy configuration...\n'));

        // Get user input
        const answers = await promptUser(!options.yes);

        // Generate config content
        const configContent = generateConfigContent(answers);

        // Write config file
        fs.writeFileSync(configPath, configContent, 'utf-8');

        console.log(chalk.green('\n✅ Configuration file created successfully!\n'));
        console.log(chalk.dim('📄 Created: scf.config.ts\n'));

        // Show next steps
        console.log(chalk.bold('Next steps:\n'));
        console.log(chalk.dim('  1. Build your application'));
        console.log(chalk.dim(`     ${chalk.cyan('npm run build')}\n`));
        console.log(chalk.dim('  2. Deploy to AWS'));
        console.log(chalk.dim(`     ${chalk.cyan('npx scf-deploy deploy')}\n`));
        console.log(
          chalk.dim(
            '  3. Deploy to specific environment (dev, staging, prod)'
          )
        );
        console.log(
          chalk.dim(`     ${chalk.cyan('npx scf-deploy deploy --env prod')}\n`)
        );
      } catch (error) {
        if ((error as { isTtyError?: boolean }).isTtyError) {
          console.error(
            chalk.red(
              '\n❌ Prompt could not be rendered in this environment.'
            )
          );
          console.log(chalk.dim('Use --yes flag for non-interactive mode.\n'));
        } else {
          console.error(chalk.red('\n❌ Failed to create config file:'), error);
        }
        process.exit(1);
      }
    });
}
