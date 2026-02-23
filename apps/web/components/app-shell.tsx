'use client';

import { useEffect, useState } from 'react';

import { AuditPanel } from '@/components/panels/audit-panel';
import { ContainerPanel } from '@/components/panels/container-panel';
import { ImagePanel } from '@/components/panels/image-panel';
import { ProxyPanel } from '@/components/panels/proxy-panel';
import { StackPanel } from '@/components/panels/stack-panel';
import { TaskPanel } from '@/components/panels/task-panel';
import { WorkspacePanel } from '@/components/panels/workspace-panel';
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
  workspaces: {
    label: '工作区',
    title: 'Git 工作区',
    description: '管理已克隆代码，继续 Compose/Sync/Build。',
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

function IconContainer() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="14" height="14" rx="2" />
      <path d="M3 8h14" />
    </svg>
  );
}

function IconImage() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="14" height="3" rx="1" />
      <rect x="3" y="9" width="14" height="3" rx="1" />
      <rect x="3" y="13" width="14" height="3" rx="1" />
    </svg>
  );
}

function IconStack() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 13l7 4 7-4" />
      <path d="M3 9l7 4 7-4" />
      <path d="M3 5l7 4 7-4-7-4z" />
    </svg>
  );
}

function IconWorkspace() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6.5h6l1 1H17v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <path d="M3 6.5v-1a2 2 0 0 1 2-2h3l1 1h6a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function IconTask() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="10" cy="10" r="7" />
      <path d="M10 6v4l3 2" />
    </svg>
  );
}

function IconAudit() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 3h8a2 2 0 012 2v10a2 2 0 01-2 2H6a2 2 0 01-2-2V5a2 2 0 012-2z" />
      <path d="M7 7h6M7 10h6M7 13h3" />
    </svg>
  );
}

function IconProxy() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="10" cy="10" r="7" />
      <path d="M3 10h14" />
      <ellipse cx="10" cy="10" rx="3" ry="7" />
    </svg>
  );
}

function IconLogout() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3H6a2 2 0 00-2 2v10a2 2 0 002 2h6" />
      <path d="M10 10h7m0 0l-3-3m3 3l-3 3" />
    </svg>
  );
}

function IconMenu() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M4 6h12M4 10h12M4 14h12" />
    </svg>
  );
}

function IconMore() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="10" cy="5" r="1.2" fill="currentColor" />
      <circle cx="10" cy="10" r="1.2" fill="currentColor" />
      <circle cx="10" cy="15" r="1.2" fill="currentColor" />
    </svg>
  );
}

const SECTION_ICONS: Record<Section, () => React.JSX.Element> = {
  containers: IconContainer,
  images: IconImage,
  workspaces: IconWorkspace,
  stacks: IconStack,
  tasks: IconTask,
  audit: IconAudit,
  proxy: IconProxy,
};

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
    stats: null,
  }),
  actionContainer: async () => undefined,
  removeContainer: async () => undefined,
  getImages: async () => [],
  pullImage: async () => ({ task_id: 'task-demo' }),
  deleteImage: async () => undefined,
  gitClone: async () => ({ task_id: 'task-demo' }),
  getTask: async () => ({
    id: 'task-demo',
    task_type: 'image.git.clone',
    status: 'queued',
    resource_type: 'image',
    resource_id: null,
    params: null,
    result: null,
    error: null,
    retry_of: null,
    created_by: null,
    created_at: null,
    started_at: null,
    finished_at: null,
  }),
  getWorkspace: async () => ({ workspace_id: '', dockerfiles: [], directories: [], compose_files: [] }),
  getWorkspaces: async () => [],
  getWorkspaceCompose: async () => ({
    workspace_id: '',
    compose_files: [],
    selected_compose: 'compose.yaml',
    source: 'repository' as const,
    custom_exists: false,
    project_name: 'ws-demo',
    content: '',
    build_services: [],
  }),
  saveWorkspaceCompose: async () => ({ workspace_id: '', compose_path: 'compose.yaml', custom_compose_path: '' }),
  clearWorkspaceCompose: async () => ({ workspace_id: '', compose_path: 'compose.yaml', deleted: false }),
  runWorkspaceComposeAction: async () => ({ task_id: 'task-demo' }),
  syncWorkspace: async () => ({ task_id: 'task-demo' }),
  buildFromWorkspace: async () => ({ task_id: 'task-demo' }),
  deleteWorkspace: async () => undefined,
  getWorkspaceEnv: async () => ({
    workspace_id: '',
    env_templates: [],
    selected_template: null,
    target_path: null,
    custom_exists: false,
    template_content: '',
    template_variables: [],
    custom_content: '',
    custom_variables: [],
  }),
  saveWorkspaceEnv: async () => ({ workspace_id: '', template_path: '', target_path: '' }),
  clearWorkspaceEnv: async () => ({ deleted: false }),
  saveWorkspaceProjectName: async () => ({ workspace_id: '', compose_path: '', project_name: '' }),
  saveWorkspaceImageTags: async () => ({ workspace_id: '', compose_path: '', custom_compose_path: '' }),
  loadFromUrl: async () => ({ task_id: 'task-demo' }),
  getStacks: async () => [],
  runStackAction: async () => ({ task_id: 'task-demo' }),
  getTasks: async () => [],
  getTaskLogs: async () => '',
  retryTask: async () => ({ original_task_id: 'task-demo', new_task_id: 'task-demo-2' }),
  downloadTaskFile: async () => ({ filename: 'task-demo.txt', blob: new Blob(['demo']) }),
  getAuditLogs: async () => [],
  getProxyConfig: async () => ({ proxy_url: null }),
  updateProxyConfig: async () => ({ proxy_url: null }),
};

