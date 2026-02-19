# Manager Jarvis 构建清单（FastAPI + Next.js）

> 目标：构建一个“宿主机 Docker 管理助手”，支持 **Docker 方式部署** 与 **原生方式部署**，通过 Web 页面完成容器/镜像/日志/构建/离线镜像导入等操作。

## 1. 产品目标与边界

### 1.1 核心目标
- 面向单机或小规模多机场景，提供 Docker 可视化管理能力。
- 以“高频操作优先”原则覆盖：容器运行维护、镜像管理、日志排障、Compose 栈管理。
- 提供任务化与可审计能力，避免高风险操作“误触即执行”。

### 1.2 非目标（首版不做）
- 不直接做完整 Kubernetes 面板（可后续扩展）。
- 不做 PaaS 级应用编排平台（如完整发布流水线、灰度发布平台）。

## 2. 借鉴的 GitHub 成熟项目（截至 2026-02-19）

| 项目 | Stars | 可借鉴点 | 结论 |
| --- | ---: | --- | --- |
| [portainer/portainer](https://github.com/portainer/portainer) | 36,595 | Docker/Swarm/K8s 统一管理、资源维度完整（容器/镜像/卷/网络）、成熟的操作流 | 作为“功能完整度”标杆 |
| [louislam/dockge](https://github.com/louislam/dockge) | 22,071 | Compose 文件驱动、实时进度与终端、对 Stack 管理体验优秀 | 作为“Compose 交互体验”标杆 |
| [1Panel-dev/1Panel](https://github.com/1Panel-dev/1Panel) | 33,464 | Linux 主机管理 + 应用管理整合、备份恢复、安全治理 | 作为“主机运维一体化”标杆 |
| [Yacht-sh/Yacht](https://github.com/Yacht-sh/Yacht) | 3,840 | 模板化一键部署、应用模板生态 | 作为“应用模板中心”参考 |
| [dockpeek/dockpeek](https://github.com/dockpeek/dockpeek) | 1,694 | 多宿主机接入、Socket Proxy 安全模式、快速入口体验 | 作为“多主机接入与安全”参考 |
| [fastapi/full-stack-fastapi-template](https://github.com/fastapi/full-stack-fastapi-template) | 41,608 | FastAPI 全栈工程化、CI/测试/部署规范完善 | 作为“工程规范与脚手架”标杆 |
| [swarmpit/swarmpit](https://github.com/swarmpit/swarmpit) | 3,406 | Swarm 资源管理与团队共享控制台 | 借鉴 Swarm 模块设计；该项目处于维护模式，谨慎依赖 |

## 3. 功能清单（按优先级分层）

## 3.1 P0（MVP，必须）

### A. 认证与基础安全
- 本地账号登录（管理员）。
- JWT + Refresh Token。
- 关键操作二次确认（删除容器/镜像、批量停止、强制重建）。
- 操作审计日志（谁、何时、对哪个资源做了什么）。

### B. 容器管理
- 容器列表：状态、镜像、端口映射、CPU/内存（基础指标）。
- 容器操作：`start` / `stop` / `restart` / `kill` / `remove`。
- 容器详情：环境变量、挂载卷、网络、启动命令。
- 创建容器（基于镜像 + 表单配置）。

### C. 日志与终端
- 实时日志流（WebSocket/SSE）。
- 日志检索、下载、按时间窗口过滤。
- Web Terminal（exec 进入容器，带权限开关）。

### D. 镜像管理
- 镜像列表、标签、体积信息。
- 拉取镜像（支持私有仓库认证）。
- 删除镜像（含被容器引用校验）。
- 镜像构建（上传 Dockerfile/构建上下文或从 Git URL 构建）。
- 离线镜像导入：上传 `.tar/.tar.gz` 后执行 `docker load`。
- 离线镜像导出：执行 `docker save` 并下载。

### E. Compose 栈管理
- 指定 stacks 目录扫描与导入。
- 在线编辑 `compose.yaml`。
- `up/down/restart/pull` 操作。
- 展示栈内服务状态与最近操作记录。

### F. 任务中心
- 长任务异步化（pull/build/load/save/log-export）。
- 任务状态：排队中/运行中/成功/失败。
- 失败任务保留错误详情与重试入口。

## 3.2 P1（增强，建议）
- 多宿主机接入（agent 或 socket proxy 模式）。
- 镜像仓库管理（Docker Hub / GHCR / Harbor 凭据管理）。
- 卷与网络可视化管理（create/prune/inspect）。
- 应用模板中心（参考 Yacht/Portainer 模板模型）。
- 定时任务（定时拉镜像、定时重启、定时清理 dangling 镜像）。
- 告警通知（Webhook/邮件/企业微信/飞书）。

## 3.3 P2（扩展）
- 细粒度 RBAC（项目、主机、资源级）。
- OIDC/SSO（GitHub/GitLab/Keycloak）。
- 资源配额与策略（限制某用户可操作命名空间）。
- 插件系统（脚本插件、审批插件、通知插件）。
- AI 辅助运维（自然语言生成操作草案 + 人工确认执行）。

## 4. 推荐技术栈

## 4.1 前端（Web）
- **Next.js 15+（App Router）**
- **TypeScript**
- **Tailwind CSS + shadcn/ui**（快速构建高一致性后台 UI）
- **TanStack Query**（服务端状态管理）
- **Zustand**（本地 UI 状态）
- **xterm.js**（容器终端）
- **Socket.IO Client 或原生 WebSocket**（日志实时流）

## 4.2 后端（API）
- **FastAPI**（REST + WebSocket）
- **Pydantic v2**（配置与数据校验）
- **SQLAlchemy 2.x + Alembic**（元数据与审计日志）
- **Docker SDK for Python**（容器/镜像/网络/卷操作）
- **Redis + RQ/Celery（二选一）**（异步任务）
- **Structlog + Uvicorn/Gunicorn**（结构化日志）

## 4.3 数据与存储
- **PostgreSQL**：生产环境主数据库。
- **SQLite**：本地开发轻量模式。
- **本地对象目录**：离线镜像 tar 临时存储与清理。

## 4.4 部署与运行
- **Docker Compose**：容器化部署（推荐默认）。
- **Systemd**：原生部署（`jarvis-api`、`jarvis-web`、`jarvis-worker`）。
- **Nginx/Caddy**：反向代理与 TLS。

## 4.5 可观测性
- Prometheus 指标（接口耗时、任务耗时、失败率）。
- OpenTelemetry（可选）用于链路追踪。
- 前后端统一请求 ID，便于故障关联。

## 5. 部署形态设计

## 5.1 Docker 方式（推荐）
- 服务：`web`、`api`、`worker`、`redis`、`postgres`、`socket-proxy(可选)`。
- Docker 访问推荐优先经 `docker-socket-proxy`，避免直接暴露 `/var/run/docker.sock` 全权限。

## 5.2 原生方式
- `api`：`uvicorn` + systemd。
- `web`：`next build && next start`（或 `output: standalone`）。
- `worker`：systemd 独立进程。
- 使用 `.env` + `/etc/jarvis/` 管理配置。

## 6. API 能力清单（建议）

- `GET /api/v1/containers`
- `POST /api/v1/containers/{id}/start|stop|restart|kill`
- `GET /api/v1/containers/{id}/logs?follow=true`
- `POST /api/v1/containers/{id}/exec`
- `GET /api/v1/images`
- `POST /api/v1/images/pull`
- `POST /api/v1/images/build`
- `POST /api/v1/images/load`（离线 tar 导入）
- `POST /api/v1/images/save`（导出 tar）
- `GET /api/v1/stacks`
- `POST /api/v1/stacks/{name}/up|down|restart|pull`
- `GET /api/v1/tasks/{task_id}`
- `GET /api/v1/audit-logs`

## 7. 工程目录建议

```text
manager-jarvis/
  apps/
    api/                 # FastAPI
    web/                 # Next.js
    worker/              # 异步任务执行器
  packages/
    shared-types/        # OpenAPI 生成类型或共享 schema
    ui/                  # 可复用组件（可选）
  deploy/
    compose/             # docker-compose*.yml
    systemd/             # 原生部署 service 文件
    nginx/               # 反向代理配置
  scripts/
  docs/
```

## 8. 开发规范（必须执行）

## 8.1 Git 与分支
- 主分支：`main`。
- 功能分支：`feat/*`，修复分支：`fix/*`。
- 提交规范：**Conventional Commits**（`feat:` `fix:` `refactor:` `docs:` `test:` `chore:`）。

## 8.2 代码规范
- Python：`ruff + black + mypy`。
- TypeScript：`eslint + prettier + tsc --noEmit`。
- 所有 PR 必须通过 lint/typecheck。

## 8.3 API 规范
- OpenAPI-first，后端接口变更必须同步 schema。
- 错误码统一（业务码 + HTTP 状态码）。
- 长任务接口必须返回 `task_id`，禁止阻塞式长请求。

## 8.4 测试规范
- 后端：`pytest`（单元 + API 集成）。
- Docker 交互：`testcontainers` 或专用测试 daemon。
- 前端：组件测试 + `Playwright` E2E。
- 覆盖率门槛建议：后端 `>=85%`，关键路径（镜像导入/容器操作）必须有集成测试。

## 8.5 安全规范
- 默认不开启“免认证模式”。
- 敏感信息仅存储在环境变量/密钥管理系统。
- 对危险操作实现权限控制 + 二次确认 + 审计留痕。
- 上传 tar 必须做大小限制、后缀校验、临时文件清理策略。

## 8.6 CI/CD 规范（参考 fastapi/full-stack-fastapi-template）
- CI 阶段：`lint -> typecheck -> unit test -> integration test -> build`。
- PR 必须绿色通过后才可合并。
- 发布采用语义化版本（SemVer），自动生成变更日志。

## 8.7 文档规范
- `/docs` 维护：架构图、API 清单、部署手册、故障排查。
- 每个新功能 PR 需附最少一条“如何验证”。

## 9. 里程碑建议

## M1（1-2 周）
- 完成用户登录、容器列表与启停、镜像拉取、实时日志。

## M2（第 3-4 周）
- 完成镜像构建、离线导入导出、任务中心、审计日志。

## M3（第 5-6 周）
- 完成 Compose 栈管理、多主机接入（基础版）、CI 完整闭环。

## M4（第 7-8 周）
- 完成 RBAC 初版、告警通知、发布 v1.0。

## 10. 实施建议（落地顺序）
1. 先打通 P0 主流程（容器管理 + 镜像管理 + 日志 + 任务中心）。
2. 再做安全与审计（权限、二次确认、日志）。
3. 最后补齐多主机与模板生态，形成差异化能力。

