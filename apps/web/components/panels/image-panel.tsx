'use client';

import { FormEvent, useEffect, useState } from 'react';

import { formatBytes } from '@/lib/format';
import type {
  BuildFromWorkspacePayload,
  GitClonePayload,
  ImageSummary,
  LoadFromUrlPayload,
  PullImagePayload,
  TaskResponse,
  WorkspaceInfo,
} from '@/lib/types';

interface ImagePanelProps {
  loadImages: () => Promise<ImageSummary[]>;
  pullImage: (payload: PullImagePayload) => Promise<TaskResponse>;
  deleteImage: (image: string) => Promise<void>;
  gitClone: (payload: GitClonePayload) => Promise<TaskResponse>;
  getWorkspace: (id: string) => Promise<WorkspaceInfo>;
  buildFromWorkspace: (id: string, payload: BuildFromWorkspacePayload) => Promise<TaskResponse>;
  deleteWorkspace: (id: string) => Promise<void>;
  loadFromUrl: (payload: LoadFromUrlPayload) => Promise<TaskResponse>;
}

export function ImagePanel({
  loadImages,
  pullImage,
  deleteImage,
  gitClone,
  getWorkspace,
  buildFromWorkspace,
  deleteWorkspace,
  loadFromUrl,
}: ImagePanelProps) {
  const [images, setImages] = useState<ImageSummary[]>([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ image: '', tag: '' });

  // Git clone workflow state
  const [cloneForm, setCloneForm] = useState({ repo_url: '', branch: '', token: '' });
  const [cloneTaskId, setCloneTaskId] = useState('');
  const [workspace, setWorkspace] = useState<WorkspaceInfo | null>(null);
  const [buildForm, setBuildForm] = useState({ tag: '', dockerfile: 'Dockerfile', context_path: '.' });

  // URL load workflow state
  const [urlForm, setUrlForm] = useState({ url: '', auth_token: '' });

  async function refresh() {
    setLoading(true);
    setMessage('');
    try {
      setImages(await loadImages());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '镜像列表加载失败');
    } finally {
      setLoading(false);
    }
  }

  async function submitPull(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.image.trim()) {
      setMessage('请输入镜像名');
      return;
    }
    try {
      const result = await pullImage({ image: form.image.trim(), tag: form.tag.trim() || undefined });
      setMessage(`拉取任务已创建：${result.task_id}`);
      setForm({ image: '', tag: '' });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '拉取镜像失败');
    }
  }

  async function runDelete(image: string) {
    try {
      await deleteImage(image);
      setMessage('镜像已删除');
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '删除镜像失败');
    }
  }

  async function submitClone(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!cloneForm.repo_url.trim()) {
      setMessage('请输入仓库地址');
      return;
    }
    setWorkspace(null);
    setCloneTaskId('');
    try {
      const payload: GitClonePayload = {
        repo_url: cloneForm.repo_url.trim(),
        branch: cloneForm.branch.trim() || undefined,
        token: cloneForm.token.trim() || undefined,
      };
      const result = await gitClone(payload);
      setCloneTaskId(result.task_id);
      setMessage(`克隆任务已创建：${result.task_id}，任务完成后请输入工作区 ID 加载目录`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '克隆仓库失败');
    }
  }

  async function loadWorkspace() {
    if (!cloneTaskId.trim()) {
      setMessage('请先克隆仓库或输入工作区 ID');
      return;
    }
    try {
      const info = await getWorkspace(cloneTaskId.trim());
      setWorkspace(info);
      if (info.dockerfiles.length > 0) {
        setBuildForm((prev) => ({ ...prev, dockerfile: info.dockerfiles[0] }));
      }
      setMessage('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '加载工作区失败');
    }
  }

  async function submitBuild(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!workspace) return;
    if (!buildForm.tag.trim()) {
      setMessage('请输入镜像 Tag');
      return;
    }
    try {
      const result = await buildFromWorkspace(workspace.workspace_id, {
        tag: buildForm.tag.trim(),
        dockerfile: buildForm.dockerfile || 'Dockerfile',
        context_path: buildForm.context_path.trim() || '.',
        cleanup_after: true,
      });
      setMessage(`构建任务已创建：${result.task_id}`);
      setWorkspace(null);
      setCloneTaskId('');
      setCloneForm({ repo_url: '', branch: '', token: '' });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '构建镜像失败');
    }
  }

  async function runDeleteWorkspace() {
    if (!workspace) return;
    try {
      await deleteWorkspace(workspace.workspace_id);
      setWorkspace(null);
      setCloneTaskId('');
      setMessage('工作区已清理');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '清理工作区失败');
    }
  }

  async function submitLoadFromUrl(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!urlForm.url.trim()) {
      setMessage('请输入镜像 tar 下载地址');
      return;
    }
    try {
      const result = await loadFromUrl({
        url: urlForm.url.trim(),
        auth_token: urlForm.auth_token.trim() || undefined,
      });
      setMessage(`加载任务已创建：${result.task_id}`);
      setUrlForm({ url: '', auth_token: '' });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '从 URL 加载镜像失败');
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>镜像管理</h2>
          <p>支持拉取、删除、从 Git 构建、从 URL 加载与任务跟踪</p>
        </div>
        <button type="button" className="ghost" onClick={() => void refresh()}>
          刷新
        </button>
      </div>

      {/* Pull image form */}
      <form className="inline-form" onSubmit={submitPull}>
        <label>
          镜像名
          <input
            aria-label="镜像名"
            value={form.image}
            onChange={(event) => setForm((prev) => ({ ...prev, image: event.target.value }))}
            placeholder="nginx"
          />
        </label>
        <label>
          Tag
          <input
            aria-label="Tag"
            value={form.tag}
            onChange={(event) => setForm((prev) => ({ ...prev, tag: event.target.value }))}
            placeholder="latest"
          />
        </label>
        <button type="submit">拉取镜像</button>
      </form>

      {/* Git clone → browse → build section */}
      <details>
        <summary>从 Git 仓库构建镜像</summary>
        <div className="sub-section">
          <form className="inline-form" onSubmit={submitClone}>
            <label>
              仓库地址
              <input
                aria-label="仓库地址"
                value={cloneForm.repo_url}
                onChange={(event) => setCloneForm((prev) => ({ ...prev, repo_url: event.target.value }))}
                placeholder="https://github.com/user/repo.git"
              />
            </label>
            <label>
              分支/Tag（可选）
              <input
                aria-label="分支或Tag"
                value={cloneForm.branch}
                onChange={(event) => setCloneForm((prev) => ({ ...prev, branch: event.target.value }))}
                placeholder="main"
              />
            </label>
            <label>
              访问令牌（私有仓库）
              <input
                aria-label="访问令牌"
                type="password"
                value={cloneForm.token}
                onChange={(event) => setCloneForm((prev) => ({ ...prev, token: event.target.value }))}
                placeholder="ghp_xxxx / gitee token"
              />
            </label>
            <button type="submit">克隆仓库</button>
          </form>

          {cloneTaskId ? (
            <div className="workspace-loader">
              <label>
                工作区 ID（任务完成后填入）
                <input
                  aria-label="工作区ID"
                  value={cloneTaskId}
                  onChange={(event) => setCloneTaskId(event.target.value)}
                  placeholder="32 位工作区 ID"
                />
              </label>
              <button type="button" onClick={() => void loadWorkspace()}>
                加载目录
              </button>
            </div>
          ) : null}

          {workspace ? (
            <form className="inline-form" onSubmit={submitBuild}>
              <p className="muted">
                发现 {workspace.dockerfiles.length} 个 Dockerfile，目录：{workspace.directories.join(', ') || '（根目录）'}
              </p>
              <label>
                镜像 Tag
                <input
                  aria-label="构建镜像Tag"
                  value={buildForm.tag}
                  onChange={(event) => setBuildForm((prev) => ({ ...prev, tag: event.target.value }))}
                  placeholder="myapp:latest"
                />
              </label>
              <label>
                Dockerfile 路径
                <select
                  aria-label="Dockerfile路径"
                  value={buildForm.dockerfile}
                  onChange={(event) => setBuildForm((prev) => ({ ...prev, dockerfile: event.target.value }))}
                >
                  {workspace.dockerfiles.map((df) => (
                    <option key={df} value={df}>
                      {df}
                    </option>
                  ))}
                  {workspace.dockerfiles.length === 0 ? (
                    <option value="Dockerfile">Dockerfile</option>
                  ) : null}
                </select>
              </label>
              <label>
                构建上下文目录
                <input
                  aria-label="构建上下文目录"
                  value={buildForm.context_path}
                  onChange={(event) => setBuildForm((prev) => ({ ...prev, context_path: event.target.value }))}
                  placeholder="."
                />
              </label>
              <button type="submit">构建镜像</button>
              <button type="button" className="ghost" onClick={() => void runDeleteWorkspace()}>
                清理工作区
              </button>
            </form>
          ) : null}
        </div>
      </details>

      {/* Load from URL section */}
      <details>
        <summary>从 URL 加载镜像（离线 tar）</summary>
        <div className="sub-section">
          <form className="inline-form" onSubmit={submitLoadFromUrl}>
            <label>
              tar 下载地址
              <input
                aria-label="tar下载地址"
                value={urlForm.url}
                onChange={(event) => setUrlForm((prev) => ({ ...prev, url: event.target.value }))}
                placeholder="https://github.com/user/repo/releases/download/v1/image.tar"
              />
            </label>
            <label>
              访问令牌（私有 Release）
              <input
                aria-label="访问令牌"
                type="password"
                value={urlForm.auth_token}
                onChange={(event) => setUrlForm((prev) => ({ ...prev, auth_token: event.target.value }))}
                placeholder="Bearer token（可选）"
              />
            </label>
            <button type="submit">下载并加载</button>
          </form>
        </div>
      </details>

      {message ? <p className="message">{message}</p> : null}
      {loading ? <p className="muted">加载中...</p> : null}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Tag</th>
              <th>镜像 ID</th>
              <th>体积</th>
              <th>动作</th>
            </tr>
          </thead>
          <tbody>
            {images.map((item) => (
              <tr key={item.id}>
                <td>{item.tags.join(', ') || '<none>'}</td>
                <td className="mono">{item.id.slice(0, 18)}</td>
                <td>{formatBytes(item.size)}</td>
                <td>
                  <button type="button" onClick={() => void runDelete(item.tags[0] || item.id)}>
                    删除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
