const fs = require('fs');
const path = require('path');

const version = process.argv[2] || '1.0.4';
const releaseDir = path.resolve(__dirname, '..', 'release_artifacts');

if (!fs.existsSync(releaseDir)) {
  fs.mkdirSync(releaseDir, { recursive: true });
}

const pubDate = new Date().toISOString();
const notes = [
  "### AI CodePass v" + version + " 重要更新",
  "",
  "1. **深度硬件指纹隔离与虚拟环境多开**：新增实例级虚拟硬件指纹引擎（MachineGuid、telemetry.machineId、MAC 地址、SMBIOS UUID、磁盘序列号等），全方位阻断多开账号间的风控关联。",
  "2. **空白纯净隔离环境与一键换新**：支持创建不继承任何历史残留的纯净空白隔离实例，提供可视化硬件指纹沙箱检视与一键轮换能力。",
  "3. **千问办公多开与自动更新平滑升级**：打通千问办公独立实例环境注入与状态同步，支持 1.0.2/1.0.3 客户端一键静默升级。"
].join("\n");

let signature = "";
const msiSigPath = path.join(releaseDir, `AI-CodePass_${version}_x64_Setup.msi.sig`);
if (fs.existsSync(msiSigPath)) {
  signature = fs.readFileSync(msiSigPath, 'utf8').trim();
}

const manifest = {
  version: version,
  notes: notes,
  pub_date: pubDate,
  platforms: {
    "windows-x86_64": {
      signature: signature,
      url: `https://github.com/maobukeai/ai-codepass/releases/download/v${version}/AI-CodePass_${version}_x64_Setup.msi`
    },
    "windows-x86_64-msi": {
      signature: signature,
      url: `https://github.com/maobukeai/ai-codepass/releases/download/v${version}/AI-CodePass_${version}_x64_Setup.msi`
    },
    "windows-x86_64-nsis": {
      signature: signature,
      url: `https://github.com/maobukeai/ai-codepass/releases/download/v${version}/AI-CodePass_${version}_x64_Setup.msi`
    },
    "x86_64-pc-windows-msvc": {
      signature: signature,
      url: `https://github.com/maobukeai/ai-codepass/releases/download/v${version}/AI-CodePass_${version}_x64_Setup.msi`
    }
  }
};

const jsonStr = JSON.stringify(manifest, null, 2);
fs.writeFileSync(path.join(releaseDir, 'latest.json'), jsonStr, 'utf8');
fs.writeFileSync(path.join(releaseDir, 'latest-windows-x86_64.json'), jsonStr, 'utf8');
fs.writeFileSync(path.join(releaseDir, 'latest-windows-x86_64-nsis.json'), jsonStr, 'utf8');
fs.writeFileSync(path.join(releaseDir, 'latest-windows-x86_64-msi.json'), jsonStr, 'utf8');

console.log(`Successfully generated latest manifests (all windows targets) for v${version}`);
