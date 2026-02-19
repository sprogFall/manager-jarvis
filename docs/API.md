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
- `GET /images/exports/{filename}`

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

## 审计
- `GET /audit-logs`
