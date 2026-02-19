'use client';

import { useEffect, useState } from 'react';

import { formatTime } from '@/lib/format';
import type { AuditLogRecord } from '@/lib/types';

interface AuditPanelProps {
  loadAuditLogs: () => Promise<AuditLogRecord[]>;
}

interface Notice {
  tone: 'error';
  text: string;
}

export function AuditPanel({ loadAuditLogs }: AuditPanelProps) {
  const [records, setRecords] = useState<AuditLogRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<Notice | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      setRecords(await loadAuditLogs());
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : '审计日志加载失败' });
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
          <h2>审计日志</h2>
          <p>记录关键操作与执行结果</p>
        </div>
        <button type="button" className="btn btn-ghost" onClick={() => void refresh()} disabled={loading}>
          {loading ? '刷新中...' : '刷新'}
        </button>
      </div>

      {loading ? (
        <div className="loading-banner" role="status" aria-live="polite">
          <span className="spinner" aria-hidden="true" />
          <span>正在加载审计日志...</span>
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
              <th>时间</th>
              <th>用户</th>
              <th>动作</th>
              <th>资源</th>
              <th>状态</th>
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 5 }).map((_, index) => (
                  <tr key={`audit-skeleton-${index}`} className="skeleton-row" aria-hidden="true">
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
                      <span className="skeleton-pill" />
                    </td>
                  </tr>
                ))
              : null}

            {!loading && records.length === 0 ? (
              <tr>
                <td colSpan={5}>
                  <div className="empty-state">暂无审计日志</div>
                </td>
              </tr>
            ) : null}

            {!loading
              ? records.map((record) => (
                  <tr key={record.id}>
                    <td data-label="时间">{formatTime(record.created_at)}</td>
                    <td data-label="用户">{record.username ?? '-'}</td>
                    <td data-label="动作">{record.action}</td>
                    <td data-label="资源">{record.resource_id ?? '-'}</td>
                    <td data-label="状态">
                      <span className={`status status-${record.status}`}>{record.status}</span>
                    </td>
                  </tr>
                ))
              : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
