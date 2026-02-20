'use client';

import { FormEvent, useEffect, useState } from 'react';

import { formatBytes, formatTime } from '@/lib/format';
import type {
  BuildFromWorkspacePayload,
  ComposeSource,
  GitClonePayload,
  ImageSummary,
  LoadFromUrlPayload,
  PullImagePayload,
  TaskRecord,
  TaskResponse,
  WorkspaceComposeActionPayload,
  WorkspaceComposeInfo,
  WorkspaceComposeUpdatePayload,
  WorkspaceInfo,
} from '@/lib/types';

interface ImagePanelProps {
  loadImages: () => Promise<ImageSummary[]>;
  pullImage: (payload: PullImagePayload) => Promise<TaskResponse>;
  deleteImage: (image: string) => Promise<void>;
  gitClone: (payload: GitClonePayload) => Promise<TaskResponse>;
  getTask: (taskId: string) => Promise<TaskRecord>;
  getWorkspace: (id: string) => Promise<WorkspaceInfo>;
  getWorkspaceCompose: (id: string, composePath?: string, source?: ComposeSource) => Promise<WorkspaceComposeInfo>;
  saveWorkspaceCompose: (id: string, payload: WorkspaceComposeUpdatePayload) => Promise<{ compose_path: string }>;
  clearWorkspaceCompose: (id: string, composePath?: string) => Promise<{ deleted: boolean }>;
  runWorkspaceComposeAction: (
    id: string,
    action: 'up' | 'down' | 'restart' | 'pull',
    payload: WorkspaceComposeActionPayload,
  ) => Promise<TaskResponse>;
  syncWorkspace: (id: string) => Promise<TaskResponse>;
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
  getTask,
  getWorkspace,
  getWorkspaceCompose,
  saveWorkspaceCompose,
  clearWorkspaceCompose,
  runWorkspaceComposeAction,
  syncWorkspace,
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
  const [composeLoading, setComposeLoading] = useState(false);
  const [composePath, setComposePath] = useState('');
  const [composeSource, setComposeSource] = useState<ComposeSource>('repository');
  const [composeContent, setComposeContent] = useState('');
  const [composeProjectName, setComposeProjectName] = useState('');
  const [composeCustomExists, setComposeCustomExists] = useState(false);

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

