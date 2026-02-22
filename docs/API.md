# Manager Jarvis API (Docker 管理功能)

前缀：`/api/v1`

## 认证
- `POST /auth/login`
- `POST /auth/refresh`
- `GET /auth/me`

## 容器管理
- `GET /containers`
- `GET /containers/{id}`
- `POST /containers`
- `POST /containers/{id}/start|stop|restart|kill`
- `POST /containers/batch-stop`
- `DELETE /containers/{id}`

## 日志与终端
- `GET /containers/{id}/logs` (`follow=true` 为 SSE)
- `POST /containers/{id}/logs/export`（异步，结果从 tasks 下载）
- `POST /containers/{id}/exec`
- `WS /containers/{id}/terminal/ws?token=<access_token>`

## 镜像管理
- `GET /images`
- `POST /images/pull`（异步）
- `DELETE /images/{image_ref}`
- `POST /images/build`（JSON: path/git_url）
- `POST /images/build/upload`（上传构建上下文 tar/tar.gz）
- `POST /images/load`（离线导入 tar/tar.gz）
- `POST /images/save`（离线导出）
- `POST /images/load-url`（从 URL 下载 tar 并导入，异步）
- `GET /images/exports/{filename}`

## Git 工作区（镜像构建 / Compose）
- `POST /images/git/clone`（异步，克隆到工作区）
- `GET /images/git/workspaces`（列出工作区）
- `GET /images/git/workspace/{workspace_id}`（工作区详情：Dockerfile/目录/Compose 文件）
- `DELETE /images/git/workspace/{workspace_id}`（清理工作区，需二次确认）
- `GET /images/git/workspace/{workspace_id}/compose`（读取 compose，支持 source=repository|custom）
- `PUT /images/git/workspace/{workspace_id}/compose`（保存自定义 compose 覆盖）
- `DELETE /images/git/workspace/{workspace_id}/compose`（清理自定义 compose 覆盖）
- `POST /images/git/workspace/{workspace_id}/compose/{up|down|restart|pull}`（异步）
- `POST /images/git/workspace/{workspace_id}/build`（异步，从工作区构建镜像）
- `POST /images/git/workspace/{workspace_id}/sync`（异步，git pull 同步）

## Compose 栈
- `GET /stacks`
- `POST /stacks/import`
- `GET /stacks/{name}`
- `PUT /stacks/{name}/compose`
- `POST /stacks/{name}/up|down|restart|pull`（异步）

## 任务中心
- `GET /tasks`
- `GET /tasks/{task_id}`
- `POST /tasks/{task_id}/retry`
- `GET /tasks/{task_id}/download`
- `GET /tasks/{task_id}/logs`（文本日志，支持 tail=200）

## 系统设置
- `GET /system/proxy`
- `PUT /system/proxy`

## 审计
- `GET /audit-logs`
