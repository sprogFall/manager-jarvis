'use client';

import { useEffect, useMemo, useState } from 'react';

import { formatBytes } from '@/lib/format';
import type { ContainerSummary } from '@/lib/types';

interface ContainerPanelProps {
  loadContainers: () => Promise<ContainerSummary[]>;
  actionContainer: (containerId: string, action: 'start' | 'stop' | 'restart' | 'kill') => Promise<void>;
  removeContainer: (containerId: string) => Promise<void>;
}

type NoticeTone = 'success' | 'error' | 'info';

interface Notice {
  tone: NoticeTone;
  text: string;
}

const SKELETON_ROWS = 4;

export function ContainerPanel({ loadContainers, actionContainer, removeContainer }: ContainerPanelProps) {
  const [containers, setContainers] = useState<ContainerSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const countText = useMemo(() => `共 ${containers.length} 个容器`, [containers.length]);

  async function refresh() {
    setLoading(true);
    try {
      const next = await loadContainers();
      setContainers(next);
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : '容器列表加载失败' });
    } finally {
      setLoading(false);
    }
  }

  async function runAction(containerId: string, action: 'start' | 'stop' | 'restart' | 'kill') {
    const actionKey = `${containerId}:${action}`;
    setBusyAction(actionKey);
    setNotice({ tone: 'info', text: `正在执行 ${action}...` });
    try {
      await actionContainer(containerId, action);
      setNotice({ tone: 'success', text: `已执行 ${action}` });
      await refresh();
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : '容器操作失败' });
    } finally {
      setBusyAction(null);
    }
  }

  async function runRemove(containerId: string) {
    const actionKey = `${containerId}:remove`;
    setBusyAction(actionKey);
    setNotice({ tone: 'info', text: '正在删除容器...' });
    try {
      await removeContainer(containerId);
      setNotice({ tone: 'success', text: '容器已删除' });
      await refresh();
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : '删除失败' });
    } finally {
      setBusyAction(null);
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
          <h2>容器总览</h2>
          <p>{countText}</p>
        </div>
        <button type="button" className="btn btn-ghost" onClick={() => void refresh()} disabled={loading}>
          {loading ? '刷新中...' : '刷新'}
        </button>
      </div>

      {loading ? (
        <div className="loading-banner" role="status" aria-live="polite">
          <span className="spinner" aria-hidden="true" />
          <span>正在加载容器列表...</span>
        </div>
      ) : null}

      {notice ? (
        <p className={`notice notice-${notice.tone}`} role={notice.tone === 'error' ? 'alert' : undefined}>
          {notice.text}
        </p>
      ) : null}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>名称</th>
              <th>镜像</th>
              <th>状态</th>
              <th>CPU</th>
              <th>内存</th>
              <th>动作</th>
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: SKELETON_ROWS }).map((_, index) => (
                  <tr key={`skeleton-${index}`} className="skeleton-row" aria-hidden="true">
                    <td>
                      <span className="skeleton-line skeleton-short" />
                    </td>
                    <td>
                      <span className="skeleton-line" />
                    </td>
                    <td>
                      <span className="skeleton-pill" />
                    </td>
                    <td>
                      <span className="skeleton-line skeleton-short" />
                    </td>
                    <td>
                      <span className="skeleton-line" />
                    </td>
                    <td>
                      <span className="skeleton-line" />
                    </td>
                  </tr>
                ))
              : null}

            {!loading && containers.length === 0 ? (
              <tr>
                <td colSpan={6}>
                  <div className="empty-state">暂无容器数据</div>
                </td>
              </tr>
            ) : null}

            {!loading
              ? containers.map((item) => {
                  const rowBusy = Boolean(busyAction && busyAction.startsWith(`${item.id}:`));
                  return (
                    <tr key={item.id}>
                      <td>
                        <div className="cell-main">{item.name}</div>
                        <div className="cell-sub mono">{item.id.slice(0, 12)}</div>
                      </td>
                      <td className="mono">{item.image}</td>
                      <td>
                        <span className={`status status-${item.status}`}>{item.status}</span>
                        <div className="cell-sub">{item.state}</div>
                      </td>
                      <td>{item.stats ? `${item.stats.cpu_percent.toFixed(1)}%` : '-'}</td>
                      <td>
                        {item.stats
                          ? `${formatBytes(item.stats.memory_usage)} / ${formatBytes(item.stats.memory_limit)}`
                          : '-'}
                      </td>
                      <td>
                        <div className="row-actions">
                          <button
                            type="button"
                            className="btn btn-subtle btn-sm"
                            disabled={rowBusy}
                            onClick={() => void runAction(item.id, 'start')}
                            aria-label={`启动 ${item.name}`}
                          >
                            启动
                          </button>
                          <button
                            type="button"
                            className="btn btn-subtle btn-sm"
                            disabled={rowBusy}
                            onClick={() => void runAction(item.id, 'stop')}
                            aria-label={`停止 ${item.name}`}
                          >
                            停止
                          </button>
                          <button
                            type="button"
                            className="btn btn-subtle btn-sm"
                            disabled={rowBusy}
                            onClick={() => void runAction(item.id, 'restart')}
                            aria-label={`重启 ${item.name}`}
                          >
                            重启
                          </button>
                          <button
                            type="button"
                            className="btn btn-subtle btn-sm"
                            disabled={rowBusy}
                            onClick={() => void runAction(item.id, 'kill')}
                            aria-label={`强制终止 ${item.name}`}
                          >
                            Kill
                          </button>
                          <button
                            type="button"
                            className="btn btn-danger btn-sm"
                            disabled={rowBusy}
                            onClick={() => void runRemove(item.id)}
                            aria-label={`删除 ${item.name}`}
                          >
                            删除
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
