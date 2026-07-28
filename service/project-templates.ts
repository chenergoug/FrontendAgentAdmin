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
