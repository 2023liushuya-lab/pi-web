# 搜索对话 + 资源库 设计文档

**日期**: 2026-06-14
**分支**: `feature/search-resources`
**状态**: 待实现

---

## 概述

为 pi-web 新增两个功能：
1. **搜索对话**：⌘P 全局搜索，按标题和全文检索历史对话
2. **资源库**：集中浏览对话过程中生成的所有文件

---

## 布局变更

侧边栏层级重新组织：

```
┌─ 标签栏 ────────────────────┐
│  Sessions  │  📦 资源库     │    ← 两个一级视图
├─ 列表区 ────────────────────┤
│  (Sessions 列表 / 资源库)   │
│                             │
├─ 底部 ──────────────────────┤
│  📁 文件浏览器  ▶           │    ← 点击展开内嵌面板
├─────────────────────────────┤
│  🧠 Models  │  📚 Skills    │
└─────────────────────────────┘
```

- **Sessions** 和 **资源库** 为同级标签页
- **文件浏览器**（原 Files 标签）移至底部入口，点击展开
- **搜索** 为 ⌘P 模态弹窗，不占用侧边栏空间

---

## 功能一：搜索对话

### 触发方式
- 快捷键 `⌘P`（Mac）/ `Ctrl+P`（Windows）
- 顶栏搜索提示按钮

### UI
- 居中模态弹窗（560px 宽），半透明背景遮罩
- 顶部搜索输入框，自动聚焦
- 结果列表：Session 名称 + 匹配片段高亮 + 匹配数量
- 底部提示：↑↓ 导航 | ↵ 打开 | Esc 关闭
- 无结果时显示空状态

### API
```
GET /api/sessions/search?q=<关键词>&cwd=<可选目录>
```

**实现**：
1. 列出 cwd 对应的 session 目录下的 `.jsonl` 文件
2. 逐行解析：标题来自首条 `type:"message", role:"user"` 的内容
3. 对标题和所有 message 文本做 `includes()` 匹配
4. 每命中一次记录 entryId + 前后 50 字符 snippet + 类型（title/content）

**返回**：
```json
{
  "results": [
    {
      "sessionId": "uuid",
      "sessionPath": "/abs/path/to/file.jsonl",
      "title": "首条用户消息摘录",
      "matchCount": 3,
      "matches": [
        { "entryId": "8hex", "snippet": "...关键词前后文本...", "type": "title" | "content" }
      ]
    }
  ]
}
```

**性能考量**：
- Session 数量通常 < 100，无需全文索引
- 按 cwd 过滤减少扫描范围
- 不做缓存，保持实时性

### 交互
- ↑↓ 键导航结果，高亮当前项
- ↵ 打开对应 session（跳转 `/?session=<id>`，关闭弹窗）
- Esc 关闭弹窗
- 点击遮罩层关闭
- 输入时实时过滤

---

## 功能二：资源库

### 位置
侧边栏第二个标签页 "📦 资源库"

### 内容
对话过程中 Agent 创建的所有文件，按以下维度组织：

**排序方式**（可切换）：
- 🕐 按时间（默认）：最近创建的在前
- 📁 按类型：Markdown / Office / 图片 / 代码 / 其他
- 💬 按来源 Session：按对话分组

**每项显示**：
- 文件名（等宽字体）
- 来源 Session 名称 + 相对时间
- 点击 → 右侧 FileViewer 打开

### 数据来源

两种方式收集资源文件：

1. **解析 toolCall**：遍历 `.jsonl` 中的 toolCall 条目，提取 `write`/`writeFileSync`/`writeFile` 等写操作，记录 target 文件路径
2. **文件时间窗口**：以 session 时间范围为窗口，扫描 cwd 下创建时间落在窗口内的新文件

优先使用方法 1，方法 2 作为兜底。

### API
```
GET /api/resources?cwd=<目录>&sort=time|type|session
```

**实现**：
1. 遍历 cwd 下所有 session 的 `.jsonl`
2. 提取写文件 toolCall，收集 `{ filePath, fileName, sessionId, sessionTitle, timestamp }`
3. 文件路径转为相对 cwd 的路径
4. 验证文件是否存在，过滤已删除文件
5. 去重（同一文件多次修改只保留最新）
6. 按 sort 参数排序/分组返回

**返回**：
```json
{
  "files": [
    {
      "relativePath": "AGENTS.md",
      "fileName": "AGENTS.md",
      "sessionId": "uuid",
      "sessionTitle": "lark-cli 接口调试",
      "timestamp": "2026-06-14T..."
    }
  ]
}
```

### 交互
- 点击文件 → `onOpenFile(relativePath, fileName)` → 右侧 FileViewer 打开
- 显示 "来自 [Session 名称]" 面包屑 → 可点击跳转
- 切换排序方式即时生效
- 空状态："暂无生成的文件"（用户完全独立创建的 session）

---

## 功能三：文件浏览器（重构）

### 位置
侧边栏底部 "📁 文件浏览器" 入口

### 行为
- 点击展开内嵌文件树面板（max-height 动画）
- 内容即原 FileExplorer 组件，功能不变
- 再次点击或切换标签时折叠

---

## 涉及文件

### 新增
| 文件 | 用途 |
|------|------|
| `components/ResourcePanel.tsx` | 资源库面板组件 |
| `components/SearchModal.tsx` | ⌘P 搜索弹窗 |
| `app/api/sessions/search/route.ts` | 搜索 API |
| `app/api/resources/route.ts` | 资源库 API |

### 修改
| 文件 | 改动 |
|------|------|
| `components/AppShell.tsx` | 集成 SearchModal + 侧边栏新布局 |
| `components/SessionSidebar.tsx` | 标签改为 Sessions/资源库，FileExplorer 移到底部入口 |
| `components/FileExplorer.tsx` | 可能的接口适配 |
| `lib/session-reader.ts` | 新增 `searchSessions()` 函数 |
| `app/layout.tsx` | 注册 ⌘P 全局快捷键 |

---

## 自检清单

- [x] 无 placeholder / TODO
- [x] 架构一致：所有 API 复用现有 session-reader 模式
- [x] 无矛盾：搜索和资源库各自独立，无交叉依赖
- [x] 范围可控：两个功能 + 一个布局重构，不过度膨胀
- [x] 无歧义：所有交互行为已明确
