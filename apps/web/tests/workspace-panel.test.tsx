import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { WorkspacePanel } from '@/components/panels/workspace-panel';
import type { WorkspaceComposeInfo, WorkspaceEnvInfo, WorkspaceInfo, WorkspaceSummary } from '@/lib/types';

function defaultProps(overrides: Record<string, unknown> = {}) {
  return {
    loadWorkspaces: vi.fn().mockResolvedValue([]),
    gitClone: vi.fn().mockResolvedValue({ task_id: 'task-1' }),
    getTask: vi.fn().mockResolvedValue({
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
    }),
    getWorkspace: vi.fn().mockResolvedValue({
      workspace_id: 'a'.repeat(32),
      dockerfiles: ['Dockerfile'],
      directories: [],
      compose_files: ['compose.yaml'],
    } satisfies WorkspaceInfo),
    getWorkspaceCompose: vi.fn().mockResolvedValue({
      workspace_id: 'a'.repeat(32),
      compose_files: ['compose.yaml'],
      selected_compose: 'compose.yaml',
      source: 'repository',
      custom_exists: false,
      project_name: 'ws-demo',
      content: 'services: {}',
    } satisfies WorkspaceComposeInfo),
    saveWorkspaceCompose: vi.fn().mockResolvedValue({ compose_path: 'compose.yaml' }),
    clearWorkspaceCompose: vi.fn().mockResolvedValue({ deleted: true }),
    runWorkspaceComposeAction: vi.fn().mockResolvedValue({ task_id: 'task-compose' }),
    syncWorkspace: vi.fn().mockResolvedValue({ task_id: 'task-sync' }),
    buildFromWorkspace: vi.fn().mockResolvedValue({ task_id: 'task-build' }),
    deleteWorkspace: vi.fn().mockResolvedValue(undefined),
    getWorkspaceEnv: vi.fn().mockResolvedValue({
      workspace_id: 'a'.repeat(32),
      env_templates: [],
      selected_template: null,
      target_path: null,
      custom_exists: false,
      template_content: '',
      template_variables: [],
      custom_content: '',
      custom_variables: [],
    } satisfies WorkspaceEnvInfo),
    saveWorkspaceEnv: vi.fn().mockResolvedValue({ workspace_id: '', template_path: '', target_path: '' }),
    clearWorkspaceEnv: vi.fn().mockResolvedValue({ deleted: false }),
    ...overrides,
  };
}

describe('WorkspacePanel', () => {
  it('lists workspaces and opens selected workspace', async () => {
    const user = userEvent.setup();
    const props = defaultProps({
      loadWorkspaces: vi.fn().mockResolvedValue([
        {
          workspace_id: 'a'.repeat(32),
          repo_url: 'https://github.com/user/repo.git',
          branch: 'main',
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
          compose_files_count: 1,
        } satisfies WorkspaceSummary,
      ]),
    });

    render(<WorkspacePanel {...props} />);

    expect(await screen.findByText('https://github.com/user/repo.git')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '打开' }));
    await waitFor(() => {
      expect(props.getWorkspace).toHaveBeenCalledWith('a'.repeat(32));
    });

    expect(await screen.findByText('当前工作区')).toBeInTheDocument();
  });

  it('shows env editor when templates exist', async () => {
    const user = userEvent.setup();
    const envInfo: WorkspaceEnvInfo = {
      workspace_id: 'a'.repeat(32),
      env_templates: ['.env.example'],
      selected_template: '.env.example',
      target_path: '.env',
      custom_exists: false,
      template_content: '# DB\nDB_HOST=localhost\n',
      template_variables: [{ key: 'DB_HOST', value: 'localhost', comment: 'DB' }],
      custom_content: '',
      custom_variables: [],
    };
    const props = defaultProps({
      loadWorkspaces: vi.fn().mockResolvedValue([
        {
          workspace_id: 'a'.repeat(32),
          repo_url: 'https://github.com/user/repo.git',
          branch: 'main',
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
          compose_files_count: 1,
        } satisfies WorkspaceSummary,
      ]),
      getWorkspaceEnv: vi.fn().mockResolvedValue(envInfo),
    });

    render(<WorkspacePanel {...props} />);
    await user.click(await screen.findByRole('button', { name: '打开' }));

    expect(await screen.findByText('环境变量')).toBeInTheDocument();
    expect(screen.getByText('DB_HOST')).toBeInTheDocument();
  });

  it('hides env editor when no templates exist', async () => {
    const user = userEvent.setup();
    const props = defaultProps({
      loadWorkspaces: vi.fn().mockResolvedValue([
        {
          workspace_id: 'a'.repeat(32),
          repo_url: 'https://github.com/user/repo.git',
          branch: 'main',
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
          compose_files_count: 1,
        } satisfies WorkspaceSummary,
      ]),
    });

    render(<WorkspacePanel {...props} />);
    await user.click(await screen.findByRole('button', { name: '打开' }));
    await waitFor(() => {
      expect(props.getWorkspaceEnv).toHaveBeenCalled();
    });

    expect(screen.queryByText('环境变量')).not.toBeInTheDocument();
  });

  it('calls saveWorkspaceEnv on save button click', async () => {
    const user = userEvent.setup();
    const envInfo: WorkspaceEnvInfo = {
      workspace_id: 'a'.repeat(32),
      env_templates: ['.env.example'],
      selected_template: '.env.example',
      target_path: '.env',
      custom_exists: false,
      template_content: 'KEY=val\n',
      template_variables: [{ key: 'KEY', value: 'val', comment: '' }],
      custom_content: '',
      custom_variables: [],
    };
    const saveWorkspaceEnv = vi.fn().mockResolvedValue({ workspace_id: '', template_path: '', target_path: '' });
    const props = defaultProps({
      loadWorkspaces: vi.fn().mockResolvedValue([
        {
          workspace_id: 'a'.repeat(32),
          repo_url: 'https://github.com/user/repo.git',
          branch: 'main',
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
          compose_files_count: 1,
        } satisfies WorkspaceSummary,
      ]),
      getWorkspaceEnv: vi.fn().mockResolvedValue(envInfo),
      saveWorkspaceEnv,
    });

    render(<WorkspacePanel {...props} />);
    await user.click(await screen.findByRole('button', { name: '打开' }));
    await screen.findByText('环境变量');

    await user.click(screen.getByRole('button', { name: '保存环境变量' }));
    await waitFor(() => {
      expect(saveWorkspaceEnv).toHaveBeenCalled();
    });
  });
});
