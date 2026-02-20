export function formatBytes(value: number): string {
  if (Number.isNaN(value) || value < 0) return '-';
  if (value < 1024) return `${value} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let size = value / 1024;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(1)} ${units[unitIndex]}`;
}

export function formatTime(value: string | null): string {
  if (!value) return '-';
  const time = new Date(value);
  if (Number.isNaN(time.getTime())) return value;
  return `${time.toLocaleDateString('zh-CN')} ${time.toLocaleTimeString('zh-CN')}`;
}

const STATUS_MAP: Record<string, string> = {
  running: '运行中',
  exited: '已退出',
  created: '已创建',
  dead: '已停止',
  queued: '排队中',
  success: '成功',
  failed: '失败',
};

export function formatStatus(status: string): string {
  return STATUS_MAP[status] ?? status;
}

const TASK_TYPE_MAP: Record<string, string> = {
  'image.pull': '镜像拉取',
  'image.build': '镜像构建',
  'image.build.upload': '上传构建',
  'image.load': '镜像加载',
  'image.save': '镜像导出',
  'stack.action': '栈操作',
  'container.logs.export': '日志导出',
  'image.git.clone': 'Git 克隆',
  'image.git.build': 'Git 构建',
  'image.load.url': 'URL 加载',
};

export function formatTaskType(taskType: string): string {
  return TASK_TYPE_MAP[taskType] ?? taskType;
}

const ACTION_MAP: Record<string, string> = {
  'container.start': '启动容器',
  'container.stop': '停止容器',
  'container.restart': '重启容器',
  'container.kill': '强杀容器',
  'container.remove': '删除容器',
  'container.create': '创建容器',
  'container.batch_stop': '批量停止',
  'image.pull': '拉取镜像',
  'image.delete': '删除镜像',
  'image.build': '构建镜像',
  'stack.import': '导入栈',
  'stack.update': '更新栈',
  'stack.action': '栈操作',
};

export function formatAction(action: string): string {
  return ACTION_MAP[action] ?? action;
}

const PORT_RE = /^[\d.]+:(\d+)->(.+)$/;

export function formatPorts(port: string): string {
  const match = PORT_RE.exec(port);
  if (!match) return port;
  return `宿主机 ${match[1]} → 容器 ${match[2]}`;
}
