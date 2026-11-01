# 书架 · books

一个跑在 Cloudflare Workers 上的个人在线阅读站：服务端渲染、零前端框架、按需加载的 ES Module，数据存 D1，封面可选存 R2。

前台提供书籍 / 分类 / 作者 / 分卷 / 章节阅读 / 搜索 / 书评 / 阅读进度同步 / RSS / Sitemap；后台提供书籍与章节管理、批量导入、分类、评论审核、用户与权限、站点设置、访问控制、数据备份。

## 技术栈

| 层 | 选型 |
| --- | --- |
| 运行时 | Cloudflare Workers（`compatibility_date` 2026-10-01） |
| 框架 | Hono 4 + TSX 服务端渲染，无前端框架、无打包器 |
| 数据库 | Cloudflare D1（SQLite，FTS5 全文搜索） |
| 对象存储 | Cloudflare R2（可选，仅用于封面上传） |
| 静态资源 | Workers Static Assets（`./public`），文件名带内容哈希，长缓存 |
| 构建 | `scripts/predeploy.mjs`：用 esbuild 逐文件压缩 + 生成哈希副本 + `src/assets.generated.ts` |

## 目录结构

```
src/
  index.tsx           Worker 入口，挂载 session / 访问控制 / 边缘缓存 / 路由
  routes/             前台路由：site（页面）、auth（登录注册）、api（JSON）、feeds（RSS/Sitemap）
  admin/              后台路由：书籍、章节、分类、评论、用户、设置、运维
  pages/              TSX 页面组件（前台 + 后台）
  db/                 D1 数据访问，按领域拆分
  layout.tsx          全站外壳（侧栏、主题、公告）
  auth.ts             PBKDF2 密码哈希与会话
  edge.ts             匿名 HTML 边缘缓存（60s fresh / 300s stale）
  settings.ts         站点设置默认值与读写
public/
  css/ js/            源文件 + predeploy 生成的压缩哈希副本
  _headers            静态资源长缓存头
migrations/           D1 迁移 SQL（0001 ~ 0012）
scripts/              构建、造数、备份回填、压测脚本
docs/                代码审计与优化方案
```

## 本地开发

要求：Node.js **22.18+**（推荐 22 LTS 或 24）、npm。

```bash
npm ci                 # 安装依赖
npm run db:migrate     # 建本地 D1 表结构（含演示数据）
npm run dev            # http://localhost:8787
```

`npm run dev` 会先触发 `predev` → `npm run build`，自动生成压缩后的静态资源副本。

首次打开 `http://localhost:8787/admin/setup` 创建管理员。

## 部署到 Cloudflare Workers（GitHub 导入）

### 1. 准备 Cloudflare 资源

```bash
npx wrangler login

# 建 D1 数据库，记下输出的 database_id
npx wrangler d1 create book

# 可选：要用后台封面上传就建 R2 桶；不用可跳过
npx wrangler r2 bucket create book-covers
```

### 2. 填写 wrangler.jsonc

把占位符换成上一步的真实 ID，同时确认 Worker 名称没被占用：

```jsonc
{
  "name": "book",                       // Worker 名，全局唯一，可改成自己的
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "book",
      "database_id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",  // ← 必填
      "migrations_dir": "migrations"
    }
  ],
  "r2_buckets": [
    { "binding": "COVERS", "bucket_name": "book-covers" }   // 不用 R2 就删掉这段
  ]
}
```

> `database_id` 还是 `00000000-...` 时部署会直接失败。

### 3. 推送代码到 GitHub

```bash
git push origin main
```

### 4. 在 Cloudflare 创建 Workers 项目

Dashboard → **Workers & Pages** → **Create** → **Import a repository**（连接 Git）：

| 配置项 | 值 |
| --- | --- |
| 仓库 / 分支 | `HsinKwok/books` · `main` |
| Root directory | 留空（仓库根目录） |
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy` |
| 环境变量 | 可选 `NODE_VERSION=22` |

说明：

- 构建凭据由 Workers Builds 自动注入，**不需要**手动配 `CLOUDFLARE_API_TOKEN`。
- `npm run build` 就是 `scripts/predeploy.mjs`：压缩 CSS/JS、生成带哈希的副本、刷新 `src/assets.generated.ts`。不跑这一步，线上会引用不存在的哈希文件。
- 静态资源由 `wrangler deploy` 随 Worker 一起上传，不需要单独配置。

### 5. 执行远程数据库迁移

**必须先建表再访问站点**，否则页面会报 `no such table`：

```bash
npx wrangler d1 migrations apply book --remote
```

可选：把历史章节正文预渲染进 `chapters.body_html`（新写入的章节会自动双写）：

```bash
node scripts/backfill-body-html.mjs --remote
```

### 6. 创建管理员并完成初始化

打开 `https://<你的域名>/admin/setup`，填写昵称、邮箱、密码（≥ 8 位）即可。提交后自动登录并进入后台。

