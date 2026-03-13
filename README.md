# bigbird

Cloudflare Workers 项目：提供 GitHub Star 校验的“邀请码领取”页面 + 运行状态监控面板。

## 功能
- 领取邀请码：校验 GitHub 用户是否 Star 指定仓库
- 运行状态监控：定时检测站点可用性，展示 30 天可用性与延迟曲线
- KV 存储：记录领取状态与监控结果
- 可选赞赏面板与站点图标

## 快速开始
1. 安装依赖
   - `npm install`
2. 创建 KV 命名空间并填入 `wrangler.toml`
   - `npx wrangler kv namespace create INVITE_KV`
   - `npx wrangler kv namespace create STATUS_KV`
3. 设置密钥（生产/远程开发）
   - `npx wrangler secret put API_TOKEN`
   - `npx wrangler secret put GITHUB_API_TOKEN`（可选，避免 GitHub API 限流）
4. 本地开发（推荐）
   - 创建 `.dev.vars`（已在 `.gitignore` 中）
   - 示例：
     - `API_TOKEN=...`
     - `GITHUB_API_TOKEN=...`
5. 配置 `wrangler.toml` 中的 `vars`
   - `API_URL`
   - `GITHUB_REPO_OWNER` / `GITHUB_REPO_NAME`
   - `MONITORED_SITES_JSON`（JSON 字符串数组）

## 配置说明
- `API_TOKEN`（密钥）：后端接口鉴权用的 Bearer Token
- `API_URL`：生成邀请码的后端接口地址
- `GITHUB_REPO_OWNER` / `GITHUB_REPO_NAME`：用于 Star 校验
- `GITHUB_API_TOKEN`（可选密钥）：GitHub PAT，避免 `users/{username}/starred` 限流
- `MONITORED_SITES_JSON`：站点列表，支持 `$API_URL` 占位
- `TIP_JAR_ENABLED` / `TIP_JAR_IMG_1` / `TIP_JAR_IMG_2`：赞赏面板（可选）
- `SITE_FAVICON_URL`：页面 favicon（可选）

`MONITORED_SITES_JSON` 示例：
```
[{"name":"Backend API","url":"$API_URL"},{"name":"GitHub API","url":"https://api.github.com"}]
```

## 本地开发与部署
- 本地开发：`npm run dev`（读取 `.dev.vars`）
- 远程开发：`npx wrangler dev --remote`
- 部署：`npm run deploy`

## 路由
- `GET /` 领取邀请码 + 状态面板
- `POST /api/claim` 领取邀请码（用户名 + Star 校验）
- `GET /api/health-check` 返回状态 JSON

## 安全与隐私
- 不要提交 `.dev.vars`、密钥或数据库导出文件
- 本仓库已移除个人变量与本地 SQL 导出，`postgressql/` 已被忽略
- 如果曾经提交过密钥，请立即轮换