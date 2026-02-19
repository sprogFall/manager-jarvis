'use client';

import { useEffect, useState } from 'react';

import type { StackSummary, TaskResponse } from '@/lib/types';

interface StackPanelProps {
  loadStacks: () => Promise<StackSummary[]>;
  runStackAction: (name: string, action: 'up' | 'down' | 'restart' | 'pull') => Promise<TaskResponse>;
}

export function StackPanel({ loadStacks, runStackAction }: StackPanelProps) {
  const [stacks, setStacks] = useState<StackSummary[]>([]);
  const [message, setMessage] = useState('');

  async function refresh() {
    try {
      setStacks(await loadStacks());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '栈加载失败');
    }
  }

  async function runAction(name: string, action: 'up' | 'down' | 'restart' | 'pull') {
    try {
      const result = await runStackAction(name, action);
      setMessage(`任务已创建：${result.task_id}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '栈操作失败');
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
        <button type="button" className="ghost" onClick={() => void refresh()}>
          刷新
        </button>
      </div>

      {message ? <p className="message">{message}</p> : null}

      <div className="stack-grid">
        {stacks.map((stack) => (
          <article key={stack.name} className="stack-card">
            <h3>{stack.name}</h3>
            <p className="muted mono">{stack.compose_file}</p>
            <p className="muted">服务数：{stack.services.length}</p>
            <div className="row-actions">
              <button type="button" onClick={() => void runAction(stack.name, 'up')} aria-label={`启动 ${stack.name}`}>
                启动
              </button>
              <button type="button" onClick={() => void runAction(stack.name, 'down')}>
                停止
              </button>
              <button type="button" onClick={() => void runAction(stack.name, 'restart')}>
                重启
              </button>
              <button type="button" onClick={() => void runAction(stack.name, 'pull')}>
                拉取
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
