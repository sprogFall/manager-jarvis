# Manager Jarvis 架构审计与改造报告

生成日期：2026-02-22

本文档面向“作为宿主机 Docker 管理控制台”的 Manager Jarvis 项目，给出：
1) 当前架构总览（后端/前端/数据流）
2) 业务不闭环与不友好点清单（按严重度）
3) 本次已落地的改造/重构/优化（含对应代码位置）
4) 下一步建议（保持“够用即止”的演进节奏）

---

## 1. 架构总览（现状）

### 1.1 后端（FastAPI）

- 入口：`apps/api/app/main.py`
  - lifespan：初始化数据目录、初始化 DB、确保管理员账号存在、初始化任务管理器
  - 路由：`apps/api/app/api/v1/router.py`
- 认证与鉴权：
  - JWT（access/refresh）：`apps/api/app/core/security.py`
  - 依赖注入：`apps/api/app/core/deps.py`（资源写操作依赖 `get_current_admin`）
- 核心能力模块：
  - 容器：`apps/api/app/api/v1/containers.py` + `apps/api/app/services/docker_service.py`
  - 镜像：`apps/api/app/api/v1/images.py` + `apps/api/app/services/docker_service.py`
  - Compose 栈：`apps/api/app/api/v1/stacks.py` + `apps/api/app/services/stack_service.py`
  - Git 工作区：`apps/api/app/services/git_service.py`（clone/sync/compose override）
  - 异步任务：`apps/api/app/services/task_service.py`（ThreadPoolExecutor + DB 记录）
  - 审计日志：`apps/api/app/core/audit.py` + `apps/api/app/api/v1/audit_logs.py`
- 风险操作二次确认：
  - `confirm=true` 或请求头 `X-Confirm-Action: yes`
  - 实现：`apps/api/app/utils/confirm.py`

### 1.2 前端（Next.js 15）

- 页面：
  - 登录：`apps/web/app/login/page.tsx`
  - 控制台：`apps/web/app/dashboard/page.tsx`
- API 访问集中封装：
  - `apps/web/lib/api.ts`（`ApiClient` 统一处理 Authorization、错误解析）
- UI 组织：
  - `apps/web/components/app-shell.tsx`：侧边栏 + 多面板切换
  - `apps/web/components/panels/*.tsx`：容器/镜像/栈/任务/审计/代理/工作区面板

### 1.3 关键业务数据流（简图）

- 登录：Web -> `POST /api/v1/auth/login` -> localStorage 保存 token -> `ApiClient` 自动带 Bearer
- 长任务：Web -> API enqueue -> DB `tasks` 写入 -> 后台线程执行 -> `GET /tasks/{id}` + `GET /tasks/{id}/logs` 轮询查看
- 高危操作：Web -> 带 `?confirm=true`（或 header）-> API 执行 + 审计落库

---

## 2. 业务不闭环 / 不友好点清单（审计结论）

> 说明：本节是“整理问题”，不等同于全部必须立刻实现；但需要明确现状、风险与优先级。

### P0（必须修复）

1) **工作区删除缺少二次确认（高危）**
   - 现象：`DELETE /api/v1/images/git/workspace/{id}` 会直接删除目录。
   - 风险：误触导致源码工作区丢失（不可恢复）。

2) **任务参数可能包含敏感信息，API 原样返回**
   - 现象：任务 `params` 可能包含 `token/auth_token/password` 等（Git 私有仓库、Release 下载、私有镜像仓库）。
   - 风险：前端/第三方调用 `GET /tasks` 即可读取敏感字段（虽然 UI 默认不展示，但接口已泄露）。

### P1（强烈建议优化）

3) **任务中心不闭环：失败任务无法在 UI 中重试，成功任务无法下载结果**
   - 现象：后端已实现 `POST /tasks/{id}/retry` 与 `GET /tasks/{id}/download`，但前端任务面板仅“查看日志”。
   - 影响：用户必须手工调用 API；无法形成“发现失败 -> 重试 -> 下载结果”的闭环。

4) **前端错误信息不友好（FastAPI JSON detail 直接作为字符串抛出）**
   - 现象：前端直接抛出 response.text，错误展示常见为 `{\"detail\":\"...\"}`。
   - 影响：用户难以理解；业务代码里出现字符串匹配分支（可维护性差）。

5) **代理功能文案与实际不一致（尤其是 socks5 与 URL 下载）**
   - 现象：UI 宣称 socks5 可用于 URL 下载；但 Python 标准库 `urllib` 对 socks5 代理并不可靠/不可用。
   - 影响：用户配置后实际失败，定位困难。

### P2（建议纳入后续迭代）

6) **API 能力与前端暴露不对齐**
   - API 已有：容器日志（含 SSE）、exec、日志导出、镜像 load/save/build/upload、栈导入/编辑等；
   - 前端当前：容器只做启停/详情；镜像只做拉取/删除/Git 构建/URL load；栈只做 up/down/restart/pull。
   - 影响：从“产品可用性”角度，仍存在多处断点。