  function resetComposeState() {
    setComposePath('');
    setComposeSource('repository');
    setComposeContent('');
    setComposeProjectName('');
    setComposeCustomExists(false);
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
    resetComposeState();
    try {
      const payload: GitClonePayload = {
        repo_url: cloneForm.repo_url.trim(),
        branch: cloneForm.branch.trim() || undefined,
        token: cloneForm.token.trim() || undefined,
      };
      const result = await gitClone(payload);
      setCloneTaskId(result.task_id);
      setNotice({ tone: 'success', text: `克隆任务已创建：${result.task_id}，可直接点击“加载目录”自动识别工作区` });
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
      let workspaceId = cloneTaskId.trim();
      try {
        const task = await getTask(workspaceId);
        if (task.task_type === 'image.git.clone') {
          if (task.status === 'failed') {
            throw new Error(task.error || '克隆任务失败');
          }
          if (task.status !== 'success') {
            throw new Error('克隆任务尚未完成，请稍后再试');
          }
          const resolvedWorkspaceId =
            task.result && typeof task.result.workspace_id === 'string' ? task.result.workspace_id : '';
          if (!resolvedWorkspaceId) {
            throw new Error('克隆任务结果里没有工作区 ID');
          }
          workspaceId = resolvedWorkspaceId;
          setCloneTaskId(resolvedWorkspaceId);
        }
      } catch (error) {
        const text = error instanceof Error ? error.message : '';
        if (!text.includes('Task not found') && !text.includes('"detail":"Task not found"')) {
          throw error;
        }
      }

      const info = await getWorkspace(workspaceId);
      setWorkspace(info);
      if (info.dockerfiles.length > 0) {
        setBuildForm((prev) => ({ ...prev, dockerfile: info.dockerfiles[0] }));
      }
      resetComposeState();
      if (info.compose_files.length > 0) {
        await loadWorkspaceCompose(info.workspace_id, undefined, 'repository');
      }
      setNotice({
        tone: 'success',
        text: `已加载工作区：${info.workspace_id}（Compose 文件 ${info.compose_files.length} 个）`,
      });
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : '加载工作区失败' });
    } finally {
      setWorking(false);
    }
  }

  async function loadWorkspaceCompose(workspaceId: string, nextComposePath?: string, source: ComposeSource = 'repository') {
    setComposeLoading(true);
    try {
      const compose = await getWorkspaceCompose(workspaceId, nextComposePath, source);
      setComposePath(compose.selected_compose);
      setComposeSource(compose.source);
      setComposeContent(compose.content);
      setComposeProjectName(compose.project_name);
      setComposeCustomExists(compose.custom_exists);
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : '加载 Compose 失败' });
    } finally {
      setComposeLoading(false);
    }
  }

  async function saveCustomCompose() {
    if (!workspace || !composePath.trim()) return;
    if (!composeContent.trim()) {
      setNotice({ tone: 'error', text: 'Compose 内容不能为空' });
      return;
    }
    setWorking(true);
    try {
      await saveWorkspaceCompose(workspace.workspace_id, {
        compose_path: composePath,
        content: composeContent,
      });
      await loadWorkspaceCompose(workspace.workspace_id, composePath, 'custom');
      setNotice({ tone: 'success', text: '已保存自定义 Compose，可用于后续更新和重启' });
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : '保存自定义 Compose 失败' });
    } finally {
      setWorking(false);
    }
  }

  async function resetToRepositoryCompose() {
    if (!workspace || !composePath.trim()) return;
    setWorking(true);
    try {
      await clearWorkspaceCompose(workspace.workspace_id, composePath);
      await loadWorkspaceCompose(workspace.workspace_id, composePath, 'repository');
      setNotice({ tone: 'success', text: '已切换回仓库 Compose，临时自定义已清理' });
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : '清理自定义 Compose 失败' });
    } finally {
      setWorking(false);
    }
  }

  async function runComposeAction(action: 'up' | 'down' | 'restart' | 'pull') {
    if (!workspace || !composePath.trim()) return;
    setWorking(true);
    try {
      const result = await runWorkspaceComposeAction(workspace.workspace_id, action, {
        compose_path: composePath,
        source: composeSource,
        project_name: composeProjectName.trim() || undefined,
        force_recreate: false,
        confirm: false,
      });
      setNotice({ tone: 'success', text: `Compose ${action} 任务已创建：${result.task_id}` });
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'Compose 操作失败' });
    } finally {
      setWorking(false);
    }
  }

  async function runSyncWorkspace() {
    if (!workspace) return;
    setWorking(true);
    try {
      const result = await syncWorkspace(workspace.workspace_id);
      setNotice({ tone: 'success', text: `代码同步任务已创建：${result.task_id}` });
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : '同步仓库失败' });
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
        cleanup_after: false,
      });
      setNotice({ tone: 'success', text: `构建任务已创建：${result.task_id}` });
      setBuildForm((prev) => ({ ...prev, tag: '' }));
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
      resetComposeState();
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
            <div className="workspace-workflow">
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
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => void runDeleteWorkspace()}
                    disabled={working}
                  >
                    清理工作区
                  </button>
                </div>
              </form>

              {workspace.compose_files.length > 0 ? (
                <div className="compose-editor">
                  <p className="muted helper-text">
                    Compose 自动发现 {workspace.compose_files.length} 个文件，可直接编辑并拉起服务。
                    {composeCustomExists ? ' 当前存在自定义副本。' : ''}
                  </p>
                  <div className="form-grid compose-grid">
                    <label>
                      Compose文件
                      <select
                        aria-label="Compose文件"
                        value={composePath}
                        onChange={(event) => {
                          const nextPath = event.target.value;
                          setComposePath(nextPath);
                          void loadWorkspaceCompose(workspace.workspace_id, nextPath, composeSource);
                        }}
                        disabled={working || composeLoading}
                      >
                        {workspace.compose_files.map((file) => (
                          <option key={file} value={file}>
                            {file}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      配置来源
                      <select
                        aria-label="配置来源"
                        value={composeSource}
                        onChange={(event) => {
                          const nextSource = event.target.value as ComposeSource;
                          setComposeSource(nextSource);
                          void loadWorkspaceCompose(workspace.workspace_id, composePath || undefined, nextSource);
                        }}
                        disabled={working || composeLoading}
                      >
                        <option value="repository">仓库原版</option>
                        <option value="custom">自定义副本</option>
                      </select>
                    </label>
                    <label>
                      Compose项目名
                      <input
                        aria-label="Compose项目名"
                        value={composeProjectName}
                        onChange={(event) => setComposeProjectName(event.target.value)}
                        placeholder="ws-demo"
                        disabled={working || composeLoading}
                      />
                    </label>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => void loadWorkspaceCompose(workspace.workspace_id, composePath || undefined, composeSource)}
                      disabled={working || composeLoading}
                    >
                      {composeLoading ? '加载中...' : '重新加载Compose'}
                    </button>
                  </div>
                  <label className="compose-content-label">
                    Compose内容
                    <textarea
                      aria-label="Compose内容"
                      value={composeContent}
                      onChange={(event) => setComposeContent(event.target.value)}
                      rows={12}
                      disabled={working || composeLoading}
                    />
                  </label>
                  <div className="row-actions">
                    <button type="button" className="btn" onClick={() => void saveCustomCompose()} disabled={working || composeLoading}>
                      保存自定义Compose
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => void resetToRepositoryCompose()}
                      disabled={working || composeLoading}
                    >
                      使用仓库Compose
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => void runSyncWorkspace()}
                      disabled={working || composeLoading}
                    >
                      同步仓库代码
                    </button>
                  </div>
                  <div className="row-actions">
                    <button type="button" className="btn btn-subtle" onClick={() => void runComposeAction('up')} disabled={working || composeLoading}>
                      Compose启动
                    </button>
                    <button type="button" className="btn btn-subtle" onClick={() => void runComposeAction('down')} disabled={working || composeLoading}>
                      Compose停止
                    </button>
                    <button
                      type="button"
                      className="btn btn-subtle"
                      onClick={() => void runComposeAction('restart')}
                      disabled={working || composeLoading}
                    >
                      Compose重启
                    </button>
                    <button type="button" className="btn btn-subtle" onClick={() => void runComposeAction('pull')} disabled={working || composeLoading}>
                      Compose拉取
                    </button>
                  </div>
                </div>
              ) : (
                <p className="muted helper-text">未发现 Compose 文件，仍可继续构建镜像。</p>
              )}
            </div>
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
              <th>创建时间</th>
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
                    <td>
                      <span className="skeleton-line skeleton-short" />
                    </td>
                  </tr>
                ))
              : null}

            {!loading && images.length === 0 ? (
              <tr>
                <td colSpan={5}>
                  <div className="empty-state">暂无镜像数据</div>
                </td>
              </tr>
            ) : null}

            {!loading
              ? images.map((item) => (
                  <tr key={item.id}>
                    <td data-label="Tag">{item.tags.join(', ') || '无标签'}</td>
                    <td data-label="镜像 ID" className="mono">
                      {item.id.slice(0, 18)}
                    </td>
                    <td data-label="体积">{formatBytes(item.size)}</td>
                    <td data-label="创建时间">{formatTime(item.created)}</td>
                    <td data-label="动作">
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
