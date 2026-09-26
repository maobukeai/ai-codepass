const fs = require('fs');
const path = require('path');

const version = process.argv[2] || '1.0.2';
const releaseDir = path.resolve(__dirname, '..', 'release_artifacts');

if (!fs.existsSync(releaseDir)) {
  fs.mkdirSync(releaseDir, { recursive: true });
}

const pubDate = new Date().toISOString();
const notes = [
  "### AI CodePass v" + version + " 重要更新",
  "",
  "1. **全平台多账号防顶替防覆盖**：彻底根除 CodeBuddy、Workbuddy、Qoder 与 Trae 在缺少邮箱或 UID 时的账号 ID 碰撞，确保扫码多账号添加 100% 独立共存。",
  "2. **全平台签到隔离与防串号**：各平台签到任务严格使用各账号专属持久化 Token，不依赖本地客户端运行状态，杜绝误用当前运行账号凭证。",
  "3. **自动更新多架构全目标适配**：全量补齐 Windows NSIS、MSI 与标准 target 清单，解决跨平台安装方式下更新检查报错问题。",
  "4. **更新临时安装包自动清理**：新增自动清理机制，启动与更新后自动清理临时下载的安装包，确保电脑零残余空间占用。"
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
