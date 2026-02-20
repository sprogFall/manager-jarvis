import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ImagePanel } from '@/components/panels/image-panel';
import type { ImageSummary, TaskRecord, WorkspaceComposeInfo, WorkspaceInfo } from '@/lib/types';

const images: ImageSummary[] = [
  { id: 'sha256:abc', tags: ['nginx:latest'], size: 1234, created: '2026-01-01T00:00:00Z' },
];

const defaultProps = {
  loadImages: vi.fn().mockResolvedValue(images),
  pullImage: vi.fn().mockResolvedValue({ task_id: 'task-1' }),
  deleteImage: vi.fn().mockResolvedValue(undefined),
  gitClone: vi.fn().mockResolvedValue({ task_id: 'ws-task-1' }),
  getTask: vi.fn().mockResolvedValue({
    id: 'ws-task-1',
    task_type: 'image.git.clone',
    status: 'success',
    resource_type: 'image',
    resource_id: 'https://github.com/user/repo.git',
    params: {},
    result: { workspace_id: 'ws-task-1' },
    error: null,
    retry_of: null,
    created_by: 'admin',
    created_at: '2026-01-01T00:00:00Z',
    started_at: '2026-01-01T00:00:01Z',
    finished_at: '2026-01-01T00:00:10Z',
  } satisfies TaskRecord),
  getWorkspace: vi.fn().mockResolvedValue({
    workspace_id: 'ws-task-1',
    dockerfiles: ['Dockerfile', 'backend/Dockerfile'],
    directories: ['backend', 'frontend'],
    compose_files: ['compose.yaml'],
  } satisfies WorkspaceInfo),
  getWorkspaceCompose: vi.fn().mockResolvedValue({
    workspace_id: 'ws-task-1',
    compose_files: ['compose.yaml'],
    selected_compose: 'compose.yaml',
    source: 'repository',
    custom_exists: false,
    project_name: 'ws-demo',
    content: 'services:\n  web:\n    image: nginx:latest\n',
  } satisfies WorkspaceComposeInfo),
  saveWorkspaceCompose: vi.fn().mockResolvedValue({
    workspace_id: 'ws-task-1',
    compose_path: 'compose.yaml',
    custom_compose_path: '.jarvis/compose-overrides/abc.yaml',
  }),
  clearWorkspaceCompose: vi.fn().mockResolvedValue({
    workspace_id: 'ws-task-1',
    compose_path: 'compose.yaml',
    deleted: true,
  }),
  runWorkspaceComposeAction: vi.fn().mockResolvedValue({ task_id: 'compose-task-1' }),
  syncWorkspace: vi.fn().mockResolvedValue({ task_id: 'sync-task-1' }),
  buildFromWorkspace: vi.fn().mockResolvedValue({ task_id: 'build-1' }),
  deleteWorkspace: vi.fn().mockResolvedValue(undefined),
  loadFromUrl: vi.fn().mockResolvedValue({ task_id: 'url-1' }),
};

