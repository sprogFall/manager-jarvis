import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { AuditPanel } from '@/components/panels/audit-panel';
import { TaskPanel } from '@/components/panels/task-panel';

describe('TaskPanel', () => {
  it('shows task rows', async () => {
    render(
      <TaskPanel
        loadTasks={async () => [
          {
            id: 'task-1',
            task_type: 'image.pull',
            status: 'running',
            resource_type: 'image',
            resource_id: 'nginx:latest',
            params: null,
            result: null,
            error: null,
            retry_of: null,
            created_by: 'admin',
            created_at: '2026-01-01T00:00:00Z',
            started_at: null,
            finished_at: null,
          },
        ]}
        getTask={async (id) => ({
          id,
          task_type: 'image.pull',
          status: 'running',
          resource_type: 'image',
          resource_id: 'nginx:latest',
          params: null,
          result: null,
          error: null,
          retry_of: null,
          created_by: 'admin',
          created_at: '2026-01-01T00:00:00Z',
          started_at: null,
          finished_at: null,
        })}
        getTaskLogs={async () => ''}
        retryTask={async () => ({ original_task_id: 'task-1', new_task_id: 'task-2' })}
        downloadTaskFile={async () => ({ filename: 'logs.txt', blob: new Blob(['hello']) })}
      />,
    );

    expect(await screen.findByText('task-1')).toBeInTheDocument();
    expect(screen.getByText('运行中')).toBeInTheDocument();
    expect(screen.getByText('镜像拉取')).toBeInTheDocument();
  });

  it('opens task log dialog', async () => {
    const user = userEvent.setup();
    render(
      <TaskPanel
        loadTasks={async () => [
          {
            id: 'task-1',
            task_type: 'stack.action',
            status: 'running',
            resource_type: 'stack',
            resource_id: 'demo',
            params: null,
            result: null,
            error: null,
            retry_of: null,
            created_by: 'admin',
            created_at: '2026-01-01T00:00:00Z',
            started_at: '2026-01-01T00:00:01Z',
            finished_at: null,
          },
        ]}
        getTask={async () => ({
          id: 'task-1',
          task_type: 'stack.action',
          status: 'running',
          resource_type: 'stack',
          resource_id: 'demo',
          params: { name: 'demo', action: 'up' },
          result: null,
          error: null,
          retry_of: null,
          created_by: 'admin',
          created_at: '2026-01-01T00:00:00Z',
          started_at: '2026-01-01T00:00:01Z',
          finished_at: null,
        })}
        getTaskLogs={async () => 'line-1\\nline-2\\n'}
        retryTask={async () => ({ original_task_id: 'task-1', new_task_id: 'task-2' })}
        downloadTaskFile={async () => ({ filename: 'logs.txt', blob: new Blob(['hello']) })}
      />,
    );

    expect(await screen.findByText('task-1')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '查看日志' }));
    expect(await screen.findByText(/line-1/)).toBeInTheDocument();
  });

  it('retries failed task from dialog', async () => {
    const user = userEvent.setup();
    const retryTask = vi.fn().mockResolvedValue({ original_task_id: 'task-1', new_task_id: 'task-2' });

    render(
      <TaskPanel
        loadTasks={async () => [
          {
            id: 'task-1',
            task_type: 'image.pull',
            status: 'failed',
            resource_type: 'image',
            resource_id: 'nginx:latest',
            params: null,
            result: null,
            error: 'boom',
            retry_of: null,
            created_by: 'admin',
            created_at: '2026-01-01T00:00:00Z',
            started_at: '2026-01-01T00:00:01Z',
            finished_at: '2026-01-01T00:00:02Z',
          },
        ]}
        getTask={async () => ({
          id: 'task-1',
          task_type: 'image.pull',
          status: 'failed',
          resource_type: 'image',
          resource_id: 'nginx:latest',
          params: null,
          result: null,
          error: 'boom',
          retry_of: null,
          created_by: 'admin',
          created_at: '2026-01-01T00:00:00Z',
          started_at: '2026-01-01T00:00:01Z',
          finished_at: '2026-01-01T00:00:02Z',
        })}
        getTaskLogs={async () => 'line-1\\n'}
        retryTask={retryTask}
        downloadTaskFile={async () => ({ filename: 'logs.txt', blob: new Blob(['hello']) })}
      />,
    );

    await user.click(await screen.findByRole('button', { name: '查看日志' }));
    await user.click(await screen.findByRole('button', { name: '重试' }));

    expect(retryTask).toHaveBeenCalledWith('task-1');
  });

  it('downloads task file from dialog', async () => {
    (globalThis.URL as unknown as { createObjectURL: (blob: Blob) => string }).createObjectURL = vi
      .fn()
      .mockReturnValue('blob:mock');
    (globalThis.URL as unknown as { revokeObjectURL: (url: string) => void }).revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    const user = userEvent.setup();
    const downloadTaskFile = vi.fn().mockResolvedValue({ filename: 'logs.txt', blob: new Blob(['hello']) });

    render(
      <TaskPanel
        loadTasks={async () => [
          {
            id: 'task-1',
            task_type: 'container.logs.export',
            status: 'success',
            resource_type: 'container',
            resource_id: 'c1',
            params: null,
            result: { file: '/tmp/logs.txt' },
            error: null,
            retry_of: null,
            created_by: 'admin',
            created_at: '2026-01-01T00:00:00Z',
            started_at: '2026-01-01T00:00:01Z',
            finished_at: '2026-01-01T00:00:02Z',
          },
        ]}
        getTask={async () => ({
          id: 'task-1',
          task_type: 'container.logs.export',
          status: 'success',
          resource_type: 'container',
          resource_id: 'c1',
          params: null,
          result: { file: '/tmp/logs.txt' },
          error: null,
          retry_of: null,
          created_by: 'admin',
          created_at: '2026-01-01T00:00:00Z',
          started_at: '2026-01-01T00:00:01Z',
          finished_at: '2026-01-01T00:00:02Z',
        })}
        getTaskLogs={async () => ''}
        retryTask={vi.fn().mockResolvedValue({ original_task_id: 'task-1', new_task_id: 'task-2' })}
        downloadTaskFile={downloadTaskFile}
      />,
    );

    await user.click(await screen.findByRole('button', { name: '查看日志' }));
    await user.click(await screen.findByRole('button', { name: '下载结果' }));

    expect(downloadTaskFile).toHaveBeenCalledWith('task-1');
  });
});

describe('AuditPanel', () => {
  it('shows audit rows', async () => {
    render(
      <AuditPanel
        loadAuditLogs={async () => [
          {
            id: 1,
            user_id: 1,
            username: 'admin',
            action: 'container.restart',
            resource_type: 'container',
            resource_id: 'c1',
            status: 'success',
            detail: null,
            created_at: '2026-01-01T00:00:00Z',
          },
        ]}
      />,
    );

    expect(await screen.findByText('重启容器')).toBeInTheDocument();
    expect(screen.getByText('admin')).toBeInTheDocument();
    expect(screen.getByText('成功')).toBeInTheDocument();
  });
});
