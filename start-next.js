import { spawn } from 'child_process';

const port = process.env.PORT || 3000;
console.log(`Starting Next.js on port ${port}`);

const nextProcess = spawn('npx', ['next', 'start', '-p', port], {
  stdio: 'inherit',
  shell: true
});

nextProcess.on('error', (error) => {
  console.error(`Error starting Next.js: ${error.message}`);
  process.exit(1);
});

nextProcess.on('exit', (code) => {
  process.exit(code);
});