describe('ImagePanel', () => {
  it('shows prominent loading feedback while waiting image list', async () => {
    let resolveLoad: (value: ImageSummary[]) => void = () => undefined;
    const loadImages = vi.fn().mockImplementation(
      () =>
        new Promise<ImageSummary[]>((resolve) => {
          resolveLoad = resolve;
        }),
    );

    render(<ImagePanel {...defaultProps} loadImages={loadImages} />);

    expect(screen.getByText('正在加载镜像列表...')).toBeInTheDocument();

    resolveLoad(images);

    expect(await screen.findByText('nginx:latest')).toBeInTheDocument();
  });

  it('loads image list and submits pull request', async () => {
    const user = userEvent.setup();
    const loadImages = vi.fn().mockResolvedValue(images);
    const pullImage = vi.fn().mockResolvedValue({ task_id: 'task-1' });

    render(<ImagePanel {...defaultProps} loadImages={loadImages} pullImage={pullImage} />);

    expect(await screen.findByText('nginx:latest')).toBeInTheDocument();
    await user.type(screen.getByLabelText('镜像名'), 'redis');
    await user.type(screen.getByLabelText('Tag'), '7');
    await user.click(screen.getByRole('button', { name: '拉取镜像' }));

    await waitFor(() => {
      expect(pullImage).toHaveBeenCalledWith({ image: 'redis', tag: '7' });
    });
  });

  it('submits git clone request', async () => {
    const user = userEvent.setup();
    const gitClone = vi.fn().mockResolvedValue({ task_id: 'clone-task' });

    render(<ImagePanel {...defaultProps} gitClone={gitClone} />);

    await user.click(screen.getByText('从 Git 仓库构建镜像'));
    await user.type(screen.getByLabelText('仓库地址'), 'https://github.com/user/repo.git');
    await user.type(screen.getByLabelText('分支或Tag'), 'main');
    await user.click(screen.getByRole('button', { name: '克隆仓库' }));

    await waitFor(() => {
      expect(gitClone).toHaveBeenCalledWith({
        repo_url: 'https://github.com/user/repo.git',
        branch: 'main',
        token: undefined,
      });
    });
  });

  it('loads workspace and shows dockerfiles in build form', async () => {
    const user = userEvent.setup();
    const getWorkspace = vi.fn().mockResolvedValue({
      workspace_id: 'ws-task-1',
      dockerfiles: ['Dockerfile', 'backend/Dockerfile'],
      directories: ['backend'],
      compose_files: ['compose.yaml'],
    } satisfies WorkspaceInfo);

    render(<ImagePanel {...defaultProps} getWorkspace={getWorkspace} />);

    // Open git section and clone
    await user.click(screen.getByText('从 Git 仓库构建镜像'));
    await user.type(screen.getByLabelText('仓库地址'), 'https://github.com/user/repo.git');
    await user.click(screen.getByRole('button', { name: '克隆仓库' }));

    // Load workspace
    await waitFor(() => screen.getByLabelText('工作区ID'));
    await user.click(screen.getByRole('button', { name: '加载目录' }));

    await waitFor(() => {
      expect(getWorkspace).toHaveBeenCalledWith('ws-task-1');
    });

    // Build form should appear with dockerfile options
    expect(await screen.findByLabelText('Dockerfile路径')).toBeInTheDocument();
  });

  it('submits build from workspace', async () => {
    const user = userEvent.setup();
    const buildFromWorkspace = vi.fn().mockResolvedValue({ task_id: 'build-task' });
    const getWorkspace = vi.fn().mockResolvedValue({
      workspace_id: 'ws-id-32chars-xxxxxxxxxxxxxxxx',
      dockerfiles: ['Dockerfile'],
      directories: [],
      compose_files: ['compose.yaml'],
    } satisfies WorkspaceInfo);

    render(<ImagePanel {...defaultProps} getWorkspace={getWorkspace} buildFromWorkspace={buildFromWorkspace} />);

    await user.click(screen.getByText('从 Git 仓库构建镜像'));
    await user.type(screen.getByLabelText('仓库地址'), 'https://github.com/user/repo.git');
    await user.click(screen.getByRole('button', { name: '克隆仓库' }));

    await waitFor(() => screen.getByLabelText('工作区ID'));
    await user.click(screen.getByRole('button', { name: '加载目录' }));

    await waitFor(() => screen.getByLabelText('构建镜像Tag'));
    await user.type(screen.getByLabelText('构建镜像Tag'), 'myapp:v1');
    await user.click(screen.getByRole('button', { name: '构建镜像' }));

    await waitFor(() => {
      expect(buildFromWorkspace).toHaveBeenCalledWith(
        'ws-id-32chars-xxxxxxxxxxxxxxxx',
        expect.objectContaining({ tag: 'myapp:v1', cleanup_after: false }),
      );
    });
  });

  it('submits load from url request', async () => {
    const user = userEvent.setup();
    const loadFromUrl = vi.fn().mockResolvedValue({ task_id: 'url-task' });

    render(<ImagePanel {...defaultProps} loadFromUrl={loadFromUrl} />);

    await user.click(screen.getByText('从 URL 加载镜像（离线 tar）'));
    await user.type(
      screen.getByLabelText('tar下载地址'),
      'https://github.com/user/repo/releases/download/v1/image.tar',
    );
    await user.click(screen.getByRole('button', { name: '下载并加载' }));

    await waitFor(() => {
      expect(loadFromUrl).toHaveBeenCalledWith({
        url: 'https://github.com/user/repo/releases/download/v1/image.tar',
        auth_token: undefined,
      });
    });
  });

  it('supports compose customization and one-click compose action', async () => {
    const user = userEvent.setup();
    const getWorkspace = vi.fn().mockResolvedValue({
      workspace_id: 'ws-id-compose',
      dockerfiles: ['Dockerfile'],
      directories: [],
      compose_files: ['compose.yaml'],
    } satisfies WorkspaceInfo);
    const getWorkspaceCompose = vi.fn().mockImplementation(
      async (_workspaceId, _composePath, source = 'repository') =>
        ({
          workspace_id: 'ws-id-compose',
          compose_files: ['compose.yaml'],
          selected_compose: 'compose.yaml',
          source,
          custom_exists: source === 'custom',
          project_name: 'ws-id-compose',
          content:
            source === 'custom'
              ? 'services:\n  web:\n    image: redis:7\n'
              : 'services:\n  web:\n    image: nginx:latest\n',
        } satisfies WorkspaceComposeInfo),
    );
    const saveWorkspaceCompose = vi.fn().mockResolvedValue({
      workspace_id: 'ws-id-compose',
      compose_path: 'compose.yaml',
      custom_compose_path: '.jarvis/compose-overrides/aaa.yaml',
    });
    const runWorkspaceComposeAction = vi.fn().mockResolvedValue({ task_id: 'compose-up-1' });
    const syncWorkspace = vi.fn().mockResolvedValue({ task_id: 'sync-1' });
    const gitClone = vi.fn().mockResolvedValue({ task_id: 'ws-id-compose' });

    render(
      <ImagePanel
        {...defaultProps}
        gitClone={gitClone}
        getWorkspace={getWorkspace}
        getWorkspaceCompose={getWorkspaceCompose}
        saveWorkspaceCompose={saveWorkspaceCompose}
        runWorkspaceComposeAction={runWorkspaceComposeAction}
        syncWorkspace={syncWorkspace}
      />,
    );

    await user.click(screen.getByText('从 Git 仓库构建镜像'));
    await user.type(screen.getByLabelText('仓库地址'), 'https://github.com/user/repo.git');
    await user.click(screen.getByRole('button', { name: '克隆仓库' }));

    await waitFor(() => screen.getByLabelText('工作区ID'));
    await user.click(screen.getByRole('button', { name: '加载目录' }));

    await waitFor(() => {
      expect(getWorkspaceCompose).toHaveBeenCalledWith('ws-id-compose', undefined, 'repository');
    });

    const composeInput = await screen.findByLabelText('Compose内容');
    await user.clear(composeInput);
    await user.type(composeInput, 'services:\n  web:\n    image: redis:7\n');
    await user.click(screen.getByRole('button', { name: '保存自定义Compose' }));

    await waitFor(() => {
      expect(saveWorkspaceCompose).toHaveBeenCalledWith(
        'ws-id-compose',
        expect.objectContaining({ compose_path: 'compose.yaml' }),
      );
    });

    await user.selectOptions(screen.getByLabelText('配置来源'), 'custom');
    await user.click(screen.getByRole('button', { name: 'Compose启动' }));

    await waitFor(() => {
      expect(runWorkspaceComposeAction).toHaveBeenCalledWith(
        'ws-id-compose',
        'up',
        expect.objectContaining({ source: 'custom', compose_path: 'compose.yaml' }),
      );
    });

    await user.click(screen.getByRole('button', { name: '同步仓库代码' }));
    await waitFor(() => {
      expect(syncWorkspace).toHaveBeenCalledWith('ws-id-compose');
    });
  });
});
