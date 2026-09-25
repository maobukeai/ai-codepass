# AI CodePass

<p align="center">
  <strong>三大主流 AI 编程助手专属独立管理工具</strong><br>
  聚焦 CodeBuddy（腾讯混元）· Qoder（阿里通义灵码）· Trae（字节跳动）<br>
  多账号一键秒切 · 每日自动打卡签到 · 额度实时监控 · 多实例环境隔离
</p>

<p align="center">
  <a href="https://github.com/maobukeai/ai-codepass/releases/latest"><img src="https://img.shields.io/github/v/release/maobukeai/ai-codepass?style=flat&color=blue" alt="Latest Release"></a>
  <a href="https://github.com/maobukeai/ai-codepass/releases"><img src="https://img.shields.io/github/downloads/maobukeai/ai-codepass/total?style=flat&color=green" alt="Downloads"></a>
  <a href="https://github.com/maobukeai/ai-codepass/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License"></a>
  <a href="https://github.com/maobukeai/ai-codepass/issues"><img src="https://img.shields.io/github/issues/maobukeai/ai-codepass" alt="Issues"></a>
</p>

---

## 💡 项目简介

**AI CodePass** 是一款专为开发者打造的轻量级、跨平台 AI 编程工具账号管理客户端。针对国内及国际主流的顶级 AI 编程助手进行深度优化，告别频繁手动登录和额度浪费，让你的 AI 生产力随时拉满。

### 为什么选择 AI CodePass？
- 🎯 **专精而非臃肿**：彻底剥离不相关的 IDE 与外部多余依赖，内存占用极低，毫秒级快速启动。
- 🔄 **秒级无感切号**：支持本地凭据无缝提取，切换账号即刻生效，无需繁琐重新扫码。
- 🎁 **全自动每日签到**：深度逆向与适配各平台打卡协议，包含 **Qoder 国际版每日 100 Credits 打卡** 和 **Trae 额度自动领取**。
- 📊 **智能配额监控**：精准解析免费额度、包月配额、叠加卡包与重置倒计时。
- 🖥️ **环境隔离与多开**：支持多开实例环境隔离与一键唤起，满足专业开发者矩阵化运作需求。

---

## 🚀 核心支持矩阵

| AI 编程助手 | 覆盖版本 | 核心能力 |
| :--- | :--- | :--- |
| **CodeBuddy** | 腾讯云 AI 代码助手 (CN) / Workbuddy | 微信/腾讯云凭据解析 · 多账号秒切 · 额度用量监控 |
| **Qoder (通义灵码)** | 阿里通义灵码 (CN) / Qoder (国际版) | **国际版每日 100 Credits 自动签到 (SASH)** · 多开隔离 · 配额到期倒计时 |
| **Trae (字节跳动)** | Trae 国际版 / Trae CN / TRAE SOLO | 字节加密算法兼容 · 自动打卡签到 · 账号矩阵管理 |

---

## 🛠️ 安装与使用

### 下载安装包
请前往 [GitHub Releases](https://github.com/maobukeai/ai-codepass/releases/latest) 下载对应平台的最新安装包：
- Windows: `AI CodePass_1.0.0_x64-setup.exe` (或 `.msi`)

### 本地开发与构建

#### 环境要求
- [Node.js](https://nodejs.org/) (>= 18.x)
- [Rust](https://www.rust-lang.org/) (>= 1.80)
- [Tauri CLI v2](https://v2.tauri.app/)

#### 本地启动
```bash
# 1. 安装依赖
npm install

# 2. 启动开发模式
npm run tauri:dev
```

#### 生产打包
```bash
npm run tauri:build
```

---

## 📋 更新日志

详见 [CHANGELOG.md](./CHANGELOG.md)。

---

## 📄 开源协议

本项目基于 [MIT License](./LICENSE) 开源发布。
