import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { App } from './App';
import 'antd/dist/reset.css';
import './style.css';

const locale = {
  ...zhCN,
  Pagination: {
    ...zhCN.Pagination,
    items_per_page: '条',
  },
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConfigProvider locale={locale}>
      <App />
    </ConfigProvider>
  </StrictMode>,
);
