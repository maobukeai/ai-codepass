const ZH_SECTION_HEADER = '## 更新日志（中文）';
const EN_SECTION_HEADER = '## Changelog (English)';
const GITHUB_RELEASE_TAG_BASE_URL =
  'https://github.com/maobukeai/ai-codepass/releases/tag/v';
const RELEASE_HIGHLIGHTS: Record<string, { zh: string; en: string }> = {
  '1.0.4': {
    zh: `### 重要更新

- **深度硬件指纹隔离与虚拟环境多开**：新增实例级虚拟硬件指纹引擎（涵盖 MachineGuid、telemetry.machineId、devDeviceId、sqmId、真实厂商前缀 MAC 地址、SMBIOS UUID、磁盘序列号、主机名与 CPU/GPU 渲染签名），全方位阻断多开账号间的风控关联。
- **空白纯净隔离环境与一键换新**：支持创建不继承任何历史残留的“纯净空白隔离实例”，并提供可视化硬件指纹沙箱检视面板与一键轮换重置硬件指纹能力。
- **千问办公 (QwenWork CN) 多开与账号同步升级**：全面打通千问办公多实例独立目录隔离、进程级虚拟环境注入与账号状态实时同步。
- **自动更新平滑升级与隐私加固**：彻底清理残留路径，统一专用签名密钥与全架构更新清单，支持 1.0.2/1.0.3 客户端一键平滑静默升级。`,
    en: `### Highlights

- **Deep Hardware Fingerprint & Sandbox Isolation**: Introduced per-instance virtual hardware fingerprinting (MachineGuid, telemetry.machineId, devDeviceId, sqmId, MAC Address, SMBIOS UUID, Disk Serial, Hostname, and GPU/CPU signatures) to prevent cross-account risk association.
- **Blank Isolated Environment & One-Click Rotation**: Support creating pure blank isolated instances with credential cache purging and real-time hardware fingerprint inspection and rotation.
- **QwenWork CN Multi-Instance & Account Enhancement**: Upgraded QwenWork CN multi-instance isolation, token injection, and status synchronization.
- **Seamless Auto-Update & Privacy Hardening**: Sanitized residual paths and unified updater manifests for smooth in-app upgrades from v1.0.2/v1.0.3.`,
  },
  '1.0.3': {
    zh: `### 重要更新

- **Trae 签到风控彻底修复**：新增从本机真实 TinyStorage（aha.device.device_id）与日志中自动解密提取字节跳动已注册真实设备 ID，彻底解决 9074（当前参与用户太多）风控拦截。
- **CodeBuddy 配额卡片挤压修复**：重构配额分类头部弹性布局与文本截断机制，配合全量悬浮 Tooltip 与网格呼吸间距，彻底消除文字与数值重叠挤压。
- **自动更新平滑升级闭环**：统一专用签名密钥与全架构更新清单，支持 1.0.2 客户端一键平滑静默下载与无缝升级。
- **构建产物与校验完整性保障**：支持便携版与安装版双格式发布，自动化生成 SHA-256 校验和与多平台 Target 索引。`,
    en: `### Highlights

- **Trae Check-in Risk Control Eradicated**: Automatically extracts and decrypts ByteDance registered real device ID from TinyStorage (aha.device.device_id) and logs, permanently fixing error 9074.
- **CodeBuddy Quota Card Layout Squeeze Fixed**: Redesigned category card header layout with elastic ellipsis and interactive tooltips, resolving text and numeric overlap.
- **Seamless Auto-Update Upgrade Flow**: Unified dedicated updater signing keys and multi-target manifests, allowing smooth 1.0.2 to 1.0.3 in-app upgrade.
- **Release Verification & Multi-Distribution**: Provides both MSI installer and portable ZIP with SHA-256 checksums and comprehensive platform manifests.`,
  },
  '1.0.2': {
    zh: `### 重要更新

- **全平台多账号防顶替防覆盖**：彻底根除 CodeBuddy、Workbuddy、Qoder 与 Trae 在缺少邮箱或 UID 时的账号 ID 碰撞，确保扫码多账号添加 100% 独立共存。
- **全平台签到隔离与防串号**：各平台签到任务严格使用各账号专属持久化 Token，不依赖本地客户端运行状态，杜绝误用当前运行账号凭证。
- **自动更新多架构全目标适配**：全量补齐 Windows NSIS、MSI 与标准 target 清单，解决跨平台安装方式下更新检查报错问题。
- **更新临时安装包自动清理**：新增自动清理机制，启动与更新后自动清理临时下载的安装包，确保电脑零残余空间占用。`,
    en: `### Highlights

- **Multi-Account Collision & Overwrite Eradicated**: Completely fixed account identity collision in CodeBuddy, Workbuddy, Qoder, and Trae when email or UID is absent, ensuring 100% independent coexistence.
- **Account-Isolated Check-in & Token Protection**: All daily check-in tasks strictly use each account's dedicated persisted credentials without relying on local IDE runtime sessions.
- **Full Windows Updater Target Coverage**: Added complete manifest coverage for NSIS, MSI, and standard targets, eliminating update check errors.
- **Automatic Temp Installer Cleanup**: Automatically cleans up downloaded updater packages from temporary directories to prevent disk space accumulation.`,
  },
  '1.0.1': {
    zh: `### 重要更新

- **专属数据目录物理隔离**：全面迁移并重构本地持久化数据至独立专属目录 \`~/.ai_codepass\`，彻底杜绝历史账号残留，确保首次安装启动纯净空白。
- **源码隐私与全链路脱敏**：彻底清洗代码与测试用例中的所有硬编码调试账号、作者隐私信息与个人本地路径，加固安全防护。
- **Qoder 签到与配额服务优化**：完善 SASH 协议与高拟真客户端请求头，支持千问办公、Qoder 国际版与国内版多账号稳定打卡。
- **极致体积与性能保持**：全程序 LTO 单态优化，Windows 安装包保持 8.5MB 极简体积，毫秒级快速启动。`,
    en: `### Highlights

- **Physical Storage Isolation**: Complete migration to independent directory \`~/.ai_codepass\`, preventing legacy account inheritance and ensuring 100% clean initial launch.
- **Codebase Privacy Sanitization**: Completely removed hardcoded test accounts, author personal paths, and test credentials.
- **Enhanced Qoder Auto Check-in**: Improved SASH protocol compliance and client headers for stable daily credit claims across all Qoder variants.
- **Compact Size & Native Performance**: Preserved ultra-light 8.5MB installer package with fast startup and low memory footprint.`,
  },
  '1.0.0': {
    zh: `### 重要更新

- **三大 AI 编程助手专精管理**：独立解耦并精细化支持 CodeBuddy（腾讯混元）、Qoder（阿里通义灵码）、Trae（字节跳动），去除多余冗余 IDE。
- **Qoder 国际版每日签到全适配**：深度适配 SASH 协议与设备指纹，支持每日 10:00 自动打卡领取 100 Credits，支持国内版与国际版多账号并存。
- **智能额度监测与过期倒计时**：清晰展示各账号套餐状态、剩余请求数、Credits 余额及精确到期的重置倒计时。
- **环境隔离与多开支持**：支持为不同账号配置独立工作目录与环境，支持托盘快速切号与后台自动签到。`,
    en: `### Highlights

- **Specialized Management for 3 Major AI Assistants**: Standalone tool tailored for CodeBuddy (Tencent Hunyuan), Qoder (Alibaba Tongyi), and Trae (ByteDance).
- **Qoder Global Daily Check-in & Credits**: Full support for SASH protocol and device fingerprints, claiming 100 daily Credits seamlessly.
- **Smart Quota Monitoring & Expiration Countdown**: Real-time display of plan status, remaining requests, credits, and exact reset countdowns.
- **Multi-Instance Isolation & Tray Switch**: Isolated runtimes for multiple accounts, instant tray switching, and background auto check-in.`,
  },
};

