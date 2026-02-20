import React from 'react';
import { render, screen } from '@testing-library/react';
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
      />,
    );

    expect(await screen.findByText('task-1')).toBeInTheDocument();
    expect(screen.getByText('运行中')).toBeInTheDocument();
    expect(screen.getByText('镜像拉取')).toBeInTheDocument();
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
