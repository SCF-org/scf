import { Command } from 'commander';

const program = new Command();

program
  .name('scf')
  .description('S3 + CloudFront static deployment automation CLI')
  .version('0.1.0');

// Commands will be added here
// program.addCommand(deployCommand);
// program.addCommand(removeCommand);
// program.addCommand(statusCommand);

program.parse();
