'use client';

import { useEffect, useMemo, useState } from 'react';

import { formatBytes, formatPorts, formatStatus, formatTime } from '@/lib/format';
import type { ContainerDetail, ContainerSummary } from '@/lib/types';

interface ContainerPanelProps {
  loadContainers: () => Promise<ContainerSummary[]>;
  loadContainerDetail: (containerId: string) => Promise<ContainerDetail>;
  actionContainer: (containerId: string, action: 'start' | 'stop' | 'restart' | 'kill') => Promise<void>;
  removeContainer: (containerId: string) => Promise<void>;
}

type NoticeTone = 'success' | 'error' | 'info';

interface Notice {
  tone: NoticeTone;
  text: string;
}

const SKELETON_ROWS = 4;

function formatDetailPorts(ports: Record<string, unknown>): string {
  const entries = Object.entries(ports);
  if (entries.length === 0) return '-';
  const lines: string[] = [];
  for (const [containerPort, bindings] of entries) {
    if (!Array.isArray(bindings) || bindings.length === 0) {
      lines.push(containerPort);
      continue;
    }
    for (const bind of bindings) {
      const hostPort = (bind as Record<string, string>).HostPort ?? '';
      lines.push(`宿主机 ${hostPort} → 容器 ${containerPort}`);
    }
  }
  return lines.join('\n');
}

function formatDetailMounts(mounts: Array<Record<string, unknown>>): string {
  if (mounts.length === 0) return '-';
  return mounts.map((m) => `${m.Source ?? '-'} → ${m.Destination ?? '-'}`).join('\n');
}

function formatDetailNetworks(networks: Record<string, unknown>): string {
  const entries = Object.entries(networks);
  if (entries.length === 0) return '-';
  return entries
    .map(([name, cfg]) => `${name}: ${(cfg as Record<string, string>)?.IPAddress ?? '-'}`)
    .join('\n');
}

function formatDetailText(value: unknown): string {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'string') return value.trim() || '-';
  if (Array.isArray(value)) {
    if (value.length === 0) return '-';
    return value.map((item) => (typeof item === 'string' ? item : JSON.stringify(item))).join('\n');
  }
  if (typeof value === 'object') {
    if (Object.keys(value as Record<string, unknown>).length === 0) return '-';
    return JSON.stringify(value, null, 2);
  }
  return String(value);
}

export function ContainerPanel({ loadContainers, loadContainerDetail, actionContainer, removeContainer }: ContainerPanelProps) {
  const [containers, setContainers] = useState<ContainerSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [detailLoadingId, setDetailLoadingId] = useState<string | null>(null);
  const [selectedDetailId, setSelectedDetailId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ContainerDetail | null>(null);

  const countText = useMemo(() => `共 ${containers.length} 个容器`, [containers.length]);

  async function refresh() {
    setLoading(true);
    try {
      const next = await loadContainers();
      setContainers(next);
      if (selectedDetailId && !next.some((item) => item.id === selectedDetailId)) {
        setSelectedDetailId(null);
        setDetail(null);
      }
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

  async function runLoadDetail(containerId: string) {
    if (selectedDetailId === containerId && detail) {
      setSelectedDetailId(null);
      setDetail(null);
      return;
    }

    setDetailLoadingId(containerId);
    setNotice({ tone: 'info', text: '正在加载容器详情...' });
    try {
      const next = await loadContainerDetail(containerId);
      setSelectedDetailId(containerId);
      setDetail(next);
      setNotice(null);
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : '容器详情加载失败' });
    } finally {
      setDetailLoadingId(null);
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
              <th>端口</th>
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
                <td colSpan={5}>
                  <div className="empty-state">暂无容器数据</div>
                </td>
              </tr>
            ) : null}

            {!loading
              ? containers.map((item) => {
                  const rowBusy = Boolean(busyAction && busyAction.startsWith(`${item.id}:`));
                  const detailBusy = detailLoadingId === item.id;
                  const opened = selectedDetailId === item.id;
                  return (
                    <tr key={item.id}>
                      <td data-label="名称">
                        <div className="cell-main">{item.name}</div>
                        <div className="cell-sub mono">{item.id.slice(0, 12)}</div>
                      </td>
                      <td data-label="镜像" className="mono cell-break">
                        {item.image}
                      </td>
                      <td data-label="状态">
                        <span className={`status status-${item.status}`}>{formatStatus(item.status)}</span>
                        <div className="cell-sub">{item.state}</div>
                        {item.stats ? (
                          <div className="cell-sub">
                            CPU {item.stats.cpu_percent.toFixed(1)}% | 内存 {formatBytes(item.stats.memory_usage)}
                          </div>
                        ) : null}
                      </td>
                      <td data-label="端口" className="mono cell-break">
                        {item.ports.length > 0 ? item.ports.map(formatPorts).join(', ') : '-'}
                      </td>
                      <td data-label="动作">
                        <div className="row-actions">
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            disabled={rowBusy || detailBusy}
                            onClick={() => void runLoadDetail(item.id)}
                            aria-label={`查看 ${item.name} 详情`}
                          >
                            {detailBusy ? '加载中...' : opened ? '收起详情' : '详情'}
                          </button>
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
                            强杀
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

      {detail ? (
        <section className="detail-panel" aria-live="polite">
          <div className="detail-panel-head">
            <div>
              <h3>容器详情</h3>
              <p className="muted">为保证列表速度，详情字段按需单独加载。</p>
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setSelectedDetailId(null);
                setDetail(null);
              }}
            >
              关闭
            </button>
          </div>

          <div className="detail-grid">
            <div>
              <span>名称</span>
              <strong>{detail.name}</strong>
            </div>
            <div>
              <span>镜像</span>
              <strong className="mono">{detail.image}</strong>
            </div>
            <div>
              <span>状态</span>
              <strong>{formatStatus(detail.state)}</strong>
            </div>
            <div>
              <span>创建时间</span>
              <strong>{formatTime(detail.created)}</strong>
            </div>
          </div>

          {detail.stats ? (
            <div className="detail-grid">
              <div>
                <span>CPU</span>
                <strong>{detail.stats.cpu_percent.toFixed(1)}%</strong>
              </div>
              <div>
                <span>内存使用</span>
                <strong>{formatBytes(detail.stats.memory_usage)} / {formatBytes(detail.stats.memory_limit)}</strong>
              </div>
              <div>
                <span>内存占比</span>
                <strong>{detail.stats.memory_percent.toFixed(1)}%</strong>
              </div>
            </div>
          ) : null}

          <div className="detail-block">
            <h4>启动命令</h4>
            <pre className="detail-pre mono">{formatDetailText(detail.command)}</pre>
          </div>

          <div className="detail-block">
            <h4>环境变量</h4>
            <pre className="detail-pre mono">{formatDetailText(detail.env)}</pre>
          </div>

          <div className="detail-block">
            <h4>端口映射</h4>
            <pre className="detail-pre mono">{formatDetailPorts(detail.ports)}</pre>
          </div>

          <div className="detail-block">
            <h4>挂载</h4>
            <pre className="detail-pre mono">{formatDetailMounts(detail.mounts)}</pre>
          </div>

          <div className="detail-block">
            <h4>网络配置</h4>
            <pre className="detail-pre mono">{formatDetailNetworks(detail.networks)}</pre>
          </div>
        </section>
      ) : null}
    </section>
  );
}
