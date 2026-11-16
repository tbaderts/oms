// run-vitest.mjs - Starts `vitest run` from a working directory whose Windows drive letter is upper
// case (SPEC-0066).
//
// Why: npm started from Git Bash runs scripts with a lower-case drive (`c:\…`). Vitest then loads
// itself twice (`c:/…/vitest` for the CLI, `C:/…/vitest` for the test file) and every component test
// fails with "Vitest failed to find the runner". Starting it from `C:\…` avoids the second copy.
// On other platforms, and when the drive is already upper case, this is a plain `vitest run`.
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const cwd = process.cwd().replace(/^[a-z]:/, (drive) => drive.toUpperCase());
const vitest = join(cwd, 'node_modules', 'vitest', 'vitest.mjs');
const result = spawnSync(process.execPath, [vitest, 'run', ...process.argv.slice(2)], { cwd, stdio: 'inherit' });
if (result.error) console.error(`run-vitest: could not start ${vitest}: ${result.error.message}`);
else if (result.signal) console.error(`run-vitest: vitest was stopped by ${result.signal}`);
process.exit(result.status ?? 1);
