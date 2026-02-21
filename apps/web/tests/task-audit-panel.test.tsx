import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

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
      />,
    );

    expect(await screen.findByText('task-1')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '查看日志' }));
    expect(await screen.findByText(/line-1/)).toBeInTheDocument();
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
