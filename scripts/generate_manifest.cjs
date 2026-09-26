const fs = require('fs');
const path = require('path');

const version = process.argv[2] || '1.0.5';
const releaseDir = path.resolve(__dirname, '..', 'release_artifacts');

if (!fs.existsSync(releaseDir)) {
  fs.mkdirSync(releaseDir, { recursive: true });
}

const pubDate = new Date().toISOString();
const notes = [
  "### AI CodePass v" + version + " 重要更新",
  "",
  "1. **全链路沙箱目录与硬件指纹环境注入**：为每个多开实例构建专属三级沙箱结构，进程启动时全面重定向 USERPROFILE、APPDATA、LOCALAPPDATA 与各大 AI 助手专属设备文件。",
  "2. **历史凭据深度清理与防串号**：在启动空白或未绑定实例时，自动清理 state.vscdb、storage.json 与 .auth 目录下的历史残留账号凭据，彻底杜绝历史账号残留。",
  "3. **全平台实例生命周期标准化与自动更新**：统一主流 AI 编程助手多开启动链路，支持 1.0.2/1.0.3/1.0.4 客户端一键静默升级。"
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
