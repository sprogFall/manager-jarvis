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

type NoticeTone = 'success' | 'error' | 'info';

interface Notice {
  tone: NoticeTone;
  text: string;
}

const SKELETON_ROWS = 4;

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
  const [notice, setNotice] = useState<Notice | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [form, setForm] = useState({ image: '', tag: '' });

  const [cloneForm, setCloneForm] = useState({ repo_url: '', branch: '', token: '' });
  const [cloneTaskId, setCloneTaskId] = useState('');
  const [workspace, setWorkspace] = useState<WorkspaceInfo | null>(null);
  const [buildForm, setBuildForm] = useState({ tag: '', dockerfile: 'Dockerfile', context_path: '.' });

  const [urlForm, setUrlForm] = useState({ url: '', auth_token: '' });

  async function refresh() {
    setLoading(true);
    try {
      setImages(await loadImages());
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : '镜像列表加载失败' });
    } finally {
      setLoading(false);
    }
  }

  async function submitPull(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.image.trim()) {
      setNotice({ tone: 'error', text: '请输入镜像名' });
      return;
    }

    setWorking(true);
    try {
      const result = await pullImage({ image: form.image.trim(), tag: form.tag.trim() || undefined });
      setNotice({ tone: 'success', text: `拉取任务已创建：${result.task_id}` });
      setForm({ image: '', tag: '' });
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : '拉取镜像失败' });
    } finally {
      setWorking(false);
    }
  }

  async function runDelete(image: string) {
    setWorking(true);
    setNotice({ tone: 'info', text: '正在删除镜像...' });
    try {
      await deleteImage(image);
      setNotice({ tone: 'success', text: '镜像已删除' });
      await refresh();
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : '删除镜像失败' });
    } finally {
      setWorking(false);
    }
  }

  async function submitClone(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!cloneForm.repo_url.trim()) {
      setNotice({ tone: 'error', text: '请输入仓库地址' });
      return;
    }

    setWorking(true);
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
      setNotice({ tone: 'success', text: `克隆任务已创建：${result.task_id}，任务完成后请输入工作区 ID 加载目录` });
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : '克隆仓库失败' });
    } finally {
      setWorking(false);
    }
  }

  async function loadWorkspace() {
    if (!cloneTaskId.trim()) {
      setNotice({ tone: 'error', text: '请先克隆仓库或输入工作区 ID' });
      return;
    }

    setWorking(true);
    try {
      const info = await getWorkspace(cloneTaskId.trim());
      setWorkspace(info);
      if (info.dockerfiles.length > 0) {
        setBuildForm((prev) => ({ ...prev, dockerfile: info.dockerfiles[0] }));
      }
      setNotice({ tone: 'success', text: `已加载工作区：${info.workspace_id}` });
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : '加载工作区失败' });
    } finally {
      setWorking(false);
    }
  }

  async function submitBuild(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!workspace) return;
    if (!buildForm.tag.trim()) {
      setNotice({ tone: 'error', text: '请输入镜像 Tag' });
      return;
    }

    setWorking(true);
    try {
      const result = await buildFromWorkspace(workspace.workspace_id, {
        tag: buildForm.tag.trim(),
        dockerfile: buildForm.dockerfile || 'Dockerfile',
        context_path: buildForm.context_path.trim() || '.',
        cleanup_after: true,
      });
      setNotice({ tone: 'success', text: `构建任务已创建：${result.task_id}` });
      setWorkspace(null);
      setCloneTaskId('');
      setCloneForm({ repo_url: '', branch: '', token: '' });
      setBuildForm({ tag: '', dockerfile: 'Dockerfile', context_path: '.' });
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : '构建镜像失败' });
    } finally {
      setWorking(false);
    }
  }

  async function runDeleteWorkspace() {
    if (!workspace) return;

    setWorking(true);
    try {
      await deleteWorkspace(workspace.workspace_id);
      setWorkspace(null);
      setCloneTaskId('');
      setNotice({ tone: 'success', text: '工作区已清理' });
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : '清理工作区失败' });
    } finally {
      setWorking(false);
    }
  }

  async function submitLoadFromUrl(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!urlForm.url.trim()) {
      setNotice({ tone: 'error', text: '请输入镜像 tar 下载地址' });
      return;
    }

    setWorking(true);
    try {
      const result = await loadFromUrl({
        url: urlForm.url.trim(),
        auth_token: urlForm.auth_token.trim() || undefined,
      });
      setNotice({ tone: 'success', text: `加载任务已创建：${result.task_id}` });
      setUrlForm({ url: '', auth_token: '' });
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : '从 URL 加载镜像失败' });
    } finally {
      setWorking(false);
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
        <button type="button" className="btn btn-ghost" onClick={() => void refresh()} disabled={loading || working}>
          {loading ? '刷新中...' : '刷新'}
        </button>
      </div>

      {loading ? (
        <div className="loading-banner" role="status" aria-live="polite">
          <span className="spinner" aria-hidden="true" />
          <span>正在加载镜像列表...</span>
        </div>
      ) : null}

      {notice ? (
        <p className={`notice notice-${notice.tone}`} role={notice.tone === 'error' ? 'alert' : undefined}>
          {notice.text}
        </p>
      ) : null}

      <form className="form-grid form-grid-pull" onSubmit={submitPull}>
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
        <button type="submit" className="btn" disabled={working}>
          {working ? '处理中...' : '拉取镜像'}
        </button>
      </form>

      <details className="feature-block">
        <summary>从 Git 仓库构建镜像</summary>
        <div className="sub-section">
          <form className="form-grid" onSubmit={submitClone}>
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
            <button type="submit" className="btn" disabled={working}>
              {working ? '处理中...' : '克隆仓库'}
            </button>
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
              <button type="button" className="btn btn-ghost" onClick={() => void loadWorkspace()} disabled={working}>
                加载目录
              </button>
            </div>
          ) : null}

          {workspace ? (
            <form className="form-grid" onSubmit={submitBuild}>
              <p className="muted helper-text">
                发现 {workspace.dockerfiles.length} 个 Dockerfile，目录：
                {workspace.directories.join(', ') || '（根目录）'}
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
                  {workspace.dockerfiles.length === 0 ? <option value="Dockerfile">Dockerfile</option> : null}
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
              <div className="row-actions">
                <button type="submit" className="btn" disabled={working}>
                  {working ? '处理中...' : '构建镜像'}
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => void runDeleteWorkspace()} disabled={working}>
                  清理工作区
                </button>
              </div>
            </form>
          ) : null}
        </div>
      </details>

      <details className="feature-block">
        <summary>从 URL 加载镜像（离线 tar）</summary>
        <div className="sub-section">
          <form className="form-grid form-grid-url" onSubmit={submitLoadFromUrl}>
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
            <button type="submit" className="btn" disabled={working}>
              {working ? '处理中...' : '下载并加载'}
            </button>
          </form>
        </div>
      </details>

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
            {loading
              ? Array.from({ length: SKELETON_ROWS }).map((_, index) => (
                  <tr key={`skeleton-image-${index}`} className="skeleton-row" aria-hidden="true">
                    <td>
                      <span className="skeleton-line" />
                    </td>
                    <td>
                      <span className="skeleton-line" />
                    </td>
                    <td>
                      <span className="skeleton-line skeleton-short" />
                    </td>
                    <td>
                      <span className="skeleton-line skeleton-short" />
                    </td>
                  </tr>
                ))
              : null}

            {!loading && images.length === 0 ? (
              <tr>
                <td colSpan={4}>
                  <div className="empty-state">暂无镜像数据</div>
                </td>
              </tr>
            ) : null}

            {!loading
              ? images.map((item) => (
                  <tr key={item.id}>
                    <td>{item.tags.join(', ') || '<none>'}</td>
                    <td className="mono">{item.id.slice(0, 18)}</td>
                    <td>{formatBytes(item.size)}</td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        disabled={working}
                        onClick={() => void runDelete(item.tags[0] || item.id)}
                      >
                        删除
                      </button>
                    </td>
                  </tr>
                ))
              : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
