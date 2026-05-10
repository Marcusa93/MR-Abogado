import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const viteBin = resolve(__dirname, 'node_modules', 'vite', 'bin', 'vite.js');

const child = spawn(process.execPath, [viteBin, '--port', '3001', '--host'], {
  cwd: __dirname,
  stdio: 'inherit',
});

child.on('exit', (code) => process.exit(code ?? 1));
