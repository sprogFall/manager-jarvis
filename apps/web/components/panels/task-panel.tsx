'use client';

import { useEffect, useState } from 'react';

import { formatTime } from '@/lib/format';
import type { TaskRecord } from '@/lib/types';

interface TaskPanelProps {
  loadTasks: () => Promise<TaskRecord[]>;
}

interface Notice {
  tone: 'error';
  text: string;
}

export function TaskPanel({ loadTasks }: TaskPanelProps) {
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<Notice | null>(null);

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

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
                  </tr>
                ))
              : null}

            {!loading && tasks.length === 0 ? (
              <tr>
                <td colSpan={5}>
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
                    <td data-label="类型">{task.task_type}</td>
                    <td data-label="状态">
                      <span className={`status status-${task.status}`}>{task.status}</span>
                    </td>
                    <td data-label="资源">{task.resource_id ?? '-'}</td>
                    <td data-label="创建时间">{formatTime(task.created_at)}</td>
                  </tr>
                ))
              : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
