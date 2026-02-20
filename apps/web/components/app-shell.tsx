'use client';

import { useEffect, useState } from 'react';

import { AuditPanel } from '@/components/panels/audit-panel';
import { ContainerPanel } from '@/components/panels/container-panel';
import { ImagePanel } from '@/components/panels/image-panel';
import { ProxyPanel } from '@/components/panels/proxy-panel';
import { StackPanel } from '@/components/panels/stack-panel';
import { TaskPanel } from '@/components/panels/task-panel';
import { ApiClient } from '@/lib/api';

const SECTION_META = {
  containers: {
    label: '容器',
    title: '容器总览',
    description: '查看运行状态、资源占用并执行启停和重启操作。',
  },
  images: {
    label: '镜像',
    title: '镜像管理',
    description: '统一处理拉取、删除、Git 构建与离线加载。',
  },
  stacks: {
    label: '栈',
    title: 'Compose 栈',
    description: '管理 Compose 栈并触发 up/down/restart/pull。',
  },
  tasks: {
    label: '任务',
    title: '任务中心',
    description: '追踪异步任务状态，快速定位失败和耗时步骤。',
  },
  audit: {
    label: '审计',
    title: '审计日志',
    description: '审阅关键操作轨迹，确认资源和执行结果。',
  },
  proxy: {
    label: '网络',
    title: '代理设置',
    description: '配置外网代理，统一处理 GitHub/Gitee 访问请求。',
  },
} as const;

type Section = keyof typeof SECTION_META;

interface AppShellProps {
  client?: ApiClient;
  onLogout?: () => void;
}

const noClient = {
  getContainers: async () => [],
  getContainerDetail: async () => ({
    id: '',
    name: '',
    image: '',
    status: 'unknown',
    state: 'unknown',
    command: '',
    created: '',
    env: [],
    mounts: [],
    networks: {},
    ports: {},
  }),
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
  getProxyConfig: async () => ({ proxy_url: null }),
  updateProxyConfig: async () => ({ proxy_url: null }),
};

export function AppShell({ client, onLogout }: AppShellProps) {
  const [section, setSection] = useState<Section>('containers');
  const [mobileOpen, setMobileOpen] = useState(false);
  const api = client ?? noClient;

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }
    const media = window.matchMedia('(max-width: 960px)');
    const handleChange = (event: MediaQueryListEvent) => {
      if (!event.matches) {
        setMobileOpen(false);
      }
    };
    if (!media.matches) {
      setMobileOpen(false);
    }
    media.addEventListener('change', handleChange);
    return () => {
      media.removeEventListener('change', handleChange);
    };
  }, []);

  function switchSection(next: Section) {
    setSection(next);
    setMobileOpen(false);
  }

  function renderSection() {
    if (section === 'containers') {
      return (
        <ContainerPanel
          loadContainers={() => api.getContainers()}
          loadContainerDetail={(id) => api.getContainerDetail(id)}
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
    if (section === 'proxy') {
      return <ProxyPanel loadProxy={() => api.getProxyConfig()} updateProxy={(payload) => api.updateProxyConfig(payload)} />;
    }
    return <AuditPanel loadAuditLogs={() => api.getAuditLogs()} />;
  }

  const currentSection = SECTION_META[section];
  const sections = Object.keys(SECTION_META) as Section[];

  return (
    <div className="shell">
      {mobileOpen ? (
        <button
          type="button"
          className="sidebar-backdrop"
          aria-label="关闭导航"
          onClick={() => setMobileOpen(false)}
        />
      ) : null}

      <aside className={`sidebar ${mobileOpen ? 'open' : ''}`} aria-label="侧边导航">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            MJ
          </div>
          <div>
            <h1>Manager Jarvis</h1>
            <p>Docker 运维控制台</p>
          </div>
        </div>

        <nav>
          {sections.map((item) => (
            <button
              key={item}
              type="button"
              className={`nav-item ${item === section ? 'active' : ''}`}
              onClick={() => switchSection(item)}
              aria-label={SECTION_META[item].label}
              aria-current={item === section ? 'page' : undefined}
            >
              <span>{SECTION_META[item].label}</span>
              <small>{SECTION_META[item].title}</small>
            </button>
          ))}
        </nav>

        {onLogout ? (
          <button type="button" className="btn btn-danger logout" onClick={onLogout}>
            退出登录
          </button>
        ) : null}
      </aside>

      <main className="content">
        <header className="topbar">
          <div className="topbar-main">
            <button
              type="button"
              className="btn btn-ghost mobile-menu"
              aria-label="打开导航"
              onClick={() => setMobileOpen((prev) => !prev)}
            >
              菜单
            </button>
            <div>
              <p className="topbar-kicker">{currentSection.label}</p>
              <h2>{currentSection.title}</h2>
              <p className="muted">{currentSection.description}</p>
            </div>
          </div>
          <span className="topbar-chip">实时管理</span>
        </header>

        <div className="content-body">{renderSection()}</div>
      </main>
    </div>
  );
}
