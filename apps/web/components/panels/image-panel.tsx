'use client';

import { FormEvent, useEffect, useState } from 'react';

import { formatBytes } from '@/lib/format';
import type { ImageSummary, PullImagePayload, TaskResponse } from '@/lib/types';

interface ImagePanelProps {
  loadImages: () => Promise<ImageSummary[]>;
  pullImage: (payload: PullImagePayload) => Promise<TaskResponse>;
  deleteImage: (image: string) => Promise<void>;
}

export function ImagePanel({ loadImages, pullImage, deleteImage }: ImagePanelProps) {
  const [images, setImages] = useState<ImageSummary[]>([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ image: '', tag: '' });

  async function refresh() {
    setLoading(true);
    setMessage('');
    try {
      setImages(await loadImages());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '镜像列表加载失败');
    } finally {
      setLoading(false);
    }
  }

  async function submitPull(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.image.trim()) {
      setMessage('请输入镜像名');
      return;
    }

    try {
      const result = await pullImage({ image: form.image.trim(), tag: form.tag.trim() || undefined });
      setMessage(`拉取任务已创建：${result.task_id}`);
      setForm({ image: '', tag: '' });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '拉取镜像失败');
    }
  }

  async function runDelete(image: string) {
    try {
      await deleteImage(image);
      setMessage('镜像已删除');
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '删除镜像失败');
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
          <h2>镜像管理</h2>
          <p>支持拉取、删除与任务跟踪</p>
        </div>
        <button type="button" className="ghost" onClick={() => void refresh()}>
          刷新
        </button>
      </div>

      <form className="inline-form" onSubmit={submitPull}>
        <label>
          镜像名
          <input
            aria-label="镜像名"
            value={form.image}
            onChange={(event) => setForm((prev) => ({ ...prev, image: event.target.value }))}
            placeholder="nginx"
          />
        </label>
        <label>
          Tag
          <input
            aria-label="Tag"
            value={form.tag}
            onChange={(event) => setForm((prev) => ({ ...prev, tag: event.target.value }))}
            placeholder="latest"
          />
        </label>
        <button type="submit">拉取镜像</button>
      </form>

      {message ? <p className="message">{message}</p> : null}
      {loading ? <p className="muted">加载中...</p> : null}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Tag</th>
              <th>镜像 ID</th>
              <th>体积</th>
              <th>动作</th>
            </tr>
          </thead>
          <tbody>
            {images.map((item) => (
              <tr key={item.id}>
                <td>{item.tags.join(', ') || '<none>'}</td>
                <td className="mono">{item.id.slice(0, 18)}</td>
                <td>{formatBytes(item.size)}</td>
                <td>
                  <button type="button" onClick={() => void runDelete(item.tags[0] || item.id)}>
                    删除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
