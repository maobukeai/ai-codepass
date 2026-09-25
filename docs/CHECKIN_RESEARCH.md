# AI 编程工具签到机制与开源生态技术调研报告 (Check-in Research)

> 本报告基于对 GitHub 开源社区（如 `cxqc168-wq/Trae-workbuddyAssistant`、`bluechonk/trae-credential-reverse-engineering`、`BlueChonk/trae-daily-checkin`、`adm1in/wild-work`、`Cat-zaizai/ZaiZaiCat-Checkin` 等）的系统化调研与逆向工程分析，为本软件 `AI CodePass` 吸收并落地业界最佳工程实践。

---

## 一、各大平台签到协议与接口规范

### 1. Trae 家族 (Trae CN / TRAE SOLO CN / TraeWork)

#### (1) 核心接口端点
- **查询今日签到状态**：
  - **URL**: `GET https://api.trae.cn/trae/api/v2/ug/checkin_credits/status`
  - **Query 参数**: `?did={device_id}`
- **领取今日签到积分**：
  - **URL**: `POST https://api.trae.cn/trae/api/v2/ug/checkin_credits/claim`
  - **Body**: `{}` (空 JSON 对象)

#### (2) 必选 HTTP 请求头 (Headers)
| 请求头 | 取值 / 规范 | 说明 |
| :--- | :--- | :--- |
| `Authorization` | `Bearer <access_token>` | 账号登录凭证 JWT（有效期内） |
| `x-device-id` | `{device_id}` | 客户端虚拟设备标识（防风控核心） |
| `x-app-type` | `trae` | 官方客户端标识 |
| `Origin` | `https://www.trae.cn` | 跨域同源校验 |
| `Referer` | `https://www.trae.cn/` | 请求来源校验 |
| `Content-Type` | `application/json` | 标准 JSON 传输 |

#### (3) 响应结构与状态判定
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "checked_in": true,
    "consecutive_days": 7,
    "total_credits": 350,
    "credits_earned_today": 50,
    "checkin_date": "2026-09-25"
  }
}
```
- `code === 0`: 成功；
- `checked_in === true`: 今日已签到；
- 若 `code === 1005` 或 `401 Unauthorized`，表明 Token 已失效或被踢出，需重新登录。

#### (4) 本地凭据逆向：ByteCrypto v1 信封
Trae 在本地 `globalStorage/storage.json` 采用专有的 `ByteCrypto v1` 加密结构：
- **Magic Header**: `74 63 05 10 00 00`（"tc" + ver5 + 0x10）
- **随机盐**: 32 字节 `crypto.getRandomValues`
- **加密体**: AES-128-CBC，由固定 Pepper 异或派生密钥（`key = derived[0..16], iv = derived[16..32]`）
- 本项目 `AI CodePass` 已原生实现 Rust 级无损加解密。

---

### 2. CodeBuddy 家族 (CodeBuddy CN / Workbuddy / 腾讯云)

#### (1) 核心接口端点
- **活动状态检测（优先推荐）**：
  - **URL**: `POST https://copilot.tencent.com/v2/billing/meter/checkin-activity-status`
- **旧版状态回退（Fallback）**：
  - **URL**: `POST https://copilot.tencent.com/v2/billing/meter/checkin-status`
- **每日打卡领取**：
  - **URL**: `POST https://copilot.tencent.com/v2/billing/meter/daily-checkin`

#### (2) 必选 HTTP 请求头 (Headers)
| 请求头 | 取值 / 规范 | 说明 |
| :--- | :--- | :--- |
| `Authorization` | `Bearer <access_token>` | 腾讯云 OAuth / WorkBuddy Access Token |
| `X-User-Id` | `{uid}` | 用户唯一标识（如有） |
| `X-Enterprise-Id` | `{enterprise_id}` | 企业/团队空间 ID（如有） |
| `X-Tenant-Id` | `{enterprise_id}` | 租户 ID（兼容多版本） |
| `X-Domain` | `{domain}` | 专属域名（如有） |
| `User-Agent` | `Mozilla/5.0 ... Chrome/...` | 模拟桌面环境 |

#### (3) 响应结构与业务码
```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "today_checked_in": false,
    "active": true,
    "daily_credit": 100,
    "streak_days": 15,
    "reward": { "credit": 100 }
  }
}
```

---

### 3. Qoder 家族 (Qoder Global / Qoder CN / 千问办公)

#### (1) 核心接口端点
- **查询活动与签到状态**：
  - **URL**: `GET https://openapi.qoder.sh/sash/api/v1/me/campaigns` (国内版为 `https://openapi.qoder.com.cn`)
  - **说明**: Qoder 全系产品的所有活动与打卡权益均统一由 SASH 营销增长中心管理，不存在独立的 `/api/v1/checkin` 路由。
- **领取今日签到权益**：
  - **URL**: `POST https://openapi.qoder.sh/sash/api/v1/me/campaigns/{campaignId}/claim`
  - **Body**: `{}` (空 JSON 对象)

