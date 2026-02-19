# manager-jarvis

基于 `bulid.md` 的 Docker 管理实现（FastAPI + Next.js），不包含 k8s。

已实现（不含 k8s）：
- 认证（JWT + Refresh）
- 容器管理（列表/详情/创建/启停重启强杀/删除/批量停止）
- 日志（查询、过滤、SSE 实时流、异步导出）
- Web Terminal（WebSocket，管理员鉴权 + 开关控制）
- 镜像管理（列表/拉取/删除/构建/离线导入导出）
- Compose 栈（扫描、导入、编辑、up/down/restart/pull）
- 任务中心（排队/运行/成功/失败/重试/结果下载）
- 审计日志（操作人/时间/资源/动作/状态）
- 前端控制台（登录页、容器/镜像/栈/任务/审计多面板、移动端导航与响应式布局）

## 本地开发

### 后端 API
```bash
cd apps/api
python3 -m venv .venv
.venv/bin/pip install -e .[dev]
.venv/bin/uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 前端 Web
```bash
cd apps/web
npm install
npm run dev
```

## 测试（TDD）

### 后端测试
```bash
cd apps/api
.venv/bin/pytest -q
```

### 前端测试
```bash
cd apps/web
npm test
```

## 目录
- `apps/api`: FastAPI 服务
- `apps/web`: Next.js 前端控制台
- `deploy/compose/docker-compose.yml`: 容器化部署
- `docs/API.md`: 接口清单
