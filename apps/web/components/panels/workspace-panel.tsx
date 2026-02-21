'use client';

import { FormEvent, useEffect, useState } from 'react';

import { formatTime } from '@/lib/format';
import type {
  BuildFromWorkspacePayload,
  ComposeSource,
  GitClonePayload,
  TaskRecord,
  TaskResponse,
  WorkspaceComposeActionPayload,
  WorkspaceComposeInfo,
  WorkspaceComposeUpdatePayload,
  WorkspaceInfo,
  WorkspaceSummary,
} from '@/lib/types';

type NoticeTone = 'success' | 'error' | 'info';

interface Notice {
  tone: NoticeTone;
  text: string;
}

interface WorkspacePanelProps {
  loadWorkspaces: () => Promise<WorkspaceSummary[]>;
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
}

const SKELETON_ROWS = 4;

export function WorkspacePanel({
  loadWorkspaces,
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
}: WorkspacePanelProps) {
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

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

  async function refreshList() {
    setLoading(true);
    try {
      setWorkspaces(await loadWorkspaces());
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : '工作区列表加载失败' });
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

  async function openWorkspace(workspaceId: string) {
    setWorking(true);
    setNotice(null);
    try {
      const info = await getWorkspace(workspaceId);
      setWorkspace(info);
      if (info.dockerfiles.length > 0) {
        setBuildForm((prev) => ({ ...prev, dockerfile: info.dockerfiles[0] }));
      }
      resetComposeState();
      if (info.compose_files.length > 0) {
        await loadWorkspaceCompose(info.workspace_id, undefined, 'repository');
      }
      setNotice({ tone: 'success', text: `已打开工作区：${info.workspace_id}` });
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : '打开工作区失败' });
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
    setNotice(null);
    setCloneTaskId('');
    try {
      const payload: GitClonePayload = {
        repo_url: cloneForm.repo_url.trim(),
        branch: cloneForm.branch.trim() || undefined,
        token: cloneForm.token.trim() || undefined,
      };
      const result = await gitClone(payload);
      setCloneTaskId(result.task_id);
      setNotice({ tone: 'success', text: `克隆任务已创建：${result.task_id}（可在任务中心查看进度）` });
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : '克隆仓库失败' });
    } finally {
      setWorking(false);
    }
  }

  async function loadWorkspaceFromTask() {
    if (!cloneTaskId.trim()) {
      setNotice({ tone: 'error', text: '请输入任务 ID 或工作区 ID' });
      return;
    }

    setWorking(true);
    setNotice(null);
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

      await openWorkspace(workspaceId);
      await refreshList();
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
      await saveWorkspaceCompose(workspace.workspace_id, { compose_path: composePath, content: composeContent });
      await loadWorkspaceCompose(workspace.workspace_id, composePath, 'custom');
      setNotice({ tone: 'success', text: '已保存自定义 Compose' });
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
      setNotice({ tone: 'success', text: '已切换回仓库 Compose' });
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
      await refreshList();
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

  async function runDeleteWorkspace(workspaceId?: string) {
    const target = workspaceId || workspace?.workspace_id;
    if (!target) return;
    setWorking(true);
    try {
      await deleteWorkspace(target);
      if (!workspaceId || workspaceId === workspace?.workspace_id) {
        setWorkspace(null);
        setCloneTaskId('');
        resetComposeState();
      }
      await refreshList();
      setNotice({ tone: 'success', text: '工作区已清理' });
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : '清理工作区失败' });
    } finally {
      setWorking(false);
    }
  }

  useEffect(() => {
    void refreshList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>工作区管理</h2>
          <p>列出已克隆仓库，继续 Compose / Sync / Build 操作</p>
        </div>
        <button type="button" className="btn btn-ghost" onClick={() => void refreshList()} disabled={loading || working}>
          {loading ? '刷新中...' : '刷新'}
        </button>
      </div>

      {loading ? (
        <div className="loading-banner" role="status" aria-live="polite">
          <span className="spinner" aria-hidden="true" />
          <span>正在加载工作区...</span>
        </div>
      ) : null}

      {notice ? (
        <p className={`notice notice-${notice.tone}`} role={notice.tone === 'error' ? 'alert' : undefined}>
          {notice.text}
        </p>
      ) : null}

      <details className="feature-block">
        <summary>克隆新仓库</summary>
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
                任务 ID / 工作区 ID
                <input
                  aria-label="任务或工作区ID"
                  value={cloneTaskId}
                  onChange={(event) => setCloneTaskId(event.target.value)}
                  placeholder="task-id 或 32 位工作区 ID"
                />
              </label>
              <button type="button" className="btn btn-ghost" onClick={() => void loadWorkspaceFromTask()} disabled={working}>
                加载工作区
              </button>
            </div>
          ) : null}
        </div>
      </details>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>仓库</th>
              <th>分支</th>
              <th>工作区ID</th>
              <th>更新时间</th>
              <th>Compose</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: SKELETON_ROWS }).map((_, index) => (
                  <tr key={`skeleton-ws-${index}`} className="skeleton-row" aria-hidden="true">
                    <td>
                      <span className="skeleton-line" />
                    </td>
                    <td>
                      <span className="skeleton-line skeleton-short" />
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

            {!loading && workspaces.length === 0 ? (
              <tr>
                <td colSpan={6}>
                  <div className="empty-state">暂无工作区，请先克隆仓库</div>
                </td>
              </tr>
            ) : null}

            {!loading
              ? workspaces.map((item) => (
                  <tr key={item.workspace_id}>
                    <td data-label="仓库" className="cell-break">
                      {item.repo_url ?? '未知仓库'}
                    </td>
                    <td data-label="分支" className="mono">
                      {item.branch ?? '-'}
                    </td>
                    <td data-label="工作区ID" className="mono">
                      {item.workspace_id}
                    </td>
                    <td data-label="更新时间">{formatTime(item.updated_at)}</td>
                    <td data-label="Compose">{item.compose_files_count}</td>
                    <td data-label="操作">
                      <div className="row-actions">
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => void openWorkspace(item.workspace_id)}
                          disabled={working}
                        >
                          打开
                        </button>
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          onClick={() => void runDeleteWorkspace(item.workspace_id)}
                          disabled={working}
                        >
                          清理
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              : null}
          </tbody>
        </table>
      </div>

      {workspace ? (
        <div className="workspace-workflow">
          <h3>当前工作区</h3>
          <p className="muted helper-text mono">{workspace.workspace_id}</p>

          <form className="form-grid" onSubmit={submitBuild}>
            <p className="muted helper-text">
              Dockerfile {workspace.dockerfiles.length} 个，目录：{workspace.directories.join(', ') || '（根目录）'}
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
              <button type="button" className="btn btn-ghost" onClick={() => void runSyncWorkspace()} disabled={working}>
                同步代码
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => void runDeleteWorkspace()} disabled={working}>
                清理当前工作区
              </button>
            </div>
          </form>

          {workspace.compose_files.length > 0 ? (
            <div className="compose-editor">
              <p className="muted helper-text">
                Compose {workspace.compose_files.length} 个文件。
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
                <button type="button" className="btn btn-ghost" onClick={() => void resetToRepositoryCompose()} disabled={working || composeLoading}>
                  使用仓库Compose
                </button>
              </div>
              <div className="row-actions">
                <button type="button" className="btn btn-subtle" onClick={() => void runComposeAction('up')} disabled={working || composeLoading}>
                  Compose启动
                </button>
                <button type="button" className="btn btn-subtle" onClick={() => void runComposeAction('down')} disabled={working || composeLoading}>
                  Compose停止
                </button>
                <button type="button" className="btn btn-subtle" onClick={() => void runComposeAction('restart')} disabled={working || composeLoading}>
                  Compose重启
                </button>
                <button type="button" className="btn btn-subtle" onClick={() => void runComposeAction('pull')} disabled={working || composeLoading}>
                  Compose拉取
                </button>
              </div>
            </div>
          ) : (
            <p className="muted helper-text">未发现 Compose 文件。</p>
          )}
        </div>
      ) : null}
    </section>
  );
}

