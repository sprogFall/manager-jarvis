import { describe, expect, it } from 'vitest';

import { formatAction, formatPorts, formatStatus, formatTaskType, formatTime } from '@/lib/format';

describe('formatStatus', () => {
  it('maps known statuses to Chinese', () => {
    expect(formatStatus('running')).toBe('运行中');
    expect(formatStatus('exited')).toBe('已退出');
    expect(formatStatus('created')).toBe('已创建');
    expect(formatStatus('dead')).toBe('已停止');
    expect(formatStatus('queued')).toBe('排队中');
    expect(formatStatus('success')).toBe('成功');
    expect(formatStatus('failed')).toBe('失败');
  });

  it('returns original for unknown status', () => {
    expect(formatStatus('paused')).toBe('paused');
  });
});

describe('formatTaskType', () => {
  it('maps known task types to Chinese', () => {
    expect(formatTaskType('image.pull')).toBe('镜像拉取');
    expect(formatTaskType('image.build')).toBe('镜像构建');
    expect(formatTaskType('image.build.upload')).toBe('上传构建');
    expect(formatTaskType('image.load')).toBe('镜像加载');
    expect(formatTaskType('image.save')).toBe('镜像导出');
    expect(formatTaskType('stack.action')).toBe('栈操作');
    expect(formatTaskType('container.logs.export')).toBe('日志导出');
    expect(formatTaskType('image.git.clone')).toBe('Git 克隆');
    expect(formatTaskType('image.git.build')).toBe('Git 构建');
    expect(formatTaskType('image.load.url')).toBe('URL 加载');
  });

  it('returns original for unknown type', () => {
    expect(formatTaskType('unknown.type')).toBe('unknown.type');
  });
});

describe('formatAction', () => {
  it('maps known actions to Chinese', () => {
    expect(formatAction('container.start')).toBe('启动容器');
    expect(formatAction('container.stop')).toBe('停止容器');
    expect(formatAction('container.restart')).toBe('重启容器');
    expect(formatAction('container.kill')).toBe('强杀容器');
    expect(formatAction('container.remove')).toBe('删除容器');
    expect(formatAction('container.create')).toBe('创建容器');
    expect(formatAction('container.batch_stop')).toBe('批量停止');
    expect(formatAction('image.pull')).toBe('拉取镜像');
    expect(formatAction('image.delete')).toBe('删除镜像');
    expect(formatAction('image.build')).toBe('构建镜像');
    expect(formatAction('stack.import')).toBe('导入栈');
    expect(formatAction('stack.update')).toBe('更新栈');
    expect(formatAction('stack.action')).toBe('栈操作');
  });

  it('returns original for unknown action', () => {
    expect(formatAction('something.else')).toBe('something.else');
  });
});

describe('formatPorts', () => {
  it('formats host→container port string', () => {
    expect(formatPorts('0.0.0.0:8080->80/tcp')).toBe('宿主机 8080 → 容器 80/tcp');
  });

  it('formats with specific host IP', () => {
    expect(formatPorts('127.0.0.1:3000->3000/tcp')).toBe('宿主机 3000 → 容器 3000/tcp');
  });

  it('returns original if pattern does not match', () => {
    expect(formatPorts('80/tcp')).toBe('80/tcp');
  });
});

describe('formatTime', () => {
  it('formats date with zh-CN locale', () => {
    const result = formatTime('2026-01-15T08:30:00Z');
    expect(result).toContain('2026');
    expect(result).not.toBe('-');
  });

  it('returns dash for null', () => {
    expect(formatTime(null)).toBe('-');
  });
});
