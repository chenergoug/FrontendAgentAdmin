import type { FileChangeItem } from './types.js';

function file(path: string, content: string): FileChangeItem {
  return { path, action: 'create', content: `${content.trim()}\n`, originalContent: '', selected: true };
}

export function createDroneReactTemplate(): FileChangeItem[] {
  return [
    file('package.json', JSON.stringify({ name: 'drone-admin', version: '1.0.0', private: true, type: 'module', scripts: { dev: 'vite', server: 'node server/index.mjs', build: 'tsc --noEmit && vite build', lint: 'tsc --noEmit', test: 'node --test tests/project.test.mjs' }, dependencies: { '@ant-design/icons': '^5.6.1', antd: '^5.24.9', react: '^18.3.1', 'react-dom': '^18.3.1', three: '^0.179.1' }, devDependencies: { '@types/react': '^18.3.20', '@types/react-dom': '^18.3.6', '@types/three': '^0.179.0', '@vitejs/plugin-react': '^4.3.4', typescript: '^5.7.3', vite: '^6.2.2' } }, null, 2)),
    file('tsconfig.json', JSON.stringify({ compilerOptions: { target: 'ES2022', lib: ['ES2022', 'DOM', 'DOM.Iterable'], module: 'ESNext', skipLibCheck: true, moduleResolution: 'Bundler', isolatedModules: true, noEmit: true, jsx: 'react-jsx', strict: true }, include: ['src', 'vite.config.ts'] }, null, 2)),
    file('vite.config.ts', `import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
export default defineConfig({ plugins: [react()], server: { host: '127.0.0.1', port: 4273, proxy: { '/api': 'http://127.0.0.1:4900' } } });`),
    file('index.html', `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/><title>无人机后台管理</title></head><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>`),
    file('src/main.tsx', `import ReactDOM from 'react-dom/client';
import 'antd/dist/reset.css';
import App from './App';
import './style.css';
ReactDOM.createRoot(document.getElementById('root')!).render(<App />);`),
    file('src/App.tsx', `import { AlertOutlined, BarChartOutlined, CameraOutlined, ControlOutlined, DashboardOutlined, FileImageOutlined, RocketOutlined, SafetyCertificateOutlined, TeamOutlined } from '@ant-design/icons';
import { Button, Card, Layout, Menu, Statistic, Table, Tag, Typography } from 'antd';
import { useState } from 'react';
import type { ReactNode } from 'react';
import RealtimeMonitor from './pages/RealtimeMonitor';
const items:{key:string;label:string;icon:ReactNode}[]=[['home','首页',<DashboardOutlined/>],['drones','无人机管理',<RocketOutlined/>],['monitor','实时监控',<CameraOutlined/>],['missions','飞行任务管理',<ControlOutlined/>],['media','媒体资源管理',<FileImageOutlined/>],['alerts','告警中心',<AlertOutlined/>],['analytics','数据分析与报表',<BarChartOutlined/>],['rbac','人员与权限管理',<TeamOutlined/>],['settings','系统配置',<SafetyCertificateOutlined/>]].map(([key,label,icon])=>({key:String(key),label:String(label),icon:icon as ReactNode}));
const rows=[{id:'UAV-001',name:'巡检一号',status:'在线'},{id:'UAV-002',name:'滨江巡检任务',status:'任务中'}];
export default function App(){const[login,setLogin]=useState(false);const[active,setActive]=useState('home');if(!login)return <main className="login"><Card title="无人机运营平台"><Button type="primary" block onClick={()=>setLogin(true)}>登录 / 注册</Button></Card></main>;const content=active==='monitor'?<RealtimeMonitor/>:<Card title={String(items.find(i=>i.key===active)?.label)}><Statistic title="在线无人机" value={18}/><Table rowKey="id" pagination={false} dataSource={rows} columns={[{title:'编号',dataIndex:'id'},{title:'名称',dataIndex:'name'},{title:'状态',dataIndex:'status',render:v=><Tag color="success">{v}</Tag>}]}/></Card>;return <Layout className="app"><Layout.Sider width={224} theme="dark"><div className="brand">UAV CONTROL</div><Menu theme="dark" selectedKeys={[active]} items={items} onClick={({key})=>setActive(key)}/></Layout.Sider><Layout><Layout.Header className="header"><Typography.Title level={4}>{items.find(i=>i.key===active)?.label}</Typography.Title></Layout.Header><Layout.Content className="content">{content}</Layout.Content></Layout></Layout>}`),
    file('src/pages/RealtimeMonitor.tsx', `import { useEffect, useRef } from 'react';
import * as THREE from 'three';
export default function RealtimeMonitor(){const ref=useRef<HTMLDivElement>(null);useEffect(()=>{const host=ref.current;if(!host)return;const scene=new THREE.Scene();scene.background=new THREE.Color(0x07111f);const camera=new THREE.PerspectiveCamera(58,1,.1,200);const renderer=new THREE.WebGLRenderer({antialias:true});host.appendChild(renderer.domElement);scene.add(new THREE.GridHelper(100,32,0x21c7e8,0x173047),new THREE.AmbientLight(0xffffff,2));const curve=new THREE.CatmullRomCurve3([new THREE.Vector3(-28,8,-20),new THREE.Vector3(-8,18,8),new THREE.Vector3(22,11,18),new THREE.Vector3(30,17,-12),new THREE.Vector3(-5,10,-28)],true);const pathGeometry=new THREE.BufferGeometry().setFromPoints(curve.getPoints(200));const pathMaterial=new THREE.LineBasicMaterial({color:0x35d6ff});scene.add(new THREE.Line(pathGeometry,pathMaterial));const material=new THREE.MeshNormalMaterial();const drone=new THREE.Group();drone.add(new THREE.Mesh(new THREE.BoxGeometry(4,.8,2.4),material));[[2.4,1.8],[-2.4,1.8],[2.4,-1.8],[-2.4,-1.8]].forEach(([x,z])=>{const rotor=new THREE.Mesh(new THREE.CylinderGeometry(1.1,1.1,.1,24),material);rotor.position.set(x,.3,z);drone.add(rotor)});scene.add(drone);const resize=()=>{renderer.setSize(host.clientWidth,host.clientHeight,false);camera.aspect=host.clientWidth/host.clientHeight;camera.updateProjectionMatrix()};const observer=new ResizeObserver(resize);observer.observe(host);resize();const clock=new THREE.Clock();let frame=0;const draw=()=>{const t=clock.getElapsedTime()*.04%1,p=curve.getPointAt(t);drone.position.copy(p);drone.lookAt(curve.getPointAt((t+.005)%1));camera.position.lerp(p.clone().add(new THREE.Vector3(-14,9,-16)),.05);camera.lookAt(p);renderer.render(scene,camera);frame=requestAnimationFrame(draw)};draw();return()=>{cancelAnimationFrame(frame);observer.disconnect();pathGeometry.dispose();pathMaterial.dispose();material.dispose();renderer.dispose();renderer.domElement.remove()}},[]);return <section className="monitor"><div className="telemetry"><b>滨江巡检 · UAV-002</b><span>高度 126m</span><span>速度 42km/h</span><span>实时连接</span></div><div ref={ref} className="scene"/></section>}`),
    file('src/style.css', `html,body,#root{height:100%;margin:0}body{font-family:"Microsoft YaHei",sans-serif}.app{min-height:100%}.brand{height:64px;display:grid;place-items:center;color:#43e6a5;font-weight:700}.header{display:flex;align-items:center;background:#fff}.header h4{margin:0}.content{padding:20px;background:#eef2f6}.login{height:100%;display:grid;place-items:center;background:#07111f}.login .ant-card{width:360px}.monitor{position:relative;height:calc(100vh - 104px);min-height:560px;background:#07111f}.telemetry{position:absolute;z-index:2;top:14px;left:14px;right:14px;display:flex;gap:24px;padding:12px 16px;color:#d9f7ff;background:#07111fd9;border:1px solid #1d6f8a}.telemetry b{margin-right:auto;color:#43e6a5}.scene{width:100%;height:100%}.scene canvas{display:block}`),
    file('server/index.mjs', `import http from 'node:http';http.createServer((request,response)=>{response.setHeader('Content-Type','application/json; charset=utf-8');response.end(JSON.stringify({ok:true,path:request.url}))}).listen(4900,'127.0.0.1',()=>console.log('API http://127.0.0.1:4900'));`),
    file('tests/project.test.mjs', `import assert from 'node:assert/strict';import test from 'node:test';test('project baseline',()=>{assert.equal(new Set(['home','drones','monitor','missions','media','alerts','analytics','rbac','settings']).size,9)});`),
  ];
}

