# pi-web

一个增强版的 [pi 编程智能体](https://github.com/badlogic/pi-mono) 网页界面。在浏览器中浏览会话、与智能体对话、分叉对话、切换消息分支、上传文件、搜索会话。

> 基于 [agegr/pi-web](https://github.com/agegr/pi-web) 框架构建，添加了文件上传、资源面板、会话搜索等功能。

## 快速开始

**无需安装，直接运行：**

```bash
npx pi-web@latest
```

**或克隆项目本地运行：**

```bash
git clone https://github.com/2023liushuya-lab/pi-web.git
cd pi-web
npm install
npm run dev
```

启动后打开 [http://localhost:32000](http://localhost:32000)。

**可选参数：**

```bash
pi-web --port 8080
pi-web --hostname 127.0.0.1
pi-web -p 8080 -H 127.0.0.1
PORT=8080 pi-web
```

## 功能介绍

- **会话浏览器** — 按工作目录分组展示所有 pi 会话
- **实时对话** — 通过 SSE 流式输出与智能体实时交互
- **会话分叉** — 从任意用户消息创建独立的新会话分支
- **会话内分支** — 回退到任意节点继续对话，在同一文件内创建分支
- **分支导航器** — 可视化切换同一会话内的各个分支
- **模型切换** — 对话中途随时切换模型
- **工具面板** — 控制智能体可使用的工具
- **文件上传** — 支持拖拽上传文件、文件夹到对话中
- **资源面板** — 集中管理会话中引用的文件
- **会话搜索** — 跨所有会话全文搜索
- **压缩会话** — 对长会话进行摘要，节省上下文窗口

## 开发

```bash
npm install
npm run dev   # 端口 32000
```
