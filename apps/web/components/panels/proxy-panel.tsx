'use client';

import { FormEvent, useEffect, useState } from 'react';

import type { ProxyConfig, UpdateProxyPayload } from '@/lib/types';

interface ProxyPanelProps {
  loadProxy: () => Promise<ProxyConfig>;
  updateProxy: (payload: UpdateProxyPayload) => Promise<ProxyConfig>;
}

type NoticeTone = 'success' | 'error' | 'info';

interface Notice {
  tone: NoticeTone;
  text: string;
}

export function ProxyPanel({ loadProxy, updateProxy }: ProxyPanelProps) {
  const [proxyUrl, setProxyUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const result = await loadProxy();
      setProxyUrl(result.proxy_url ?? '');
      setNotice(null);
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : '代理配置加载失败' });
    } finally {
      setLoading(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setNotice({ tone: 'info', text: '正在保存代理配置...' });

    try {
      const payload: UpdateProxyPayload = {
        proxy_url: proxyUrl.trim() ? proxyUrl.trim() : null,
      };
      const result = await updateProxy(payload);
      setProxyUrl(result.proxy_url ?? '');
      setNotice({ tone: 'success', text: result.proxy_url ? '代理已更新' : '代理已清空' });
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : '代理配置保存失败' });
    } finally {
      setSaving(false);
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
          <h2>代理设置</h2>
          <p>配置后 GitHub/Gitee 拉取、仓库克隆和 URL 下载请求将统一走代理。</p>
        </div>
        <button type="button" className="btn btn-ghost" onClick={() => void refresh()} disabled={loading || saving}>
          {loading ? '刷新中...' : '刷新'}
        </button>
      </div>

      {loading ? (
        <div className="loading-banner" role="status" aria-live="polite">
          <span className="spinner" aria-hidden="true" />
          <span>正在加载代理配置...</span>
        </div>
      ) : null}

      {notice ? (
        <p className={`notice notice-${notice.tone}`} role={notice.tone === 'error' ? 'alert' : undefined}>
          {notice.text}
        </p>
      ) : null}

      <form className="form-grid form-grid-proxy" onSubmit={submit}>
        <label>
          代理服务器地址
          <input
            aria-label="代理服务器地址"
            value={proxyUrl}
            onChange={(event) => setProxyUrl(event.target.value)}
            placeholder="http://127.0.0.1:7890"
          />
        </label>
        <button type="submit" className="btn" disabled={loading || saving}>
          {saving ? '保存中...' : '保存代理配置'}
        </button>
      </form>

      <p className="muted">支持协议：`http`、`https`、`socks5`、`socks5h`。留空后保存可关闭代理。</p>
    </section>
  );
}
