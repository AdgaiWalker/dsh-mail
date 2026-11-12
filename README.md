# dsh-mail

DeepSeekBot 的极简收件箱 — 跑在 Cloudflare Email Routing + Workers KV 上。

接收发往 `bot@goodloop.si` / `verify@goodloop.si` 的邮件，解析后存入 KV，再通过带 Bearer Token 的 API 读取。

## 来源声明

> **本项目基于 [OmniMail](https://github.com/mibgb65-cloud/OmniMail) `v1.3.0` 改造。**
>
> OmniMail 是一个基于 Cloudflare Workers / D1 / R2 / Queues / Email Routing 的自托管多域名 Webmail，MIT 协议。
>
> 原项目 Copyright (c) 2026 OmniMail contributors，完整许可见 [LICENSE](./LICENSE)。
>
> 本仓库并非 OmniMail 官方发行版。它是从中剥离出「接收邮件 → 解析 → 存取」这一条核心链路，重写为单文件、零数据库、仅依赖 Workers KV 的极简版本，用于 DeepSeekBot 的验证码 / 通知收件场景。

## 上游版本对应

| 项目 | 上游 | 说明 |
|------|------|------|
| 本项目 dsh-mail | [OmniMail v1.3.0](https://github.com/mibgb65-cloud/OmniMail/releases/tag/v1.3.0) | 提取核心收件逻辑，改为 Workers KV 存储 |
| 原仓库 omni-mail-goodloop | 同上（Cloudflare "Deploy to Cloudflare" 一键导入） | 已归档，备份见本地 `backups/omni-mail-goodloop-backup` |

## 与上游的主要差异

| 对比项 | OmniMail 1.3.0 | dsh-mail |
|--------|----------------|----------|
| 规模 | 完整 Webmail（Web / Android / Desktop / 浏览器扩展） | 单文件 `src/index.js`（约 126 行） |
| 存储 | D1 + R2 + Queues | 仅 Workers KV（`MAIL_KV`） |
| 功能 | 多域名、多邮箱源（iCloud/Gmail/Microsoft）、附件、队列 | 收件 + 存 + 读 API |
| 鉴权 | 完整用户体系 | 单一 `API_TOKEN` Bearer 认证 |
| 用途 | 自托管邮件工作台 | Bot 的验证码 / 通知收件箱 |

## 配置

`wrangler.jsonc` 关键项：

- `name`: `ds-mail`（Worker 名，部署后即为服务名）
- `addresses`: `bot@goodloop.si`、`verify@goodloop.si`（Cloudflare Email Routing 目标地址）
- `kv_namespaces`: 绑定 `MAIL_KV`，id `8ace8b13930a4067a55afe9be098fd57`
- 运行时需设置 secret：`API_TOKEN`（用于 API 鉴权，**不要写进代码**）

## 开发与部署

```bash
npm install
npm run dev        # 本地 wrangler dev
npm run dry-run    # 打包检查
npm run deploy     # 部署到 Cloudflare
```

## 环境变量

| 名称 | 类型 | 说明 |
|------|------|------|
| `API_TOKEN` | Secret | API 访问令牌，Bearer 认证用 |
| `MAIL_KV` | KV Binding | 邮件存储命名空间 |

## 目录结构

```
.
├── src/index.js          # Worker 核心逻辑（收邮件 + API）
├── wrangler.jsonc        # Worker 与 KV / 地址绑定
├── package.json          # 依赖：postal-mime；开发：wrangler
├── legacy-dummy/         # 早期占位实现（保留备查）
├── omni-mail-backup.json # 删除旧仓库前的备份清单
└── LICENSE               # MIT（沿用上游 OmniMail 版权声明）
```

## 许可

[MIT](./LICENSE) — 版权归 OmniMail contributors 所有，本项目在其基础上修改。
