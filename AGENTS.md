# AGENTS.md

This file provides guidance to coding agents when working with code in this repository.

## 项目简介

Manager Jarvis 是一个宿主机 Docker 管理控制台，基于 FastAPI（后端）+ Next.js 15（前端）构建。管理 Docker 容器、镜像、Compose 栈，支持实时日志、Web Terminal、异步任务、审计日志。

---

## 开发原则（必须遵守）

### 语言
所有回答、注释讨论均使用**中文**。

### TDD 测试驱动开发
前后端均严格遵循 **Red → Green → Refactor** 循环：
1. **先写测试**：在编写任何业务代码之前，先写一个能体现需求的失败测试
2. **最小实现**：只写让测试通过的最少代码，不多写一行
3. **重构**：测试绿色后再清理代码，重构过程中保持测试持续通过

> 禁止"先实现再补测试"。每个新接口、新组件、新工具函数，都必须有对应测试先行。

### 简约原则
- **够用即止**：只实现当前需求，不为假设的未来场景预留扩展点
- **禁止过度抽象**：三处相似代码才考虑提取公共逻辑，一两处直接复制更清晰
- **禁止冗余**：没有调用方的函数/类/参数不写；能删的注释就删
- **优先复用**：新功能开发前先检索现有 service、util、fixture，能复用则复用

---

## 常用命令

### 后端（FastAPI）

```bash
cd apps/api

# 安装依赖（含开发工具）
.venv/bin/pip install -e .[dev]

# 开发服务器
.venv/bin/uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# 运行全部测试
.venv/bin/pytest -q

# 运行单个测试文件
.venv/bin/pytest tests/test_images_api.py -v

# 运行单个测试方法
.venv/bin/pytest tests/test_images_api.py::TestImagesAPI::test_pull_image_enqueue_task -v

# Lint
.venv/bin/ruff check app tests

# 类型检查
.venv/bin/mypy app
```

### 前端（Next.js）

```bash
cd apps/web

# 开发服务器
npm run dev

# 运行全部测试
npm test

# 运行单个测试文件
npm test -- tests/image-panel.test.tsx

# 运行指定测试用例
npm test -- tests/image-panel.test.tsx -t "submits git clone request"

# 监听模式
npm run test:watch

# 构建
npm run build

# Lint
npm run lint
```

### Docker Compose 部署

```bash
cd deploy/compose
docker compose up -d
```

### Git SSH 推送（push）

```bash
# 1) 生成 SSH Key（已存在可跳过）
ssh-keygen -t ed25519 -C "your_email@example.com"

# 2) 启动 agent 并添加私钥
eval "$(ssh-agent -s)"
ssh-add ~/.ssh/id_ed25519

# 3) 复制公钥并添加到 GitHub/Gitee SSH Keys
cat ~/.ssh/id_ed25519.pub

# 4) 将远端改为 SSH 地址（按实际仓库替换）
git remote set-url origin git@github.com:<owner>/<repo>.git

# 5) 验证 SSH 连接
ssh -T git@github.com

# 6) 推送代码
git push origin <branch>
```

---

## 架构概览

### 目录结构

```
apps/api/app/
  api/v1/        # 路由处理器：auth, containers, images, stacks, tasks, audit_logs
  core/          # 公共基础：config, security, deps(依赖注入), audit
  db/            # 数据库 session、初始化、init_db
  models/        # SQLAlchemy ORM 模型（User, TaskRecord, AuditLog）
  schemas/       # Pydantic 请求/响应 schema
  services/      # 业务逻辑（DockerService, StackService, TaskService, GitService）
  utils/         # 辅助工具（confirm 二次确认）
  main.py        # FastAPI app 实例 + lifespan 钩子

apps/web/
  app/           # Next.js App Router 页面（login, dashboard）
  components/    # UI 组件（app-shell, panels/）
  lib/           # api.ts（ApiClient）, types.ts, session.ts, format.ts
  tests/         # Vitest + React Testing Library 测试
```

### 关键设计模式

#### 1. 异步任务系统（task_service.py）

所有耗时操作（拉取/构建镜像、导出日志、Git 克隆等）都走异步任务：
- HTTP 接口立即返回 `{"task_id": "..."}` 并将任务写入数据库
- `TaskManager` 用 `ThreadPoolExecutor`（默认 4 个工作线程）在后台执行
- 任务状态：`queued → running → success/failed`
- 前端轮询 `GET /api/v1/tasks/{task_id}` 获取进度
- 新增任务类型时需要：① 写 handler 函数 `task_xxx(params)` → ② 在 `register_default_handlers()` 中注册

