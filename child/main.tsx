import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ChildApp } from './ChildApp';
import 'antd/dist/reset.css';
import '../src/style.css';
import './style.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ChildApp />
  </StrictMode>,
);
