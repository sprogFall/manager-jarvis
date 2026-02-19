'use client';

import { useEffect, useMemo, useState } from 'react';

import { formatBytes } from '@/lib/format';
import type { ContainerSummary } from '@/lib/types';

interface ContainerPanelProps {
  loadContainers: () => Promise<ContainerSummary[]>;
  actionContainer: (containerId: string, action: 'start' | 'stop' | 'restart' | 'kill') => Promise<void>;
  removeContainer: (containerId: string) => Promise<void>;
}

export function ContainerPanel({ loadContainers, actionContainer, removeContainer }: ContainerPanelProps) {
  const [containers, setContainers] = useState<ContainerSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  const countText = useMemo(() => `共 ${containers.length} 个容器`, [containers.length]);

  async function refresh() {
    setLoading(true);
    setMessage('');
    try {
      const next = await loadContainers();
      setContainers(next);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '容器列表加载失败');
    } finally {
      setLoading(false);
    }
  }

  async function runAction(containerId: string, action: 'start' | 'stop' | 'restart' | 'kill') {
    try {
      await actionContainer(containerId, action);
      setMessage(`已执行 ${action}`);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '容器操作失败');
    }
  }

  async function runRemove(containerId: string) {
    try {
      await removeContainer(containerId);
      setMessage('容器已删除');
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '删除失败');
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
        <button type="button" className="ghost" onClick={() => void refresh()}>
          刷新
        </button>
      </div>

      {message ? <p className="message">{message}</p> : null}
      {loading ? <p className="muted">加载中...</p> : null}

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
            {containers.map((item) => (
              <tr key={item.id}>
                <td>{item.name}</td>
                <td>{item.image}</td>
                <td>
                  <span className={`status status-${item.status}`}>{item.status}</span>
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
                      onClick={() => void runAction(item.id, 'start')}
                      aria-label={`启动 ${item.name}`}
                    >
                      启动
                    </button>
                    <button
                      type="button"
                      onClick={() => void runAction(item.id, 'stop')}
                      aria-label={`停止 ${item.name}`}
                    >
                      停止
                    </button>
                    <button
                      type="button"
                      onClick={() => void runAction(item.id, 'restart')}
                      aria-label={`重启 ${item.name}`}
                    >
                      重启
                    </button>
                    <button
                      type="button"
                      onClick={() => void runAction(item.id, 'kill')}
                      aria-label={`强制终止 ${item.name}`}
                    >
                      Kill
                    </button>
                    <button type="button" onClick={() => void runRemove(item.id)} aria-label={`删除 ${item.name}`}>
                      删除
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