已注册任务类型：`image.pull`, `image.build`, `image.build.upload`, `image.load`, `image.save`, `stack.action`, `container.logs.export`, `image.git.clone`, `image.git.build`, `image.git.compose.action`, `image.git.sync`, `image.load.url`

#### 2. 危险操作二次确认（utils/confirm.py）

删除、强杀、批量停止等操作必须满足下列之一才能执行：
- Query 参数 `confirm=true`
- 请求头 `X-Confirm-Action: yes`

前端发送请求时通过 URL 拼接 `?confirm=true` 触发，测试中同理。

#### 3. 路由顺序约束（images.py）

`DELETE /images/{image_ref:path}` 使用 path 通配符，**必须定义在所有具体子路由之后**（例如 `DELETE /images/git/workspace/{id}` 必须在其前面）。FastAPI/Starlette 按注册顺序匹配，通配符会吞掉后续路由。

#### 4. 认证与依赖注入

- `get_current_user`（`core/deps.py`）：验证 Bearer JWT，返回 User 对象
- `get_current_admin`：在 `get_current_user` 基础上校验 `is_admin`
- 所有资源操作路由均依赖 `get_current_admin`
- 测试中通过 `app.dependency_overrides[get_current_admin] = lambda: ...` 注入虚拟用户

#### 5. 审计日志

每个写操作在路由处理器末尾调用 `write_audit_log(db, action, resource_type, resource_id, user, detail)`，记录到 `audit_logs` 表。

#### 6. 前端 ApiClient 模式

`lib/api.ts` 的 `ApiClient` 类集中管理所有请求：
- 构造时注入 `baseUrl` 和 `token`
- `request<T>()` 统一处理 Authorization 头、错误响应、JSON 解析
- `app-shell.tsx` 中的 `noClient` 对象提供未登录时的空实现，需与 `ApiClient` 的方法保持同步

---

## 测试基础设施

### 后端（tests/conftest.py）

- `prepare_runtime`（session 级）：清理并重建 `.runtime/` 下各数据目录
- `reset_state`（function 级，autouse）：每个测试前清空 DB 数据表和文件目录
- `stub_docker_service_init`（autouse）：将 `DockerService.__init__` stub 为空操作，防止连接真实 Docker
- `fake_task_manager`：替换所有路由模块中的 `get_task_manager()`，任务只记录不执行
- `client`：注入虚拟管理员用户，绕过认证
- `runtime_paths`：返回各测试数据目录路径（stacks/uploads/exports/workspaces）

所有环境变量（`DATABASE_URL`, `UPLOAD_DIR` 等）在 `conftest.py` 顶部通过 `os.environ.setdefault` 设置，须在 `from app...` 导入之前完成。

### 前端（vitest.setup.ts）

- 引入 `@testing-library/jest-dom/vitest` 提供 DOM matchers
- 每个测试后调用 `cleanup()`（显式注册 `afterEach`），防止多测试 DOM 叠加

---

## 配置项（环境变量）

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `SECRET_KEY` | `change-me` | JWT 签名密钥 |
| `DATABASE_URL` | `sqlite:///./jarvis.db` | 数据库连接串 |
| `ADMIN_USERNAME` | `admin` | 初始管理员用户名 |
| `ADMIN_PASSWORD` | `admin123456` | 初始管理员密码 |
| `DOCKER_BASE_URL` | `unix:///var/run/docker.sock` | Docker 守护进程地址 |
| `STACKS_DIR` | `./data/stacks` | Compose 栈目录 |
| `UPLOAD_DIR` | `./data/uploads` | 上传文件临时目录 |
| `EXPORT_DIR` | `./data/exports` | 导出文件目录 |
| `WORKSPACES_DIR` | `./data/workspaces` | Git 克隆工作区目录 |
| `TASK_LOG_DIR` | `./data/task-logs` | 异步任务日志目录（用于任务进度日志查看） |
| `MAX_UPLOAD_SIZE_MB` | `2048` | 上传文件大小上限 |
| `ENABLE_WEB_TERMINAL` | `true` | 是否开启 Web Terminal |

配置由 `app/core/config.py` 的 `Settings`（Pydantic BaseSettings）管理，`get_settings()` 带 `lru_cache`，测试中通过环境变量覆盖。

---

## Git 克隆工作区（GitService）

`app/services/git_service.py` 管理克隆仓库的本地工作区：
- workspace_id 为 32 位十六进制字符串（UUID4 hex），通过 `_validate_workspace_id()` 防路径穿越
- Token 通过 `_inject_token()` 嵌入 HTTPS URL（格式：`https://x-token:{token}@host/repo`）
- 错误信息中自动脱敏 token
- `shutil.rmtree(..., ignore_errors=True)` 用于安全清理
