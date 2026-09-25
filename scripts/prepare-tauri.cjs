const { spawnSync } = require('node:child_process');
const path = require('node:path');

if (process.platform !== 'win32') {
  process.exit(0);
}

const repoRoot = path.resolve(__dirname, '..');
const targetExe = path.join(repoRoot, 'target', 'debug', 'ai-codepass.exe');
const escapedTarget = targetExe.replace(/'/g, "''").toLowerCase();

const script = `
$ErrorActionPreference = 'SilentlyContinue'
$target = '${escapedTarget}'

# 1. 清理残留的旧版本调试程序进程
$processes = Get-CimInstance Win32_Process -Filter "Name = 'ai-codepass.exe'" |
  Where-Object { $_.ExecutablePath -and ($_.ExecutablePath.ToLowerInvariant() -eq $target) }
foreach ($process in $processes) {
  Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
  Write-Output ("Stopped stale AI CodePass debug process PID " + $process.ProcessId)
}

# 2. 清理占用端口 1420 (Vite 开发服务) 或 1456 (内部工具端口) 的僵尸进程
$ports = @(1420, 1456)
foreach ($port in $ports) {
  $targetPids = @()
  try {
    $conns = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction Stop
    $targetPids = $conns | ForEach-Object { $_.OwningProcess }
  } catch {
    $lines = netstat -ano | Select-String ":$port\\s+.*LISTENING\\s+(\\d+)"
    foreach ($line in $lines) {
      if ($line.Matches[0].Groups[1].Value) {
        $targetPids += [int]$line.Matches[0].Groups[1].Value
      }
    }
  }

  foreach ($procId in ($targetPids | Select-Object -Unique)) {
    if ($procId -gt 0 -and $procId -ne $PID) {
      $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
      if ($proc) {
        Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
        Write-Output ("Cleaned up stale process holding port $port (PID: $procId, Name: " + $proc.ProcessName + ")")
      }
    }
  }
}
Start-Sleep -Milliseconds 200
`;

const result = spawnSync(
  'powershell.exe',
  ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script],
  {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }
);

if (result.stdout) {
  process.stdout.write(result.stdout);
}

if (result.status !== 0) {
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }
  process.exit(result.status ?? 1);
}
