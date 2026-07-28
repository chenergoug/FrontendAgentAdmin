import {
  AppstoreOutlined,
  ControlOutlined,
  DashboardOutlined,
  FileTextOutlined,
  HomeOutlined,
  RobotOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { Layout, Menu, Typography } from 'antd';
import type { ReactNode } from 'react';
import type { MenuKey } from '../types';

type AppShellProps = {
  activeMenu: MenuKey;
  onMenuChange: (menu: MenuKey) => void;
  children: ReactNode;
};

const menuItems: { key: MenuKey; label: string; icon: ReactNode }[] = [
  { key: 'home', label: '首页', icon: <HomeOutlined /> },
  { key: 'projects', label: '项目中心', icon: <AppstoreOutlined /> },
  { key: 'models', label: '模型配置', icon: <ControlOutlined /> },
  { key: 'agents', label: 'Agent 配置', icon: <RobotOutlined /> },
  { key: 'settings', label: '系统设置', icon: <SettingOutlined /> },
  { key: 'logs', label: '运行日志', icon: <FileTextOutlined /> },
  { key: 'recovery', label: '恢复中心', icon: <DashboardOutlined /> },
];

export function AppShell({ activeMenu, onMenuChange, children }: AppShellProps) {
  return (
    <Layout className="app-layout">
      <Layout.Sider className="app-sider" width={208}>
        <div className="brand">
          <Typography.Text className="brand-title">Frontend Agent</Typography.Text>
        </div>
        <Menu
          items={menuItems.map((item) => ({ key: item.key, icon: item.icon, label: item.label }))}
          mode="inline"
          onClick={(event) => onMenuChange(event.key as MenuKey)}
          selectedKeys={[activeMenu]}
          theme="dark"
        />
      </Layout.Sider>
      <Layout.Content className="app-content">{children}</Layout.Content>
    </Layout>
  );
}
