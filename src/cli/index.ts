/**
 * SCF CLI entry point
 */

import { createProgram } from './cli.js';

const program = createProgram();

program.parse(process.argv);
