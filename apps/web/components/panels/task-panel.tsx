'use client';

import { useEffect, useState } from 'react';

import { formatStatus, formatTaskType, formatTime } from '@/lib/format';
import type { DownloadTaskFileResult, RetryTaskResponse, TaskRecord } from '@/lib/types';

interface TaskPanelProps {
  loadTasks: () => Promise<TaskRecord[]>;
  getTask: (taskId: string) => Promise<TaskRecord>;
  getTaskLogs: (taskId: string, tail?: number) => Promise<string>;
  retryTask: (taskId: string) => Promise<RetryTaskResponse>;
  downloadTaskFile: (taskId: string) => Promise<DownloadTaskFileResult>;
}

interface Notice {
  tone: 'error';
  text: string;
}

export function TaskPanel({ loadTasks, getTask, getTaskLogs, retryTask, downloadTaskFile }: TaskPanelProps) {
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [selectedTask, setSelectedTask] = useState<TaskRecord | null>(null);
  const [taskLogs, setTaskLogs] = useState<string>('');
  const [taskDetailLoading, setTaskDetailLoading] = useState(false);
  const [taskDetailError, setTaskDetailError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [actionWorking, setActionWorking] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      setTasks(await loadTasks());
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : '任务列表加载失败' });
    } finally {
      setLoading(false);
    }
  }

  async function refreshTaskDetail(taskId: string, { quiet = false }: { quiet?: boolean } = {}) {
    if (!quiet) {
      setTaskDetailLoading(true);
    }
    setTaskDetailError(null);
    try {
      const detail = await getTask(taskId);
      setSelectedTask(detail);
      const logs = await getTaskLogs(taskId, 500);
      setTaskLogs(logs);
    } catch (error) {
      setTaskDetailError(error instanceof Error ? error.message : '任务详情加载失败');
    } finally {
      setTaskDetailLoading(false);
    }
  }

  async function runRetry(taskId: string) {
    setActionWorking(true);
    setTaskDetailError(null);
    try {
      const result = await retryTask(taskId);
      setAutoRefresh(true);
      await refresh();
      await refreshTaskDetail(result.new_task_id);
    } catch (error) {
      setTaskDetailError(error instanceof Error ? error.message : '任务重试失败');
    } finally {
      setActionWorking(false);
    }
  }

  async function runDownload(taskId: string) {
    setActionWorking(true);
    setTaskDetailError(null);
    try {
      const result = await downloadTaskFile(taskId);

      if (typeof window === 'undefined' || typeof document === 'undefined') {
        throw new Error('当前环境不支持下载');
      }
      if (typeof window.URL?.createObjectURL !== 'function') {
        throw new Error('浏览器不支持 blob 下载');
      }

      const url = window.URL.createObjectURL(result.blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = result.filename || `task-${taskId}`;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      link.remove();
      if (typeof window.URL.revokeObjectURL === 'function') {
        window.URL.revokeObjectURL(url);
      }
    } catch (error) {
      setTaskDetailError(error instanceof Error ? error.message : '下载任务结果失败');
    } finally {
      setActionWorking(false);
    }
  }

  function openTask(task: TaskRecord) {
    setSelectedTask(task);
    setTaskLogs('');
    setTaskDetailError(null);
    setAutoRefresh(task.status === 'queued' || task.status === 'running');
    void refreshTaskDetail(task.id);
  }

  function closeTask() {
    setSelectedTask(null);
    setTaskLogs('');
    setTaskDetailError(null);
    setTaskDetailLoading(false);
    setAutoRefresh(true);
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedTask || !autoRefresh) {
      return;
    }
    if (selectedTask.status !== 'queued' && selectedTask.status !== 'running') {
      return;
    }
    const timer = window.setInterval(() => {
      void refreshTaskDetail(selectedTask.id, { quiet: true });
    }, 1200);
    return () => {
      window.clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTask?.id, selectedTask?.status, autoRefresh]);

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>任务中心</h2>
          <p>跟踪异步任务执行状态</p>
        </div>
        <button type="button" className="btn btn-ghost" onClick={() => void refresh()} disabled={loading}>
          {loading ? '刷新中...' : '刷新'}
        </button>
      </div>

      {loading ? (
        <div className="loading-banner" role="status" aria-live="polite">
          <span className="spinner" aria-hidden="true" />
          <span>正在加载任务列表...</span>
        </div>
      ) : null}

      {notice ? (
        <p className="notice notice-error" role="alert">
          {notice.text}
        </p>
      ) : null}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>类型</th>
              <th>状态</th>
              <th>资源</th>
              <th>创建时间</th>
              <th>日志</th>
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 5 }).map((_, index) => (
                  <tr key={`task-skeleton-${index}`} className="skeleton-row" aria-hidden="true">
                    <td>
                      <span className="skeleton-line" />
                    </td>
                    <td>
                      <span className="skeleton-line" />
                    </td>
                    <td>
                      <span className="skeleton-pill" />
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

            {!loading && tasks.length === 0 ? (
              <tr>
                <td colSpan={6}>
                  <div className="empty-state">暂无任务记录</div>
                </td>
              </tr>
            ) : null}

            {!loading
              ? tasks.map((task) => (
                  <tr key={task.id}>
                    <td data-label="ID" className="mono">
                      {task.id}
                    </td>
                    <td data-label="类型">{formatTaskType(task.task_type)}</td>
                    <td data-label="状态">
                      <span className={`status status-${task.status}`}>{formatStatus(task.status)}</span>
                    </td>
                    <td data-label="资源">{task.resource_id ?? '-'}</td>
                    <td data-label="创建时间">{formatTime(task.created_at)}</td>
                    <td data-label="日志">
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => openTask(task)}>
                        查看日志
                      </button>
                    </td>
                  </tr>
                ))
              : null}
          </tbody>
        </table>
      </div>

      {selectedTask ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="任务详情">
          <div className="modal">
            <div className="modal-head">
              <div>
                <p className="cell-main">任务详情</p>
                <p className="cell-sub mono">{selectedTask.id}</p>
              </div>
              <div className="row-actions">
                {selectedTask.status === 'failed' ? (
                  <button
                    type="button"
                    className="btn btn-subtle btn-sm"
                    onClick={() => void runRetry(selectedTask.id)}
                    disabled={taskDetailLoading || actionWorking}
                  >
                    重试
                  </button>
                ) : null}

                {selectedTask.status === 'success' && selectedTask.result && typeof selectedTask.result.file === 'string' ? (
                  <button
                    type="button"
                    className="btn btn-subtle btn-sm"
                    onClick={() => void runDownload(selectedTask.id)}
                    disabled={taskDetailLoading || actionWorking}
                  >
                    下载结果
                  </button>
                ) : null}

                <label className="muted" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <input
                    type="checkbox"
                    checked={autoRefresh}
                    onChange={(event) => setAutoRefresh(event.target.checked)}
                  />
                  自动刷新
                </label>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => void refreshTaskDetail(selectedTask.id)}
                  disabled={taskDetailLoading || actionWorking}
                >
                  {taskDetailLoading ? '刷新中...' : '刷新'}
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={closeTask}>
                  关闭
                </button>
              </div>
            </div>

            <div className="modal-body">
              <div className="table-wrap" style={{ minWidth: 0 }}>
                <table style={{ minWidth: 0 }}>
                  <thead>
                    <tr>
                      <th>字段</th>
                      <th>值</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>类型</td>
                      <td>{formatTaskType(selectedTask.task_type)}</td>
                    </tr>
                    <tr>
                      <td>状态</td>
                      <td>
                        <span className={`status status-${selectedTask.status}`}>{formatStatus(selectedTask.status)}</span>
                      </td>
                    </tr>
                    <tr>
                      <td>资源</td>
                      <td className="mono">{selectedTask.resource_id ?? '-'}</td>
                    </tr>
                    <tr>
                      <td>创建</td>
                      <td>{formatTime(selectedTask.created_at)}</td>
                    </tr>
                    <tr>
                      <td>开始</td>
                      <td>{formatTime(selectedTask.started_at)}</td>
                    </tr>
                    <tr>
                      <td>结束</td>
                      <td>{formatTime(selectedTask.finished_at)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {taskDetailError ? (
                <p className="notice notice-error" role="alert">
                  {taskDetailError}
                </p>
              ) : null}

              <div>
                <p className="muted" style={{ marginBottom: 6 }}>
                  日志（最近 500 行）
                </p>
                <pre className="log-box">{taskLogs || (taskDetailLoading ? '加载中...' : '暂无日志')}</pre>
              </div>

              {selectedTask.error ? (
                <div>
                  <p className="muted" style={{ marginBottom: 6 }}>
                    错误信息
                  </p>
                  <pre className="log-box">{selectedTask.error}</pre>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
