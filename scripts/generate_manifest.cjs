const fs = require('fs');
const path = require('path');

const version = process.argv[2] || '1.0.3';
const releaseDir = path.resolve(__dirname, '..', 'release_artifacts');

if (!fs.existsSync(releaseDir)) {
  fs.mkdirSync(releaseDir, { recursive: true });
}

const pubDate = new Date().toISOString();
const notes = [
  "### AI CodePass v" + version + " 重要更新",
  "",
  "1. **Trae 签到风控彻底修复**：新增从本机真实 TinyStorage（aha.device.device_id）与日志中自动解密提取字节跳动已注册真实设备 ID，彻底解决 9074（当前参与用户太多）风控拦截。",
  "2. **CodeBuddy 配额卡片挤压修复**：重构配额分类头部弹性布局与文本截断机制，配合全量悬浮 Tooltip 与网格呼吸间距，彻底消除文字与数值重叠挤压。",
  "3. **自动更新平滑升级闭环**：统一专用签名密钥与全架构更新清单，支持 1.0.2 客户端一键平滑静默下载与无缝升级。"
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
