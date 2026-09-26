import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getUpdaterReleaseHighlightLines,
  prependUpdaterReleaseHighlights,
} from "../src/utils/updaterReleaseNotes.ts";

describe("updater release highlights", () => {
  it("prepends the Chinese highlights for version 1.0.0", () => {
    const notes = prependUpdaterReleaseHighlights(
      "1.0.0",
      "### 其他更新\n\n- 原有更新内容",
      "zh-CN",
    );

    assert.ok(notes.startsWith("### 重要更新"));
    assert.match(notes, /三大 AI 编程助手专精管理/);
    assert.match(notes, /Qoder 国际版每日签到全适配/);
    assert.match(notes, /智能额度监测与过期倒计时/);
    assert.ok(notes.endsWith("### 其他更新\n\n- 原有更新内容"));
  });

  it("prepends the English highlights for a v-prefixed version", () => {
    const notes = prependUpdaterReleaseHighlights(
      "v1.0.0",
      "### Other changes\n\n- Existing release note",
      "en-US",
    );

    assert.ok(notes.startsWith("### Highlights"));
    assert.match(notes, /Specialized Management for 3 Major AI Assistants/);
    assert.match(notes, /Qoder Global Daily Check-in & Credits/);
    assert.match(notes, /Smart Quota Monitoring & Expiration Countdown/);
    assert.ok(notes.endsWith("### Other changes\n\n- Existing release note"));
  });

  it("does not prepend a duplicate highlights section", () => {
    const original = "### 重要更新\n\n- 已存在的重要更新";

    assert.equal(
      prependUpdaterReleaseHighlights("1.0.0", original, "zh-CN"),
      original,
    );
  });

  it("leaves other versions unchanged", () => {
    const original = "### Changed\n\n- Other version";

    assert.equal(
      prependUpdaterReleaseHighlights("9.9.9", original, "en"),
      original,
    );
  });

  it("provides localized lines for release history", () => {
    const chinese = getUpdaterReleaseHighlightLines("v1.0.0", "zh-CN");
    const english = getUpdaterReleaseHighlightLines("1.0.0", "en-US");

    assert.equal(chinese.length, 4);
    assert.equal(english.length, 4);
    assert.match(chinese[0], /三大 AI 编程助手专精管理/);
    assert.match(english[0], /Specialized Management for 3 Major AI Assistants/);

    const v101Chinese = getUpdaterReleaseHighlightLines("v1.0.1", "zh-CN");
    assert.equal(v101Chinese.length, 4);
    assert.match(v101Chinese[0], /专属数据目录物理隔离/);

    const v102Chinese = getUpdaterReleaseHighlightLines("v1.0.2", "zh-CN");
    assert.equal(v102Chinese.length, 4);
    assert.match(v102Chinese[0], /全平台多账号防顶替防覆盖/);

    const v103Chinese = getUpdaterReleaseHighlightLines("v1.0.3", "zh-CN");
    assert.equal(v103Chinese.length, 4);
    assert.match(v103Chinese[0], /Trae 签到风控彻底修复/);

    assert.deepEqual(
      getUpdaterReleaseHighlightLines("9.9.9", "zh-CN"),
      [],
    );
  });
});
