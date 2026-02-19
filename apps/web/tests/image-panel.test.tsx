import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ImagePanel } from '@/components/panels/image-panel';
import type { ImageSummary, WorkspaceInfo } from '@/lib/types';

const images: ImageSummary[] = [
  { id: 'sha256:abc', tags: ['nginx:latest'], size: 1234, created: '2026-01-01T00:00:00Z' },
];

const defaultProps = {
  loadImages: vi.fn().mockResolvedValue(images),
  pullImage: vi.fn().mockResolvedValue({ task_id: 'task-1' }),
  deleteImage: vi.fn().mockResolvedValue(undefined),
  gitClone: vi.fn().mockResolvedValue({ task_id: 'ws-task-1' }),
  getWorkspace: vi.fn().mockResolvedValue({
    workspace_id: 'ws-task-1',
    dockerfiles: ['Dockerfile', 'backend/Dockerfile'],
    directories: ['backend', 'frontend'],
  } satisfies WorkspaceInfo),
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
        expect.objectContaining({ tag: 'myapp:v1', cleanup_after: true }),
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
});
