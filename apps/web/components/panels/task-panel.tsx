'use client';

import { useEffect, useState } from 'react';

import { formatTime } from '@/lib/format';
import type { TaskRecord } from '@/lib/types';

interface TaskPanelProps {
  loadTasks: () => Promise<TaskRecord[]>;
}

export function TaskPanel({ loadTasks }: TaskPanelProps) {
  const [tasks, setTasks] = useState<TaskRecord[]>([]);

  async function refresh() {
    setTasks(await loadTasks());
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
        <button type="button" className="ghost" onClick={() => void refresh()}>
          刷新
        </button>
      </div>

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
            {tasks.map((task) => (
              <tr key={task.id}>
                <td className="mono">{task.id}</td>
                <td>{task.task_type}</td>
                <td>{task.status}</td>
                <td>{task.resource_id ?? '-'}</td>
                <td>{formatTime(task.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
