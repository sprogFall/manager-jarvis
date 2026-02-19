# 功能映射（bulid.md -> 当前实现）

## P0 Docker 管理能力

- 认证与安全
  - 本地管理员账号、JWT + Refresh：`apps/api/app/api/v1/auth.py`
  - 高危操作二次确认（header 或 confirm 参数）：`apps/api/app/utils/confirm.py`
  - 审计日志：`apps/api/app/api/v1/audit_logs.py`

- 容器管理
  - 列表/详情/创建/启停重启强杀/删除/批量停止：`apps/api/app/api/v1/containers.py`

- 日志与终端
  - 日志查询 + 时间窗 + 搜索 + SSE 实时流：`apps/api/app/api/v1/containers.py`
  - 日志异步导出：`apps/api/app/api/v1/containers.py`
  - Web Terminal（WebSocket）：`apps/api/app/api/v1/containers.py`

- 镜像管理
  - 列表/拉取/删除/构建：`apps/api/app/api/v1/images.py`
  - 构建支持 Git/本地路径/上传构建上下文 tar：`apps/api/app/api/v1/images.py`
  - 离线导入/导出：`apps/api/app/api/v1/images.py`

- Compose 栈管理
  - stacks 目录扫描、导入、编辑 compose、`up/down/restart/pull`：`apps/api/app/api/v1/stacks.py`

- 任务中心
  - 异步任务队列 + 状态 + 错误详情 + 重试 + 下载：
    - `apps/api/app/services/task_service.py`
    - `apps/api/app/api/v1/tasks.py`

- 前端控制台（Next.js）
  - 登录、容器/镜像/栈/任务/审计管理页面与操作入口：
    - `apps/web/app/login/page.tsx`
    - `apps/web/app/dashboard/page.tsx`
    - `apps/web/components/panels/*.tsx`
  - 移动端适配与响应式交互：
    - `apps/web/app/globals.css`
  - 前端 TDD 测试：
    - `apps/web/tests/*.test.ts*`

## 明确未实现
- Kubernetes 相关能力（按需求排除）。
