'use client';

import { useEffect, useState } from 'react';

import { formatTime } from '@/lib/format';
import type { AuditLogRecord } from '@/lib/types';

interface AuditPanelProps {
  loadAuditLogs: () => Promise<AuditLogRecord[]>;
}

export function AuditPanel({ loadAuditLogs }: AuditPanelProps) {
  const [records, setRecords] = useState<AuditLogRecord[]>([]);

  async function refresh() {
    setRecords(await loadAuditLogs());
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>审计日志</h2>
          <p>记录关键操作与执行结果</p>
        </div>
        <button type="button" className="ghost" onClick={() => void refresh()}>
          刷新
        </button>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>时间</th>
              <th>用户</th>
              <th>动作</th>
              <th>资源</th>
              <th>状态</th>
            </tr>
          </thead>
          <tbody>
            {records.map((record) => (
              <tr key={record.id}>
                <td>{formatTime(record.created_at)}</td>
                <td>{record.username ?? '-'}</td>
                <td>{record.action}</td>
                <td>{record.resource_id ?? '-'}</td>
                <td>{record.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
