#!/usr/bin/env node
import { cliDoctor } from './doctor.ts';
import { cliRun } from './run.ts';
import { cliValidate } from './validate.ts';

async function main(): Promise<void> {
  const [, , command, ...rest] = process.argv;

  switch (command) {
    case 'run':
      process.exitCode = await cliRun(rest);
      return;
    case 'validate':
      process.exitCode = await cliValidate(rest);
      return;
    case 'doctor':
      process.exitCode = await cliDoctor(rest);
      return;
    default:
      console.error(`comando desconocido: "${command ?? ''}". Usa "run", "validate" o "doctor".`);
      process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