7) **异步任务与进程耦合**
   - 现状：任务执行在 API 进程内的线程池；进程重启后 queued/running 的任务无法恢复。
   - 建议：后续考虑 worker 分离或基于持久队列（但注意“够用即止”，按需求推进）。

---

## 3. 本次已落地改造与优化（已完成）

### 3.1 高危操作二次确认补齐：删除工作区

- 变更：
  - `DELETE /api/v1/images/git/workspace/{workspace_id}` 新增二次确认要求（`confirm=true` 或 `X-Confirm-Action: yes`）。
- 代码：
  - `apps/api/app/api/v1/images.py`
  - 前端调用补齐：`apps/web/lib/api.ts`（`deleteWorkspace()` 自动追加 `?confirm=true`）
- 测试：
  - `apps/api/tests/test_git_image_api.py`
  - `apps/web/tests/api-client.test.ts`

### 3.2 任务中心闭环：UI 支持重试与下载结果

- 变更：
  - `TaskPanel` 弹窗内：
    - 失败任务显示“重试”
    - 成功且 result 包含 `file` 时显示“下载结果”
- 代码：
  - `apps/web/components/panels/task-panel.tsx`
  - `apps/web/components/app-shell.tsx`（透传 `retryTask/downloadTaskFile`）
  - `apps/web/lib/api.ts`（新增 `retryTask()`、`downloadTaskFile()`）
  - `apps/web/lib/types.ts`（新增类型）
- 测试：
  - `apps/web/tests/task-audit-panel.test.tsx`
  - `apps/web/tests/api-client.test.ts`

### 3.3 前端错误信息优化：解析 FastAPI `detail`

- 变更：
  - `ApiClient` 在非 2xx 时尝试解析 JSON（优先提取 `detail` / `detail.message` / `message`）。
- 代码：
  - `apps/web/lib/api.ts`
- 测试：
  - `apps/web/tests/api-client.test.ts`

### 3.4 代理能力“说清楚 + 防踩坑”

- 变更：
  - 当运行时代理为 `socks5/socks5h` 时，“从 URL 加载镜像”的后台任务直接报错（提示仅支持 http/https 代理），避免用户长时间等待/难定位。
  - 前端代理面板文案同步：明确 URL 下载仅支持 http/https。
- 代码：
  - `apps/api/app/services/task_service.py`
  - `apps/web/components/panels/proxy-panel.tsx`
- 测试：
  - `apps/api/tests/test_task_load_url_proxy.py`

### 3.5 工程质量：mypy 可通过（类型一致性修复）

- 变更：
  - 修复 `read1()` 的类型问题（改为 `read()`）。
  - 引入 `types-docker`，并修正部分 docker stubs 的类型差异写法（不改变业务行为）。
- 代码：
  - `apps/api/app/services/git_service.py`
  - `apps/api/app/services/stack_service.py`
  - `apps/api/app/services/docker_service.py`
  - `apps/api/pyproject.toml`

### 3.6 安全加固：任务接口输出参数脱敏

- 变更：
  - `GET /api/v1/tasks` 与 `GET /api/v1/tasks/{id}` 对 `params` 中的 `token/password/...` 做递归脱敏（输出为 `***`）。
  - 注意：当前仅对“API 输出”脱敏，任务记录在 DB 内仍保存原始参数（这是现有执行模型的限制，后续建议见第 4 节）。
- 代码：
  - `apps/api/app/api/v1/tasks.py`
- 测试：
  - `apps/api/tests/test_tasks_api.py`

---

## 4. 下一步建议（按优先级）

### P0

1) **敏感信息“存储侧”治理**
   - 现状：DB `TaskRecord.params` 仍可能保存 token/password（只是 API 输出已脱敏）。
   - 建议路径（按复杂度从低到高）：
     - A. 将敏感参数写入临时文件（权限收敛）并在 handler 中读取，用后清理；DB 只存引用 ID
     - B. 引入独立 secrets store（或加密字段）——需要明确运维成本

### P1

2) **补齐前端关键闭环（对齐后端能力）**
   - 容器：日志查看（含 follow）、日志导出、exec（或 Web Terminal）
   - 镜像：离线导入/导出、build/upload
   - 栈：导入、详情查看、在线编辑 compose

3) **异步任务体系演进**
   - 将任务执行与 API 进程解耦（worker），并考虑失败重试策略、并发控制、任务恢复（queued/running 的恢复策略）

### P2

4) **可观测性**
   - 请求级 request_id 贯穿 API 与任务日志
   - 基础指标：任务耗时、失败率、docker 调用失败统计

---

## 5. 如何验证（本仓库命令）

后端：
```bash
cd apps/api
.venv/bin/ruff check app tests
.venv/bin/mypy app
.venv/bin/pytest -q
```

前端：
```bash
cd apps/web
npm test
npm run lint
npm run build
```