#### (2) 必选客户端识别与硬件指纹请求头 (Headers)
| 请求头 | 取值 / 规范 | 说明 |
| :--- | :--- | :--- |
| `Authorization` | `Bearer <access_token>` | 账号登录 JWT 凭证 |
| `Accept` | `application/json` | 数据格式 |
| `User-Agent` | `Qoder` | 客户端 UA |
| `Cosy-ClientType` | `10` | **核心风控头**，标识官方桌面端（网页端或缺省会导致服务端过滤掉每日 100 Credits 活动） |
| `Cosy-Version` | `0.4.2` | 桌面端客户端版本号 |
| `Cosy-MachineOS` | `x86_64_win32` / `windows` | 机器操作系统与架构 |
| `Cosy-MachineHostname` | `{hostname}` | 机器主机名 |
| `Cosy-MachineId` | `{uuid}` | 机器硬件 UUID（读取自 `auth.machine-id` 或 `deviceId`） |
| `Cosy-MachineToken` | `{machine_token}` | 客户端底层 `runtime-info.exe` 动态生成的机器鉴权 Token |
| `Cosy-MachineCode` | `{machine_code}` | 机器特征代码 |
| `Cosy-MachineType` | `{machine_type}` | 机器硬件类型 |

#### (3) 活动数据解析与“假签到”防范要点
1. **严格区分权益活动与推广广告**：
   - 必须通过 `actionType == "CLAIM_BENEFIT"` 且 `benefit.kind == "CREDITS"` 过滤每日 100 Credits 签到活动；
   - 严禁将 `actionType == "VIEW_DETAILS"` 的推广广告（如开学季买一送一 BOGO Banner，其状态通常为 `CLAIMED`）误当成已完成签到；
   - 严禁以“账号当前余额 > 0”作为已签到的虚假依据。
2. **响应与状态流转**：
   - 当每日权益状态为 `CLAIMABLE` 时，提取其 `campaignId` 执行 `POST /claim`；
   - 领取成功后，服务端返回 `{"status": "CLAIMED"}`，用户立得 +100 Credits（入账至 Add-on Quota，有效期 30 天）；
   - 随后触发 `GET /sash/api/v2/me/usage` 刷新配额，并更新本地记录。

---

## 二、从优秀开源项目汲取的核心工程设计

### 1. 一账号一虚拟设备指纹隔离 (Device ID Isolation)
- **风控痛点**：若多账号在同一局域网或同一桌面客户端共用完全相同的全局设备指纹（如共用一个硬编码随机数），平台风控会检测到同一 Device ID 频繁调用不同账号的打卡 API，触发关联封号。
- **最佳实践**：
  基于账号唯一标识（如 `account.id` 或 `user_id`）生成固定的专属虚拟设备指纹（Deterministic Virtual Device ID），做到“**账号换、设备指纹跟着换**”，彻底实现设备身份物理隔离。

### 2. 签到错误分类与冷却状态机 (Error Cooldown State Machine)
- **痛点**：遇到平台限流或账号过期时，无脑定时轮询会造成高频报错与账号风控。
- **最佳实践**：
  将错误分类：
  - `PlanLimit` (超出活动限额): 冷却 12 小时，不再反复冲击；
  - `RateLimit` (429 限流): 抖动等待 60~180 秒；
  - `SessionExpired` (401 凭据失效): 标记状态并停止该账号轮询，提示用户重新登录；
  - `ServerError` (5xx 网络波动): 指数退避重试（最多 3 次）。

### 3. 随机抖动时间错峰打卡 (Jitter Scheduling)
- 避免在整点（如 08:00:00）发起统一并发请求；在设定的时间窗口内（如 06:00~12:00），系统为每个账号分配专属随机分钟与秒数，模拟人工自然打卡。

### 4. 多渠道 Webhook 签到结果通知 (Multi-Channel Webhook Notification)
- 桌面客户端常驻托盘或后台运行时，签到完成后自动组装结构化通知，推送到用户的手机或企业工作群：
  - **飞书 (Feishu Webhook)**
  - **钉钉 (DingTalk Webhook)**
  - **企业微信 (WeCom Webhook)**
  - **Telegram Bot**
  - **Server酱 (Turbo) / PushDeer / Bark**

---

## 三、AI CodePass 升级落地路线图

1. **统一设备指纹生成与隔离**：为每个 Trae 和 CodeBuddy 账号分配独立持久化的 Device ID；
2. **多渠道 Webhook 通知模块**：
   - 在 Rust 后端与通用设置面板实现 Webhook 推送中心；
   - 签到完成时自动生成美化 Markdown 汇总并推送到用户配置的通道；
3. **Trae 签到与自动重试增强**：集成防风控请求头与失败自动冷却机制；
4. **测试与质量验证**：全量编译、单元测试与构建验证。
