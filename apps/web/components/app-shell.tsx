'use client';

import { useMemo, useState } from 'react';

import { AuditPanel } from '@/components/panels/audit-panel';
import { ContainerPanel } from '@/components/panels/container-panel';
import { ImagePanel } from '@/components/panels/image-panel';
import { StackPanel } from '@/components/panels/stack-panel';
import { TaskPanel } from '@/components/panels/task-panel';
import { ApiClient } from '@/lib/api';

const SECTION_LABELS = {
  containers: '容器',
  images: '镜像',
  stacks: '栈',
  tasks: '任务',
  audit: '审计',
} as const;

type Section = keyof typeof SECTION_LABELS;

interface AppShellProps {
  client?: ApiClient;
  onLogout?: () => void;
}

const noClient = {
  getContainers: async () => [],
  actionContainer: async () => undefined,
  removeContainer: async () => undefined,
  getImages: async () => [],
  pullImage: async () => ({ task_id: 'task-demo' }),
  deleteImage: async () => undefined,
  gitClone: async () => ({ task_id: 'task-demo' }),
  getWorkspace: async () => ({ workspace_id: '', dockerfiles: [], directories: [] }),
  buildFromWorkspace: async () => ({ task_id: 'task-demo' }),
  deleteWorkspace: async () => undefined,
  loadFromUrl: async () => ({ task_id: 'task-demo' }),
  getStacks: async () => [],
  runStackAction: async () => ({ task_id: 'task-demo' }),
  getTasks: async () => [],
  getAuditLogs: async () => [],
};

export function AppShell({ client, onLogout }: AppShellProps) {
  const [section, setSection] = useState<Section>('containers');
  const [mobileOpen, setMobileOpen] = useState(false);
  const api = client ?? noClient;

  const sectionTitle = useMemo(() => {
    switch (section) {
      case 'containers':
        return '容器总览';
      case 'images':
        return '镜像管理';
      case 'stacks':
        return 'Compose 栈';
      case 'tasks':
        return '任务中心';
      case 'audit':
        return '审计日志';
      default:
        return '';
    }
  }, [section]);

  function renderSection() {
    if (section === 'containers') {
      return (
        <ContainerPanel
          loadContainers={() => api.getContainers()}
          actionContainer={(id, action) => api.actionContainer(id, action)}
          removeContainer={(id) => api.removeContainer(id)}
        />
      );
    }
    if (section === 'images') {
      return (
        <ImagePanel
          loadImages={() => api.getImages()}
          pullImage={(payload) => api.pullImage(payload)}
          deleteImage={(image) => api.deleteImage(image)}
          gitClone={(payload) => api.gitClone(payload)}
          getWorkspace={(id) => api.getWorkspace(id)}
          buildFromWorkspace={(id, payload) => api.buildFromWorkspace(id, payload)}
          deleteWorkspace={(id) => api.deleteWorkspace(id)}
          loadFromUrl={(payload) => api.loadFromUrl(payload)}
        />
      );
    }
    if (section === 'stacks') {
      return <StackPanel loadStacks={() => api.getStacks()} runStackAction={(name, action) => api.runStackAction(name, action)} />;
    }
    if (section === 'tasks') {
      return <TaskPanel loadTasks={() => api.getTasks()} />;
    }
    return <AuditPanel loadAuditLogs={() => api.getAuditLogs()} />;
  }

  return (
    <div className="shell">
      <aside className={`sidebar ${mobileOpen ? 'open' : ''}`}>
        <div className="brand">
          <h1>Jarvis</h1>
          <p>Host Docker Console</p>
        </div>

        <nav>
          {(Object.keys(SECTION_LABELS) as Section[]).map((item) => (
            <button
              key={item}
              type="button"
              className={item === section ? 'active' : ''}
              onClick={() => {
                setSection(item);
                setMobileOpen(false);
              }}
              aria-label={SECTION_LABELS[item]}
            >
              {SECTION_LABELS[item]}
            </button>
          ))}
        </nav>

        {onLogout ? (
          <button type="button" className="logout" onClick={onLogout}>
            退出登录
          </button>
        ) : null}
      </aside>

      <main className="content">
        <header className="topbar">
          <button type="button" className="ghost mobile-menu" aria-label="打开导航" onClick={() => setMobileOpen((prev) => !prev)}>
            菜单
          </button>
          <h2>{sectionTitle}</h2>
        </header>

        <div className="content-body">{renderSection()}</div>
      </main>
    </div>
  );
}