export function createVueExpressMysqlTemplate(databaseName: string): FileChangeItem[] {
  const dbName = databaseName || 'frontend_agent_admin_demo';
  return [
    file('package.json', JSON.stringify({
      name: 'vue-express-mysql-admin',
      version: '1.0.0',
      private: true,
      type: 'module',
      scripts: {
        dev: 'vite',
        server: 'node server/index.mjs',
        'db:init': 'node scripts/init-db.mjs',
        build: 'vue-tsc --noEmit && vite build',
        lint: 'vue-tsc --noEmit',
        test: 'node --test tests/project.test.mjs',
      },
      dependencies: {
        '@vitejs/plugin-vue': '^5.2.1',
        express: '^4.21.2',
        mysql2: '^3.12.0',
        vue: '^3.5.13',
      },
      devDependencies: {
        typescript: '^5.7.3',
        vite: '^6.2.2',
        'vue-tsc': '^2.2.0',
      },
    }, null, 2)),
    file('.env.example', `PORT=4910
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=123456
DB_NAME=${dbName}`),
    file('tsconfig.json', JSON.stringify({
      compilerOptions: {
        target: 'ES2022',
        lib: ['ES2022', 'DOM', 'DOM.Iterable'],
        module: 'ESNext',
        moduleResolution: 'Bundler',
        strict: true,
        jsx: 'preserve',
        skipLibCheck: true,
        isolatedModules: true,
        noEmit: true,
      },
      include: ['src/**/*.ts', 'src/**/*.vue', 'vite.config.ts'],
    }, null, 2)),
    file('vite.config.ts', `import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [vue()],
  server: {
    host: '127.0.0.1',
    port: 4288,
    proxy: {
      '/api': 'http://127.0.0.1:4910',
    },
  },
});`),
    file('index.html', `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>全栈后台管理</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>`),
    file('src/main.ts', `import { createApp } from 'vue';
import App from './App.vue';
import './style.css';

createApp(App).mount('#app');`),
    file('src/api/client.ts', `export type LoginResult = { token: string; user: { id: number; username: string; role: string } };
export type DashboardStats = { userTotal: number; productTotal: number };
export type UserItem = { id: number; username: string; role: string };
export type ProductItem = { id: number; name: string; price: number; stock: number };

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers ?? {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || data.error || '请求失败');
  return data as T;
}

export const api = {
  login: (username: string, password: string) =>
    request<LoginResult>('/api/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  stats: () => request<DashboardStats>('/api/stats'),
  users: () => request<UserItem[]>('/api/users'),
  products: () => request<ProductItem[]>('/api/products'),
};`),
    file('src/App.vue', `<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { api, type DashboardStats, type ProductItem, type UserItem } from './api/client';

const username = ref('admin');
const password = ref('123456');
const token = ref('');
const error = ref('');
const stats = ref<DashboardStats>({ userTotal: 0, productTotal: 0 });
const users = ref<UserItem[]>([]);
const products = ref<ProductItem[]>([]);

async function loadDashboard() {
  stats.value = await api.stats();
  users.value = await api.users();
  products.value = await api.products();
}

async function login() {
  error.value = '';
  try {
    const result = await api.login(username.value, password.value);
    token.value = result.token;
    await loadDashboard();
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  }
}

onMounted(() => {
  void login();
});
</script>

<template>
  <main v-if="!token" class="login-page">
    <section class="login-panel">
      <h1>全栈后台管理</h1>
      <input v-model="username" placeholder="账号" />
      <input v-model="password" placeholder="密码" type="password" />
      <button @click="login">登录</button>
      <p v-if="error" class="error">{{ error }}</p>
    </section>
  </main>
  <main v-else class="app-shell">
    <aside>
      <strong>ADMIN</strong>
      <span>首页</span>
      <span>用户管理</span>
      <span>商品管理</span>
    </aside>
    <section class="content">
      <header>
        <h1>首页统计</h1>
        <button @click="token = ''">退出</button>
      </header>
      <div class="stats">
        <article><span>用户总数</span><b>{{ stats.userTotal }}</b></article>
        <article><span>商品总数</span><b>{{ stats.productTotal }}</b></article>
      </div>
      <h2>用户管理</h2>
      <table><thead><tr><th>ID</th><th>账号</th><th>角色</th></tr></thead><tbody><tr v-for="item in users" :key="item.id"><td>{{ item.id }}</td><td>{{ item.username }}</td><td>{{ item.role }}</td></tr></tbody></table>
      <h2>商品管理</h2>
      <table><thead><tr><th>ID</th><th>名称</th><th>价格</th><th>库存</th></tr></thead><tbody><tr v-for="item in products" :key="item.id"><td>{{ item.id }}</td><td>{{ item.name }}</td><td>{{ item.price }}</td><td>{{ item.stock }}</td></tr></tbody></table>
    </section>
  </main>
</template>`),
    file('src/style.css', `html, body, #app { height: 100%; margin: 0; }
body { font-family: Arial, "Microsoft YaHei", sans-serif; background: #eef2f6; color: #1f2937; }
button { border: 0; border-radius: 6px; background: #1677ff; color: white; padding: 9px 16px; cursor: pointer; }
input { box-sizing: border-box; width: 100%; border: 1px solid #d9d9d9; border-radius: 6px; padding: 10px 12px; }
.login-page { height: 100%; display: grid; place-items: center; }
.login-panel { width: 360px; display: grid; gap: 14px; padding: 28px; background: white; border-radius: 8px; box-shadow: 0 10px 30px #0001; }
.error { color: #cf1322; }
.app-shell { min-height: 100%; display: grid; grid-template-columns: 220px 1fr; }
aside { display: flex; flex-direction: column; gap: 18px; padding: 24px; background: #07111f; color: #d6e4ff; }
aside strong { color: #43e6a5; margin-bottom: 20px; }
.content { padding: 24px; }
header { display: flex; align-items: center; justify-content: space-between; }
.stats { display: grid; grid-template-columns: repeat(2, minmax(160px, 240px)); gap: 16px; margin: 18px 0; }
article { background: white; border-radius: 8px; padding: 18px; }
article span { display: block; color: #667085; }
article b { font-size: 32px; }
table { width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden; margin-bottom: 24px; }
th, td { border-bottom: 1px solid #edf0f5; padding: 12px 14px; text-align: left; }
th { background: #f7f9fc; }`),
    file('server/index.mjs', `import express from 'express';
import mysql from 'mysql2/promise';

const app = express();
const port = Number(process.env.PORT || 4910);
const dbConfig = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '123456',
  database: process.env.DB_NAME || '${dbName}',
};

app.use(express.json());

async function query(sql, params = []) {
  const connection = await mysql.createConnection(dbConfig);
  try {
    const [rows] = await connection.execute(sql, params);
    return rows;
  } finally {
    await connection.end();
  }
}

app.post('/api/login', async (request, response) => {
  const { username, password } = request.body;
  const users = await query('SELECT id, username, role FROM users WHERE username = ? AND password = ?', [username, password]);
  if (!users.length) {
    response.status(401).json({ message: '账号或密码错误' });
    return;
  }
  response.json({ token: 'local-demo-token', user: users[0] });
});

app.get('/api/stats', async (_request, response) => {
  const userRows = await query('SELECT COUNT(*) AS total FROM users');
  const productRows = await query('SELECT COUNT(*) AS total FROM products');
  response.json({ userTotal: userRows[0].total, productTotal: productRows[0].total });
});

app.get('/api/users', async (_request, response) => {
  response.json(await query('SELECT id, username, role FROM users ORDER BY id'));
});

app.get('/api/products', async (_request, response) => {
  response.json(await query('SELECT id, name, price, stock FROM products ORDER BY id'));
});

app.listen(port, '127.0.0.1', () => {
  console.log(\`API http://127.0.0.1:\${port}\`);
});`),
    file('database/schema.sql', `CREATE DATABASE IF NOT EXISTS ${dbName} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE ${dbName};

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(64) NOT NULL UNIQUE,
  password VARCHAR(128) NOT NULL,
  role VARCHAR(32) NOT NULL DEFAULT 'user'
);

CREATE TABLE IF NOT EXISTS products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL UNIQUE,
  price DECIMAL(10, 2) NOT NULL,
  stock INT NOT NULL DEFAULT 0
);`),
    file('database/seed.sql', `USE ${dbName};

DELETE FROM products;
DELETE FROM users;
ALTER TABLE products AUTO_INCREMENT = 1;
ALTER TABLE users AUTO_INCREMENT = 1;

INSERT INTO users (username, password, role) VALUES
  ('admin', '123456', 'admin'),
  ('operator', '123456', 'user')
ON DUPLICATE KEY UPDATE role = VALUES(role);

INSERT INTO products (name, price, stock) VALUES
  ('标准商品 A', 99.00, 120),
  ('标准商品 B', 199.00, 45)
ON DUPLICATE KEY UPDATE price = VALUES(price), stock = VALUES(stock);`),
    file('scripts/init-db.mjs', `import { readFile } from 'node:fs/promises';
import mysql from 'mysql2/promise';

const config = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '123456',
  multipleStatements: true,
};

const connection = await mysql.createConnection(config);
try {
  await connection.query(await readFile(new URL('../database/schema.sql', import.meta.url), 'utf8'));
  await connection.query(await readFile(new URL('../database/seed.sql', import.meta.url), 'utf8'));
  console.log('Database initialized');
} finally {
  await connection.end();
}`),
    file('tests/project.test.mjs', `import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('project uses confirmed Vue Express MySQL stack', async () => {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  const app = await readFile(new URL('../src/App.vue', import.meta.url), 'utf8');
  const server = await readFile(new URL('../server/index.mjs', import.meta.url), 'utf8');
  const schema = await readFile(new URL('../database/schema.sql', import.meta.url), 'utf8');
  assert.ok(pkg.dependencies.vue);
  assert.ok(pkg.dependencies.express);
  assert.ok(pkg.dependencies.mysql2);
  assert.match(app, /用户管理/);
  assert.match(app, /商品管理/);
  assert.match(server, /\\/api\\/login/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS users/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS products/);
});`),
  ];
}

