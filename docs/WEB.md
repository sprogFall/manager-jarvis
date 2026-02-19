# Web 前端说明

前端目录：`apps/web`

## 页面
- `/login`: 管理员登录
- `/dashboard`: Docker 管理控制台

## 控制台模块
- 容器：列表与启停/重启/强制终止/删除
- 镜像：列表、拉取、删除
- Compose 栈：列表、up/down/restart/pull
- 任务中心：任务状态查看
- 审计日志：关键操作记录查看

## 移动端体验
- 小屏下使用侧边栏抽屉（菜单按钮打开）
- 表格区域支持横向滚动
- 表单在移动端切换为单列布局

## 运行
```bash
cd apps/web
npm install
npm run dev
```

## 测试
```bash
cd apps/web
npm test
npm run build
npm run lint
```
