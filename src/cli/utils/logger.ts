/**
 * CLI logging utilities
 */

import chalk from 'chalk';

/**
 * Log info message
 */
export function info(message: string): void {
  console.log(chalk.blue('ℹ'), message);
}

/**
 * Log success message
 */
export function success(message: string): void {
  console.log(chalk.green('✓'), message);
}

/**
 * Log warning message
 */
export function warn(message: string): void {
  console.log(chalk.yellow('⚠'), message);
}

/**
 * Log error message
 */
export function error(message: string): void {
  console.error(chalk.red('✗'), message);
}

/**
 * Log fatal error and exit
 */
export function fatal(message: string, exitCode: number = 1): never {
  error(message);
  process.exit(exitCode);
}

/**
 * Log verbose message (only in verbose mode)
 */
export function verbose(message: string, isVerbose: boolean = false): void {
  if (isVerbose) {
    console.log(chalk.gray('[verbose]'), message);
  }
}

/**
 * Log section header
 */
export function section(title: string): void {
  console.log();
  console.log(chalk.bold.cyan(`━━━ ${title} ━━━`));
  console.log();
}

/**
 * Log key-value pair
 */
export function keyValue(key: string, value: string): void {
  console.log(chalk.gray(`${key}:`), chalk.white(value));
}

/**
 * Log empty line
 */
export function newline(): void {
  console.log();
}
