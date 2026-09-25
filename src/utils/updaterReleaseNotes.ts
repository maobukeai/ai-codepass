const ZH_SECTION_HEADER = '## 更新日志（中文）';
const EN_SECTION_HEADER = '## Changelog (English)';
const GITHUB_RELEASE_TAG_BASE_URL =
  'https://github.com/maobukeai/ai-codepass/releases/tag/v';
const RELEASE_HIGHLIGHTS: Record<string, { zh: string; en: string }> = {
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
