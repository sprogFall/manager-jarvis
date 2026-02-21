import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { WorkspacePanel } from '@/components/panels/workspace-panel';
import type { WorkspaceComposeInfo, WorkspaceInfo, WorkspaceSummary } from '@/lib/types';

describe('WorkspacePanel', () => {
  it('lists workspaces and opens selected workspace', async () => {
    const user = userEvent.setup();
    const loadWorkspaces = vi.fn().mockResolvedValue([
      {
        workspace_id: 'a'.repeat(32),
        repo_url: 'https://github.com/user/repo.git',
        branch: 'main',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        compose_files_count: 1,
      } satisfies WorkspaceSummary,
    ]);
    const getWorkspace = vi.fn().mockResolvedValue({
      workspace_id: 'a'.repeat(32),
      dockerfiles: ['Dockerfile'],
      directories: [],
      compose_files: ['compose.yaml'],
    } satisfies WorkspaceInfo);
    const getWorkspaceCompose = vi.fn().mockResolvedValue({
      workspace_id: 'a'.repeat(32),
      compose_files: ['compose.yaml'],
      selected_compose: 'compose.yaml',
      source: 'repository',
      custom_exists: false,
      project_name: 'ws-demo',
      content: 'services: {}',
    } satisfies WorkspaceComposeInfo);

    render(
      <WorkspacePanel
        loadWorkspaces={loadWorkspaces}
        gitClone={vi.fn().mockResolvedValue({ task_id: 'task-1' })}
        getTask={vi.fn().mockResolvedValue({
          id: 'task-1',
          task_type: 'image.git.clone',
          status: 'success',
          resource_type: 'image',
          resource_id: null,
          params: null,
          result: { workspace_id: 'a'.repeat(32) },
          error: null,
          retry_of: null,
          created_by: null,
          created_at: null,
          started_at: null,
          finished_at: null,
        })}
        getWorkspace={getWorkspace}
        getWorkspaceCompose={getWorkspaceCompose}
        saveWorkspaceCompose={vi.fn().mockResolvedValue({ compose_path: 'compose.yaml' })}
        clearWorkspaceCompose={vi.fn().mockResolvedValue({ deleted: true })}
        runWorkspaceComposeAction={vi.fn().mockResolvedValue({ task_id: 'task-compose' })}
        syncWorkspace={vi.fn().mockResolvedValue({ task_id: 'task-sync' })}
        buildFromWorkspace={vi.fn().mockResolvedValue({ task_id: 'task-build' })}
        deleteWorkspace={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(await screen.findByText('https://github.com/user/repo.git')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '打开' }));
    await waitFor(() => {
      expect(getWorkspace).toHaveBeenCalledWith('a'.repeat(32));
    });

    expect(await screen.findByText('当前工作区')).toBeInTheDocument();
  });
});