export function createVueExpressMysqlBackendTemplate(databaseName: string): FileChangeItem[] {
  const backendPaths = new Set([
    'package.json',
    '.env.example',
    'server/index.mjs',
    'database/schema.sql',
    'database/seed.sql',
    'scripts/init-db.mjs',
    'tests/project.test.mjs',
  ]);
  return createVueExpressMysqlTemplate(databaseName).filter((item) => backendPaths.has(item.path));
}

export function createVueJavaMysqlTemplate(databaseName: string): FileChangeItem[] {
  const dbName = databaseName || 'frontend_agent_admin_java_demo';
  return [
    file('package.json', JSON.stringify({
      name: 'vue-java-mysql-admin',
      version: '1.0.0',
      private: true,
      type: 'module',
      scripts: {
        dev: 'vite',
        server: 'javac -encoding UTF-8 -d server/out server/src/Main.java && java -cp server/out Main',
        'db:init': 'powershell -ExecutionPolicy Bypass -File scripts/init-db.ps1',
        build: 'vue-tsc --noEmit && vite build && javac -encoding UTF-8 -d server/out server/src/Main.java',
        lint: 'vue-tsc --noEmit && javac -Xlint:all -encoding UTF-8 -d server/out server/src/Main.java',
        test: 'node --test tests/project.test.mjs',
      },
      dependencies: {
        '@vitejs/plugin-vue': '^5.2.1',
        vue: '^3.5.13',
      },
      devDependencies: {
        typescript: '^5.7.3',
        vite: '^6.2.2',
        'vue-tsc': '^2.2.0',
      },
    }, null, 2)),
    file('.env.example', `PORT=4920
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=123456
DB_NAME=${dbName}`),
    file('tsconfig.json', JSON.stringify({
      compilerOptions: {
        target: 'ES2022',
        lib: ['ES2022', 'DOM', 'DOM.Iterable'],
        module: 'ESNext',
        moduleResolution: 'Bundler',
        strict: true,
        jsx: 'preserve',
        skipLibCheck: true,
        isolatedModules: true,
        noEmit: true,
      },
      include: ['src/**/*.ts', 'src/**/*.vue', 'vite.config.ts'],
    }, null, 2)),
    file('vite.config.ts', `import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [vue()],
  server: {
    host: '127.0.0.1',
    port: 4298,
    proxy: {
      '/api': 'http://127.0.0.1:4920',
    },
  },
});`),
    file('index.html', `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Java 后台管理</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>`),
    file('src/main.ts', `import { createApp } from 'vue';
import App from './App.vue';
import './style.css';

createApp(App).mount('#app');`),
    file('src/api/client.ts', `export type LoginResult = { token: string; user: { id: number; username: string; role: string } };
export type DashboardStats = { userTotal: number; productTotal: number };
export type UserItem = { id: number; username: string; role: string };
export type ProductItem = { id: number; name: string; price: number; stock: number };

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers ?? {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || data.error || '请求失败');
  return data as T;
}

export const api = {
  login: (username: string, password: string) =>
    request<LoginResult>('/api/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  stats: () => request<DashboardStats>('/api/stats'),
  users: () => request<UserItem[]>('/api/users'),
  products: () => request<ProductItem[]>('/api/products'),
};`),
    file('src/App.vue', `<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { api, type DashboardStats, type ProductItem, type UserItem } from './api/client';

const username = ref('admin');
const password = ref('123456');
const token = ref('');
const error = ref('');
const stats = ref<DashboardStats>({ userTotal: 0, productTotal: 0 });
const users = ref<UserItem[]>([]);
const products = ref<ProductItem[]>([]);

async function loadDashboard() {
  stats.value = await api.stats();
  users.value = await api.users();
  products.value = await api.products();
}

async function login() {
  error.value = '';
  try {
    const result = await api.login(username.value, password.value);
    token.value = result.token;
    await loadDashboard();
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  }
}

onMounted(() => {
  void login();
});
</script>

<template>
  <main v-if="!token" class="login-page">
    <section class="login-panel">
      <h1>Java 后台管理</h1>
      <input v-model="username" placeholder="账号" />
      <input v-model="password" placeholder="密码" type="password" />
      <button @click="login">登录</button>
      <p v-if="error" class="error">{{ error }}</p>
    </section>
  </main>
  <main v-else class="app-shell">
    <aside>
      <strong>JAVA ADMIN</strong>
      <span>首页</span>
      <span>用户管理</span>
      <span>商品管理</span>
    </aside>
    <section class="content">
      <header>
        <h1>首页统计</h1>
        <button @click="token = ''">退出</button>
      </header>
      <div class="stats">
        <article><span>用户总数</span><b>{{ stats.userTotal }}</b></article>
        <article><span>商品总数</span><b>{{ stats.productTotal }}</b></article>
      </div>
      <h2>用户管理</h2>
      <table><thead><tr><th>ID</th><th>账号</th><th>角色</th></tr></thead><tbody><tr v-for="item in users" :key="item.id"><td>{{ item.id }}</td><td>{{ item.username }}</td><td>{{ item.role }}</td></tr></tbody></table>
      <h2>商品管理</h2>
      <table><thead><tr><th>ID</th><th>名称</th><th>价格</th><th>库存</th></tr></thead><tbody><tr v-for="item in products" :key="item.id"><td>{{ item.id }}</td><td>{{ item.name }}</td><td>{{ item.price }}</td><td>{{ item.stock }}</td></tr></tbody></table>
    </section>
  </main>
</template>`),
    file('src/style.css', `html, body, #app { height: 100%; margin: 0; }
body { font-family: Arial, "Microsoft YaHei", sans-serif; background: #eef2f6; color: #1f2937; }
button { border: 0; border-radius: 6px; background: #1677ff; color: white; padding: 9px 16px; cursor: pointer; }
input { box-sizing: border-box; width: 100%; border: 1px solid #d9d9d9; border-radius: 6px; padding: 10px 12px; }
.login-page { height: 100%; display: grid; place-items: center; }
.login-panel { width: 360px; display: grid; gap: 14px; padding: 28px; background: white; border-radius: 8px; box-shadow: 0 10px 30px #0001; }
.error { color: #cf1322; }
.app-shell { min-height: 100%; display: grid; grid-template-columns: 220px 1fr; }
aside { display: flex; flex-direction: column; gap: 18px; padding: 24px; background: #07111f; color: #d6e4ff; }
aside strong { color: #43e6a5; margin-bottom: 20px; }
.content { padding: 24px; }
header { display: flex; align-items: center; justify-content: space-between; }
.stats { display: grid; grid-template-columns: repeat(2, minmax(160px, 240px)); gap: 16px; margin: 18px 0; }
article { background: white; border-radius: 8px; padding: 18px; }
article span { display: block; color: #667085; }
article b { font-size: 32px; }
table { width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden; margin-bottom: 24px; }
th, td { border-bottom: 1px solid #edf0f5; padding: 12px 14px; text-align: left; }
th { background: #f7f9fc; }`),
    file('server/src/Main.java', `import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Executors;

public class Main {
  private static final String DB_NAME = env("DB_NAME", "${dbName}");
  private static final String DB_HOST = env("DB_HOST", "127.0.0.1");
  private static final String DB_PORT = env("DB_PORT", "3306");
  private static final String DB_USER = env("DB_USER", "root");
  private static final String DB_PASSWORD = env("DB_PASSWORD", "123456");

  public static void main(String[] args) throws Exception {
    int port = Integer.parseInt(env("PORT", "4920"));
    HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", port), 0);
    server.createContext("/api/login", Main::login);
    server.createContext("/api/stats", Main::stats);
    server.createContext("/api/users", Main::users);
    server.createContext("/api/products", Main::products);
    server.setExecutor(Executors.newFixedThreadPool(4));
    server.start();
    System.out.println("Java API http://127.0.0.1:" + port);
  }

  private static void login(HttpExchange exchange) throws IOException {
    if (!"POST".equalsIgnoreCase(exchange.getRequestMethod())) {
      json(exchange, 405, "{\\\"message\\\":\\\"Method not allowed\\\"}");
      return;
    }
    String body = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
    if (!body.contains("\\\"username\\\":\\\"admin\\\"") || !body.contains("\\\"password\\\":\\\"123456\\\"")) {
      json(exchange, 401, "{\\\"message\\\":\\\"Invalid credentials\\\"}");
      return;
    }
    json(exchange, 200, "{\\\"token\\\":\\\"java-local-token\\\",\\\"user\\\":{\\\"id\\\":1,\\\"username\\\":\\\"admin\\\",\\\"role\\\":\\\"admin\\\"}}");
  }

  private static void stats(HttpExchange exchange) throws IOException {
    int userTotal = Integer.parseInt(firstCell("SELECT COUNT(*) FROM users;"));
    int productTotal = Integer.parseInt(firstCell("SELECT COUNT(*) FROM products;"));
    json(exchange, 200, "{\\\"userTotal\\\":" + userTotal + ",\\\"productTotal\\\":" + productTotal + "}");
  }

  private static void users(HttpExchange exchange) throws IOException {
    List<String> rows = mysql("SELECT id, username, role FROM users ORDER BY id;");
    List<String> items = new ArrayList<>();
    for (String row : rows) {
      String[] parts = row.split("\\t");
      if (parts.length >= 3) {
        items.add("{\\\"id\\\":" + parts[0] + ",\\\"username\\\":\\\"" + escape(parts[1]) + "\\\",\\\"role\\\":\\\"" + escape(parts[2]) + "\\\"}");
      }
    }
    json(exchange, 200, "[" + String.join(",", items) + "]");
  }

  private static void products(HttpExchange exchange) throws IOException {
    List<String> rows = mysql("SELECT id, name, price, stock FROM products ORDER BY id;");
    List<String> items = new ArrayList<>();
    for (String row : rows) {
      String[] parts = row.split("\\t");
      if (parts.length >= 4) {
        items.add("{\\\"id\\\":" + parts[0] + ",\\\"name\\\":\\\"" + escape(parts[1]) + "\\\",\\\"price\\\":" + parts[2] + ",\\\"stock\\\":" + parts[3] + "}");
      }
    }
    json(exchange, 200, "[" + String.join(",", items) + "]");
  }

  private static String firstCell(String sql) throws IOException {
    List<String> rows = mysql(sql);
    if (rows.isEmpty()) return "0";
    return rows.get(0).split("\\t")[0];
  }

  private static List<String> mysql(String sql) throws IOException {
    List<String> command = List.of("mysql", "-h" + DB_HOST, "-P" + DB_PORT, "-u" + DB_USER, "-p" + DB_PASSWORD, "-D", DB_NAME, "--batch", "--skip-column-names", "-e", sql);
    Process process = new ProcessBuilder(command).redirectErrorStream(true).start();
    List<String> rows = new ArrayList<>();
    try (BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8))) {
      String line;
      while ((line = reader.readLine()) != null) {
        if (!line.startsWith("mysql: [Warning]")) rows.add(line);
      }
    }
    try {
      int code = process.waitFor();
      if (code != 0) throw new IOException("mysql exited with code " + code);
    } catch (InterruptedException error) {
      Thread.currentThread().interrupt();
      throw new IOException(error);
    }
    return rows;
  }

  private static void json(HttpExchange exchange, int status, String body) throws IOException {
    byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
    exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
    exchange.sendResponseHeaders(status, bytes.length);
    try (OutputStream output = exchange.getResponseBody()) {
      output.write(bytes);
    }
  }

  private static String escape(String value) {
    return value.replace("\\\\", "\\\\\\\\");
  }

  private static String env(String key, String fallback) {
    String value = System.getenv(key);
    return value == null || value.isBlank() ? fallback : value;
  }
}`),
    file('database/schema.sql', `CREATE DATABASE IF NOT EXISTS ${dbName} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE ${dbName};

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(64) NOT NULL UNIQUE,
  password VARCHAR(128) NOT NULL,
  role VARCHAR(32) NOT NULL DEFAULT 'user'
);

CREATE TABLE IF NOT EXISTS products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL UNIQUE,
  price DECIMAL(10, 2) NOT NULL,
  stock INT NOT NULL DEFAULT 0
);`),
    file('database/seed.sql', `USE ${dbName};

INSERT INTO users (username, password, role) VALUES
  ('admin', '123456', 'admin'),
  ('operator', '123456', 'user')
ON DUPLICATE KEY UPDATE role = VALUES(role);

INSERT INTO products (name, price, stock) VALUES
  ('Java Product A', 89.00, 66),
  ('Java Product B', 168.00, 32)
ON DUPLICATE KEY UPDATE price = VALUES(price), stock = VALUES(stock);`),
    file('scripts/init-db.ps1', `$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$schema = Join-Path $root 'database/schema.sql'
$seed = Join-Path $root 'database/seed.sql'
Get-Content -Raw $schema | mysql --host=127.0.0.1 --port=3306 --user=root --password=123456
Get-Content -Raw $seed | mysql --host=127.0.0.1 --port=3306 --user=root --password=123456
Write-Host 'Database initialized'`),
    file('tests/project.test.mjs', `import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('project uses confirmed Vue Java MySQL stack', async () => {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  const app = await readFile(new URL('../src/App.vue', import.meta.url), 'utf8');
  const server = await readFile(new URL('../server/src/Main.java', import.meta.url), 'utf8');
  const schema = await readFile(new URL('../database/schema.sql', import.meta.url), 'utf8');
  assert.ok(pkg.dependencies.vue);
  assert.equal(pkg.dependencies.express, undefined);
  assert.match(server, /HttpServer/);
  assert.match(server, /mysql/);
  assert.match(app, /Java 后台管理/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS users/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS products/);
});`),
  ];
}