export interface ParsedUpdaterReleaseNotes {
  releaseNotes: string;
  releaseNotesZh: string;
}

function normalizeNotes(notes?: string): string {
  if (!notes) {
    return '';
  }
  return notes.replace(/\r\n/g, '\n').trim();
}

function normalizeVersion(version: string): string {
  return version.trim().replace(/^v/i, '');
}

function getUpdaterReleaseHighlights(version: string, language: string): string {
  const highlights = RELEASE_HIGHLIGHTS[normalizeVersion(version)];
  if (!highlights) {
    return '';
  }
  return language.toLowerCase().startsWith('zh') ? highlights.zh : highlights.en;
}

export function getUpdaterReleaseHighlightLines(
  version: string,
  language: string,
): string[] {
  const highlights = getUpdaterReleaseHighlights(version, language);
  return highlights
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('- '))
    .map((line) => line.slice(2));
}

export function parseUpdaterReleaseNotes(notes?: string): ParsedUpdaterReleaseNotes {
  const normalized = normalizeNotes(notes);
  if (!normalized) {
    return {
      releaseNotes: '',
      releaseNotesZh: '',
    };
  }

  const zhIndex = normalized.indexOf(ZH_SECTION_HEADER);
  const enIndex = normalized.indexOf(EN_SECTION_HEADER);

  if (zhIndex >= 0 && enIndex >= 0) {
    if (zhIndex < enIndex) {
      return {
        releaseNotesZh: normalized
          .slice(zhIndex + ZH_SECTION_HEADER.length, enIndex)
          .trim(),
        releaseNotes: normalized.slice(enIndex + EN_SECTION_HEADER.length).trim(),
      };
    }

    return {
      releaseNotes: normalized
        .slice(enIndex + EN_SECTION_HEADER.length, zhIndex)
        .trim(),
      releaseNotesZh: normalized.slice(zhIndex + ZH_SECTION_HEADER.length).trim(),
    };
  }

  // 没有中英文分段时，直接复用同一份说明。
  return {
    releaseNotes: normalized,
    releaseNotesZh: normalized,
  };
}

export function prependUpdaterReleaseHighlights(
  version: string,
  notes: string,
  language: string,
): string {
  const normalizedNotes = normalizeNotes(notes);
  const highlights = getUpdaterReleaseHighlights(version, language);
  if (!highlights) {
    return normalizedNotes;
  }

  const isZh = language.toLowerCase().startsWith('zh');
  const heading = isZh ? '### 重要更新' : '### Highlights';
  if (normalizedNotes.includes(heading)) {
    return normalizedNotes;
  }

  return normalizedNotes ? `${highlights}\n\n${normalizedNotes}` : highlights;
}

function getStringFromRawJson(raw: Record<string, unknown>, key: string): string {
  const value = raw[key];
  if (typeof value !== 'string') {
    return '';
  }
  const trimmed = value.trim();
  return trimmed;
}

export function resolveUpdaterDownloadUrl(
  version: string,
  rawJson?: Record<string, unknown>,
): string {
  const raw = rawJson ?? {};
  const preferredKeys = ['html_url', 'download_url', 'url', 'details_url'];
  for (const key of preferredKeys) {
    const url = getStringFromRawJson(raw, key);
    if (url) {
      return url;
    }
  }

  const safeVersion = version.trim();
  if (!safeVersion) {
    return 'https://github.com/maobukeai/ai-codepass/releases/latest';
  }
  return `${GITHUB_RELEASE_TAG_BASE_URL}${encodeURIComponent(safeVersion)}`;
}