之后在 **后台 → 设置** 里配置站点名称、首页文案、访问模式（开放 / 口令 / 关闭）、评论审核、SMTP 发信等，全部存在 D1 的 `settings` 表，不需要改代码或环境变量。

### 7. 可选

- **自定义域名**：Workers → Settings → Domains & Routes → Add custom domain。
- **邮件找回密码**：默认 `mail.enabled=0`，后台设置里填好 SMTP 后 `/forgot` 才可用；否则只返回 503。
- **命令行部署**（不使用 Git 集成）：`npm run deploy`，会先自动执行 predeploy。

## 管理员账号

系统**没有任何默认账号**，也不存在默认密码：

- 唯一入口是 `/admin/setup`，且只在 `users` 表中还没有 `role='owner'` 用户时可用；已有 owner 后该路径返回 404。
- 迁移与 seed 脚本都没有 `INSERT INTO users`；前台注册只会得到 `reader`。
- 后续可在 **后台 → 用户** 把已有读者提升为 `owner`（不能改自己、不能降级最后一位 owner）。
- 密码使用 PBKDF2-SHA256、100,000 次迭代、16 字节随机盐存储。

忘记密码：配置 SMTP 后走 `/forgot`；否则只能通过数据库重置。

## Fork 后的自动同步

仓库自带 [`.gitattributes`](.gitattributes) 与 [`.github/workflows/sync-fork.yml`](.github/workflows/sync-fork.yml)，用于让 fork 每天自动合并上游代码，同时**保留自己的配置文件**。

### 工作原理

- `.gitattributes` 声明 `wrangler.jsonc merge=keepours`。
- workflow 里注册 `git config merge.keepours.driver true`，合并时该文件始终保留当前分支版本。
- 定时任务每天 UTC 03:00（北京时间 11:00）执行 `git fetch upstream main` → `git merge` → `git push`。
- 通过 `if: github.event.repository.fork == true` 限制，只对 fork 生效，上游自己不会空跑。

### Fork 方的操作

1. fork 后在 **Actions** 页签点 “I understand my workflows, go ahead and enable them”，否则定时任务不会触发。
2. 修改自己 fork 里的 `wrangler.jsonc`：`name` 换成自己的 Worker 名，`database_id` 换成自己 D1 的 ID。
3. 提交并推送后，在 Actions → **Sync fork** → **Run workflow** 手动验证一次。

### 注意事项

- 定时任务只在**默认分支**运行；改了默认分支需要同步调整 workflow。
- 仓库 60 天无活动时 GitHub 会自动停用定时任务，手动点一次 `Run workflow` 可恢复。
- `merge=keepours` 只在**双方都修改了同一文件**时生效；若只有上游改了 `wrangler.jsonc`，仍会采用上游版本，建议偶尔对比一次上游配置。
- 其他文件发生冲突时，任务会失败并停在冲突状态，需要手动解决——fork 里尽量不要改上游也在维护的业务文件。
- 上游地址变了，改 workflow 里的 `git remote add upstream` 一行即可。

## 常用命令

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | 本地开发（先自动跑 predeploy） |
| `npm run build` | 压缩静态资源、生成哈希副本与 `assets.generated.ts` |
| `npm run deploy` | 部署到 Cloudflare（先自动跑 predeploy） |
| `npm run typecheck` | TypeScript 类型检查 |
| `npm run db:migrate` | 应用迁移到本地 D1 |
| `npm run db:migrate:remote` | 应用迁移到线上 D1 |
| `npm run db:backfill-html` | 回填历史章节正文 HTML（加 `-- --remote` 作用于线上） |
| `npm run seed:gen` | 由 `src/data/*` 重新生成 `migrations/0002_seed.sql` |
| `npm run data:stress` | 生成压测数据（默认写入本地 D1） |
| `npm run stress:run` | 对指定地址压测，如 `-- --base=https://example.com` |

## 数据迁移说明

| 迁移 | 内容 |
| --- | --- |
| `0001_init.sql` | 基础表：users / sessions / books / chapters / discussions |
| `0002_seed.sql` | 3 本演示书及章节、书评，纯演示数据，可删 |
| `0003` ~ `0006` | 站点设置、分类与封面、角色改名 owner、分卷 |
| `0007` / `0009` ~ `0011` | 性能索引 |
| `0008_password_resets.sql` | 找回密码令牌 |
| `0012_chapter_body_html.sql` | 章节正文预渲染缓存列，**必需** |

迁移按文件名顺序执行，Wrangler 用 `d1_migrations` 表记录已应用项；不要删除已应用的迁移或重排编号。

## 备份

后台 → **运维** → **导出备份**，下载 JSON 全量数据；同页可查看审计日志与 R2 状态。

## 更多

实现细节与优化记录见 [docs/代码审计与优化方案.md](docs/代码审计与优化方案.md)。