export function createVueJavaMysqlBackendTemplate(databaseName: string): FileChangeItem[] {
  const backendPaths = new Set([
    'package.json',
    '.env.example',
    'server/src/Main.java',
    'database/schema.sql',
    'database/seed.sql',
    'scripts/init-db.ps1',
    'tests/project.test.mjs',
  ]);
  return createVueJavaMysqlTemplate(databaseName).filter((item) => backendPaths.has(item.path));
}

export function createBasicAdminTemplate(): FileChangeItem[] {
  return [
    file('package.json', JSON.stringify({ name: 'xx-admin', version: '1.0.0', private: true, type: 'module', scripts: { dev: 'vite', server: 'node server/index.mjs', build: 'tsc --noEmit && vite build', lint: 'tsc --noEmit', test: 'node --test tests/project.test.mjs' }, dependencies: { '@ant-design/icons': '^5.6.1', antd: '^5.24.9', react: '^18.3.1', 'react-dom': '^18.3.1' }, devDependencies: { '@types/react': '^18.3.20', '@types/react-dom': '^18.3.6', '@vitejs/plugin-react': '^4.3.4', typescript: '^5.7.3', vite: '^6.2.2' } }, null, 2)),
    file('tsconfig.json', JSON.stringify({ compilerOptions: { target: 'ES2022', lib: ['ES2022', 'DOM', 'DOM.Iterable'], module: 'ESNext', skipLibCheck: true, moduleResolution: 'Bundler', isolatedModules: true, noEmit: true, jsx: 'react-jsx', strict: true }, include: ['src', 'vite.config.ts'] }, null, 2)),
    file('vite.config.ts', `import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
export default defineConfig({ plugins: [react()], server: { host: '127.0.0.1', port: 4280, proxy: { '/api': 'http://127.0.0.1:4910' } } });`),
    file('index.html', `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/><title>XX后台管理</title></head><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>`),
    file('src/main.tsx', `import ReactDOM from 'react-dom/client';
import 'antd/dist/reset.css';
import App from './App';
import './style.css';
ReactDOM.createRoot(document.getElementById('root')!).render(<App />);`),
    file('src/api/auth.ts', `export type LoginResult = { token: string; user: { name: string; role: string } };
export async function login(username: string, password: string) {
  const response = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
  if (!response.ok) throw new Error('账号或密码错误');
  return response.json() as Promise<LoginResult>;
}`),
    file('src/pages/LoginPage.tsx', `import { LockOutlined, UserOutlined } from '@ant-design/icons';
import { Button, Card, Form, Input, Typography, message } from 'antd';
import { login } from '../api/auth';
type Props = { onSuccess: (name: string) => void };
export default function LoginPage({ onSuccess }: Props) { const [form] = Form.useForm(); const submit = async (values: { username: string; password: string }) => { try { const result = await login(values.username, values.password); onSuccess(result.user.name); message.success('登录成功'); } catch (error) { message.error((error as Error).message); } }; return <main className="login-page"><Card className="login-card"><Typography.Title level={2}>XX后台管理</Typography.Title><Typography.Paragraph type="secondary">请输入管理账号登录系统</Typography.Paragraph><Form form={form} layout="vertical" initialValues={{ username: 'admin', password: '123456' }} onFinish={submit}><Form.Item name="username" label="账号" rules={[{ required: true }]}><Input prefix={<UserOutlined />} /></Form.Item><Form.Item name="password" label="密码" rules={[{ required: true }]}><Input.Password prefix={<LockOutlined />} /></Form.Item><Button type="primary" htmlType="submit" block>登录</Button></Form></Card></main>; }`),
    file('src/pages/HomePage.tsx', `import { DashboardOutlined, LogoutOutlined } from '@ant-design/icons';
import { Button, Card, Col, Layout, Menu, Row, Statistic, Typography } from 'antd';
type Props = { username: string; onLogout: () => void };
export default function HomePage({ username, onLogout }: Props) { return <Layout className="app-layout"><Layout.Sider><div className="brand">XX ADMIN</div><Menu theme="dark" selectedKeys={['home']} items={[{ key: 'home', icon: <DashboardOutlined />, label: '首页' }]} /></Layout.Sider><Layout><Layout.Header className="header"><Typography.Text strong>欢迎，{username}</Typography.Text><Button icon={<LogoutOutlined />} onClick={onLogout}>退出</Button></Layout.Header><Layout.Content className="content"><Typography.Title level={3}>首页</Typography.Title><Row gutter={16}><Col span={8}><Card><Statistic title="今日访问" value={1280} /></Card></Col><Col span={8}><Card><Statistic title="在线用户" value={86} /></Card></Col><Col span={8}><Card><Statistic title="待处理事项" value={12} /></Card></Col></Row></Layout.Content></Layout></Layout>; }`),
    file('src/App.tsx', `import { useState } from 'react';
import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage';
export default function App() { const [username, setUsername] = useState(''); return username ? <HomePage username={username} onLogout={() => setUsername('')} /> : <LoginPage onSuccess={setUsername} />; }`),
    file('src/style.css', `html,body,#root{height:100%;margin:0}body{font-family:"Microsoft YaHei",sans-serif}.login-page{height:100%;display:grid;place-items:center;background:#eef2f6}.login-card{width:380px}.app-layout{min-height:100%}.brand{height:64px;display:grid;place-items:center;color:#fff;font-weight:700}.header{display:flex;align-items:center;justify-content:space-between;background:#fff}.content{padding:24px;background:#eef2f6}`),
    file('server/index.mjs', `import http from 'node:http';
const server=http.createServer((request,response)=>{response.setHeader('Content-Type','application/json; charset=utf-8');if(request.method==='POST'&&request.url==='/api/login'){let body='';request.on('data',chunk=>body+=chunk);request.on('end',()=>{const data=JSON.parse(body||'{}');if(data.username==='admin'&&data.password==='123456'){response.end(JSON.stringify({token:'local-admin-token',user:{name:'管理员',role:'admin'}}));return}response.statusCode=401;response.end(JSON.stringify({message:'账号或密码错误'}))});return}response.end(JSON.stringify({ok:true,path:request.url}))});server.listen(4910,'127.0.0.1',()=>console.log('API http://127.0.0.1:4910'));`),
    file('tests/project.test.mjs', `import assert from 'node:assert/strict';import { readFile } from 'node:fs/promises';import test from 'node:test';test('login and home baseline',async()=>{const app=await readFile(new URL('../src/App.tsx',import.meta.url),'utf8');const server=await readFile(new URL('../server/index.mjs',import.meta.url),'utf8');assert.match(app,/LoginPage/);assert.match(app,/HomePage/);assert.ok(server.includes('/api/login'))});`),
  ];
}
