'use client';

import { useEffect, useState } from 'react';

import type { StackSummary, TaskResponse } from '@/lib/types';

interface StackPanelProps {
  loadStacks: () => Promise<StackSummary[]>;
  runStackAction: (name: string, action: 'up' | 'down' | 'restart' | 'pull') => Promise<TaskResponse>;
}

type NoticeTone = 'success' | 'error' | 'info';

interface Notice {
  tone: NoticeTone;
  text: string;
}

export function StackPanel({ loadStacks, runStackAction }: StackPanelProps) {
  const [stacks, setStacks] = useState<StackSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      setStacks(await loadStacks());
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : '栈加载失败' });
    } finally {
      setLoading(false);
    }
  }

  async function runAction(name: string, action: 'up' | 'down' | 'restart' | 'pull') {
    setWorking(true);
    setNotice({ tone: 'info', text: `正在执行 ${name} -> ${action}...` });
    try {
      const result = await runStackAction(name, action);
      setNotice({ tone: 'success', text: `任务已创建：${result.task_id}` });
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : '栈操作失败' });
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
          <h2>Compose 栈</h2>
          <p>扫描 stacks 目录并执行 up/down/restart/pull</p>
        </div>
        <button type="button" className="btn btn-ghost" onClick={() => void refresh()} disabled={loading || working}>
          {loading ? '刷新中...' : '刷新'}
        </button>
      </div>

      {loading ? (
        <div className="loading-banner" role="status" aria-live="polite">
          <span className="spinner" aria-hidden="true" />
          <span>正在加载栈列表...</span>
        </div>
      ) : null}

      {notice ? (
        <p className={`notice notice-${notice.tone}`} role={notice.tone === 'error' ? 'alert' : undefined}>
          {notice.text}
        </p>
      ) : null}

      <div className="stack-grid">
        {loading
          ? Array.from({ length: 4 }).map((_, index) => (
              <article key={`stack-skeleton-${index}`} className="stack-card" aria-hidden="true">
                <span className="skeleton-line skeleton-short" />
                <span className="skeleton-line" />
                <span className="skeleton-line skeleton-short" />
                <span className="skeleton-line" />
              </article>
            ))
          : null}

        {!loading && stacks.length === 0 ? <div className="empty-state">未发现可用 Compose 栈</div> : null}

        {!loading
          ? stacks.map((stack) => (
              <article key={stack.name} className="stack-card">
                <h3>{stack.name}</h3>
                <p className="muted mono">{stack.compose_file}</p>
                <p className="muted">服务数：{stack.services.length}</p>
                <div className="row-actions">
                  <button
                    type="button"
                    className="btn btn-subtle btn-sm"
                    onClick={() => void runAction(stack.name, 'up')}
                    aria-label={`启动 ${stack.name}`}
                    disabled={working}
                  >
                    启动
                  </button>
                  <button
                    type="button"
                    className="btn btn-subtle btn-sm"
                    onClick={() => void runAction(stack.name, 'down')}
                    disabled={working}
                  >
                    停止
                  </button>
                  <button
                    type="button"
                    className="btn btn-subtle btn-sm"
                    onClick={() => void runAction(stack.name, 'restart')}
                    disabled={working}
                  >
                    重启
                  </button>
                  <button
                    type="button"
                    className="btn btn-subtle btn-sm"
                    onClick={() => void runAction(stack.name, 'pull')}
                    disabled={working}
                  >
                    拉取
                  </button>
                </div>
              </article>
            ))
          : null}
      </div>
    </section>
  );
}
