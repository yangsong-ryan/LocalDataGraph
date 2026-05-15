# DataWorks 血缘影子中枢 (Shadow Lineage Hub)

补全 DataWorks 官方血缘无法识别的隐性依赖（API 调用、跨库触发等），通过可视化界面手动构建增强血缘图，并提供 MCP 接口供 AI 助手进行影响分析和溯源。

## 快速开始

```bash
# 1. 安装依赖
npm install

# 2. 启动服务（前端构建 + 后端启动，单端口）
npm start
```

浏览器打开 `http://localhost:3001` 即可使用。

> 开发模式：`npm run dev`（Vite 热更新，:5173） + `node server.js`（Express API，:3001）

## 界面操作

### 多画布

- 顶部 Tab 栏，支持**新建 / 切换 / 重命名 / 删除**画布
- 双击 Tab 名称可重命名
- 切换画布时自动保存当前数据
- 所有画布数据存在同一个 `graph.json` 中

### 节点管理

| 操作 | 方式 |
|------|------|
| 添加 DataWorks 节点 | 点击 **「+ DataWorks 节点」**（蓝色） |
| 添加自定义节点 | 点击 **「+ 自定义节点」**（橙色） |
| 编辑节点 | **双击**节点，弹出编辑窗：可修改 ID、名称、注释 |
| 删除节点 | 选中节点后按 `Delete` / `Backspace` |

节点编辑窗：
- **ID**：必填，可修改但不能与已有节点重复
- **名称**：节点显示的主标题
- **注释**：多行备注，会显示在节点下方

### 连线

- 鼠标按住节点边缘圆点，拖拽到目标节点即可直接连线（无弹窗）
- 连线样式为平滑折线（smoothstep），带箭头

### 自动布局

点击 **「自动布局」**，使用 Dagre 算法按从左到右的拓扑顺序排列节点。

### 保存

点击 **「保存」** 将当前画布的全量数据写入 `graph.json`。状态栏会显示保存结果。

## API 接口

### `GET /api/graph`

读取完整数据（所有画布）。

```bash
curl http://localhost:3001/api/graph
```

### `POST /api/save`

保存全量数据（覆盖写入 `graph.json`）。

```bash
curl -X POST http://localhost:3001/api/save \
  -H "Content-Type: application/json" \
  -d '{"canvases":[...], "activeCanvasId":"canvas_default"}'
```

## MCP 接入（供 AI 助手使用）

### 配置

在 Claude Desktop 或其他 MCP 客户端的配置文件中添加：

```json
{
  "mcpServers": {
    "shadow-lineage": {
      "command": "node",
      "args": ["/path/to/LocalDataGraph/mcp-server.js"]
    }
  }
}
```

### 可用工具

#### `list_canvases`

列出所有画布及其基本信息。

#### `get_impact_analysis`

下游影响分析。从指定节点出发，BFS 遍历所有下游，按距离分层返回。

| 参数 | 类型 | 说明 |
|------|------|------|
| nodeId | string | 起始节点 ID（必填） |
| canvasId | string | 画布 ID（可选，默认活跃画布） |

示例输出：

```
## 下游影响分析: 订单同步任务 [dw_order_sync]
画布: 默认画布 | 受影响节点总数: 2

### 第 1 层（距离 1）
- 日报生成任务 [dw_report_gen]
- API 触发器 [custom_api_trigger]
```

#### `get_source_tracing`

上游溯源。从指定节点出发，反向 BFS 遍历所有祖先，按距离分层返回。

| 参数 | 类型 | 说明 |
|------|------|------|
| nodeId | string | 目标节点 ID（必填） |
| canvasId | string | 画布 ID（可选，默认活跃画布） |

## 数据格式 (`graph.json`)

```json
{
  "canvases": [
    {
      "id": "canvas_default",
      "name": "默认画布",
      "nodes": [
        {
          "id": "dw_001",
          "type": "task",
          "data": {
            "label": "订单任务",
            "origin": "DataWorks",
            "comment": "上游依赖 DWD 层"
          },
          "position": { "x": 100, "y": 100 }
        }
      ],
      "edges": [
        {
          "id": "e_001_002",
          "source": "dw_001",
          "target": "custom_001",
          "label": ""
        }
      ]
    }
  ],
  "activeCanvasId": "canvas_default"
}
```

- `nodes[].id` — 唯一标识，可自定义但不可重复
- `nodes[].data.label` — 节点名称
- `nodes[].data.origin` — `"DataWorks"` 或 `"自定义"`，决定前端渲染颜色
- `nodes[].data.comment` — 备注/注释（多行），可为空
- `edges[].label` — 连线标签（当前默认为空）
- 兼容旧格式：无 `canvases` 字段时自动迁移为单画布

## 项目结构

```
LocalDataGraph/
├── package.json
├── vite.config.js              # Vite 构建配置
├── index.html
├── server.js                   # Express 后端（API + 静态文件）
├── mcp-server.js               # MCP stdio 服务（只读）
├── graph.json                  # 图谱数据（单点真相）
├── src/
│   ├── main.jsx
│   ├── App.jsx                 # 主布局 + 多画布状态管理
│   ├── App.css
│   ├── index.css
│   ├── api.js                  # 前端请求层
│   └── components/
│       ├── CustomNode.jsx      # 自定义节点（四边 Handle + 编辑弹窗）
│       ├── GraphEditor.jsx     # React Flow 编辑器
│       └── TabBar.jsx          # 多画布 Tab 栏
└── dist/                       # 构建产物（npm run build 生成）
```

## 技术栈

| 层 | 技术 |
|----|------|
| 前端 | Vite + React + @xyflow/react |
| 布局 | Dagre（左→右拓扑排序） |
| 后端 | Express（轻量级，无数据库） |
| 算法 | BFS / 反向 BFS（分层输出） |
| MCP | @modelcontextprotocol/sdk（stdio 传输） |