const TAB_SECTIONS: Section[] = ['containers', 'images', 'stacks', 'tasks'];
const MORE_SECTIONS: Section[] = ['workspaces', 'audit', 'proxy'];

export function AppShell({ client, onLogout }: AppShellProps) {
  const [section, setSection] = useState<Section>('containers');
  const [mobileOpen, setMobileOpen] = useState(false);
  const api = client ?? noClient;

  function closeMobileNav() {
    setMobileOpen(false);
  }

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }
    const media = window.matchMedia('(max-width: 768px)');
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

  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }
    if (mobileOpen) {
      document.body.classList.add('mobile-nav-open');
    } else {
      document.body.classList.remove('mobile-nav-open');
    }
    return () => {
      document.body.classList.remove('mobile-nav-open');
    };
  }, [mobileOpen]);

  function switchSection(next: Section) {
    setSection(next);
    closeMobileNav();
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
          getTask={(taskId) => api.getTask(taskId)}
          getWorkspace={(id) => api.getWorkspace(id)}
          getWorkspaceCompose={(id, composePath, source) => api.getWorkspaceCompose(id, composePath, source)}
          saveWorkspaceCompose={(id, payload) => api.saveWorkspaceCompose(id, payload)}
          clearWorkspaceCompose={(id, composePath) => api.clearWorkspaceCompose(id, composePath)}
          runWorkspaceComposeAction={(id, action, payload) => api.runWorkspaceComposeAction(id, action, payload)}
          syncWorkspace={(id) => api.syncWorkspace(id)}
          buildFromWorkspace={(id, payload) => api.buildFromWorkspace(id, payload)}
          deleteWorkspace={(id) => api.deleteWorkspace(id)}
          loadFromUrl={(payload) => api.loadFromUrl(payload)}
        />
      );
    }
    if (section === 'workspaces') {
      return (
        <WorkspacePanel
          loadWorkspaces={() => api.getWorkspaces()}
          gitClone={(payload) => api.gitClone(payload)}
          getTask={(taskId) => api.getTask(taskId)}
          getWorkspace={(id) => api.getWorkspace(id)}
          getWorkspaceCompose={(id, composePath, source) => api.getWorkspaceCompose(id, composePath, source)}
          saveWorkspaceCompose={(id, payload) => api.saveWorkspaceCompose(id, payload)}
          clearWorkspaceCompose={(id, composePath) => api.clearWorkspaceCompose(id, composePath)}
          runWorkspaceComposeAction={(id, action, payload) => api.runWorkspaceComposeAction(id, action, payload)}
          syncWorkspace={(id) => api.syncWorkspace(id)}
          buildFromWorkspace={(id, payload) => api.buildFromWorkspace(id, payload)}
          deleteWorkspace={(id) => api.deleteWorkspace(id)}
          getWorkspaceEnv={(id, templatePath) => api.getWorkspaceEnv(id, templatePath)}
          saveWorkspaceEnv={(id, payload) => api.saveWorkspaceEnv(id, payload)}
          clearWorkspaceEnv={(id, templatePath) => api.clearWorkspaceEnv(id, templatePath)}
          saveWorkspaceProjectName={(id, payload) => api.saveWorkspaceProjectName(id, payload)}
          saveWorkspaceImageTags={(id, payload) => api.saveWorkspaceImageTags(id, payload)}
        />
      );
    }
    if (section === 'stacks') {
      return <StackPanel loadStacks={() => api.getStacks()} runStackAction={(name, action) => api.runStackAction(name, action)} />;
    }
    if (section === 'tasks') {
      return (
        <TaskPanel
          loadTasks={() => api.getTasks()}
          getTask={(id) => api.getTask(id)}
          getTaskLogs={(id, tail) => api.getTaskLogs(id, tail)}
          retryTask={(id) => api.retryTask(id)}
          downloadTaskFile={(id) => api.downloadTaskFile(id)}
        />
      );
    }
    if (section === 'proxy') {
      return <ProxyPanel loadProxy={() => api.getProxyConfig()} updateProxy={(payload) => api.updateProxyConfig(payload)} />;
    }
    return <AuditPanel loadAuditLogs={() => api.getAuditLogs()} />;
  }

  const currentSection = SECTION_META[section];
  const sections = Object.keys(SECTION_META) as Section[];
  const showInMore = MORE_SECTIONS.includes(section);

  return (
    <div className="shell">
      {mobileOpen ? (
        <button
          type="button"
          className="sidebar-backdrop"
          aria-label="点击遮罩关闭导航"
          onClick={closeMobileNav}
        />
      ) : null}

      <aside className={`sidebar ${mobileOpen ? 'open' : ''}`} aria-label="侧边导航">
        <div className="sidebar-mobile-head">
          <p>导航</p>
          <button
            type="button"
            className="btn btn-sm sidebar-mobile-close"
            aria-label="关闭侧边导航"
            onClick={closeMobileNav}
          >
            关闭
          </button>
        </div>

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
          {sections.map((item) => {
            const Icon = SECTION_ICONS[item];
            return (
              <button
                key={item}
                type="button"
                className={`nav-item ${item === section ? 'active' : ''}`}
                onClick={() => switchSection(item)}
                aria-label={SECTION_META[item].label}
                aria-current={item === section ? 'page' : undefined}
              >
                <span className="nav-icon"><Icon /></span>
                <span>{SECTION_META[item].label}</span>
              </button>
            );
          })}
        </nav>

        {onLogout ? (
          <div className="logout">
            <button type="button" className="logout-btn" onClick={onLogout}>
              <span className="nav-icon"><IconLogout /></span>
              <span>退出登录</span>
            </button>
          </div>
        ) : null}
      </aside>

      <main className="content">
        <header className="topbar">
          <div className="topbar-main">
            <button
              type="button"
              className="btn btn-ghost btn-sm mobile-menu"
              aria-label="打开导航"
              onClick={() => setMobileOpen((prev) => !prev)}
            >
              <IconMenu />
            </button>
            <div>
              <h2>{currentSection.title}</h2>
              <p className="muted">{currentSection.description}</p>
            </div>
          </div>
          <span className="topbar-chip">实时管理</span>
        </header>

        <div className="content-body">{renderSection()}</div>

        <nav className="bottom-tabs" aria-label="底部导航">
          {TAB_SECTIONS.map((item) => {
            const Icon = SECTION_ICONS[item];
            return (
              <button
                key={item}
                type="button"
                className={`tab-item ${item === section ? 'active' : ''}`}
                onClick={() => switchSection(item)}
                aria-label={SECTION_META[item].label}
              >
                <span className="tab-icon"><Icon /></span>
                {SECTION_META[item].label}
              </button>
            );
          })}
          <button
            type="button"
            className={`tab-item ${showInMore ? 'active' : ''}`}
            onClick={() => setMobileOpen(true)}
            aria-label="更多选项"
          >
            <span className="tab-icon"><IconMore /></span>
            更多
          </button>
        </nav>
      </main>
    </div>
  );
}
