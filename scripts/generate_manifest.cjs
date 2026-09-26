const fs = require('fs');
const path = require('path');

const version = process.argv[2] || '1.0.1';
const releaseDir = path.resolve(__dirname, '..', 'release_artifacts');

if (!fs.existsSync(releaseDir)) {
  fs.mkdirSync(releaseDir, { recursive: true });
}

const pubDate = new Date().toISOString();
const notes = [
  "### AI CodePass v" + version + " 重要更新",
  "",
  "1. **专属数据目录物理隔离**：本地持久化数据迁移至专属目录 ~/.ai_codepass，新安装环境 100% 纯净空白。",
  "2. **源码隐私深度脱敏**：彻底移除历史提交与工程中残留的测试账号与本地路径敏感信息。",
  "3. **Qoder 自动打卡能力强化**：更新 SASH 协议与客户端设备请求头，提升积分领取稳定性。",
  "4. **极致体积与启动速度**：去除冗余语言包与废弃代码，安装包与免安装包控制在 8.5MB 内，毫秒级冷启动。"
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
