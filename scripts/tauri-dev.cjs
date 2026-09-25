const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const cargoBinPath = path.join(os.homedir(), '.cargo', 'bin');
const tauriJsPath = path.join(repoRoot, 'node_modules', '@tauri-apps', 'cli', 'tauri.js');
const syncVersionJsPath = path.join(repoRoot, 'scripts', 'sync-version.js');

function withToolchainPaths(env = {}) {
  const currentPath = env.PATH || process.env.PATH || '';
  const extraPaths = [cargoBinPath].filter((dir) => fs.existsSync(dir));
  const pathValue = extraPaths.length > 0
    ? `${extraPaths.join(path.delimiter)}${path.delimiter}${currentPath}`
    : currentPath;

  return {
    ...process.env,
    ...env,
    PATH: pathValue,
    COCKPIT_TOOLS_PROFILE: process.env.COCKPIT_TOOLS_PROFILE || 'dev',
    COCKPIT_TOOLS_API_PORT: process.env.COCKPIT_TOOLS_API_PORT || '1456',
    VITE_COCKPIT_TOOLS_PROFILE: process.env.VITE_COCKPIT_TOOLS_PROFILE || 'dev',
  };
}

const env = withToolchainPaths();

// 1. 同步版本号
const syncResult = spawnSync(process.execPath, [syncVersionJsPath], {
  cwd: repoRoot,
  stdio: 'inherit',
  env,
});

if (syncResult.status !== 0) {
  process.exit(syncResult.status ?? 1);
}

// 2. 启动 Tauri 开发调试
const extraArgs = process.argv.slice(2);
const tauriResult = spawnSync(
  process.execPath,
  [tauriJsPath, 'dev', '--config', 'src-tauri/tauri.dev.conf.json', ...extraArgs],
  {
    cwd: repoRoot,
    stdio: 'inherit',
    env,
  },
);

process.exit(tauriResult.status ?? 1);
