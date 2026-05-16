# DataWorks 血缘影子中枢

在本地手动构建增强血缘图，补全 DataWorks 官方血缘的隐性依赖（API 调用、跨库触发等）。**图是给人看的，更是给代码和 Agent 读的** — 通过 Python SDK 读取 `graph.json`，输出结构化依赖关系和 Mermaid 文本，用于日常血缘梳理、排障和 LLM 上下文投喂。

## 快速开始

```bash
npm install
npm start
```

浏览器打开 `http://localhost:3001`。数据保存在 `graph.json`（首次启动自动创建）。

> 开发模式：`npm run dev`（Vite 热更新 :5173） + `node server.js`（Express :3001）

## 可视化编辑器

| 操作 | 方式 |
|------|------|
| 画布管理 | 顶部 Tab 栏新建/切换/删除，双击名称可重命名 |
| 添加 DataWorks 节点 | 点击 **「+ DataWorks 节点」**（蓝色） |
| 添加自定义节点 | 点击 **「+ 自定义节点」**（橙色） |
| 编辑节点 | 双击节点，可修改 ID、名称、注释 |
| 删除节点 | 选中按 `Delete` / `Backspace` |
| 连线 | 拖拽节点边缘圆点至目标节点 |
| 虚线/实线切换 | 右键连线 → 切换强依赖（实线）/ 弱依赖（虚线） |
| 撤回/重做 | `Ctrl+Z` / `Ctrl+Shift+Z`，最多 50 步 |
| 保存 | 点击保存 → 确认弹窗 → 覆盖写入 `graph.json` |

## Python SDK

`lineage.py` 是独立的 Python 脚本，读取 `graph.json` 提供图谱分析能力。IDEA 里直接 `import lineage` 即可使用。

### 5 个核心函数

```python
from lineage import LineageHub

hub = LineageHub("graph.json")
```

**1. list_canvases()** — 所有画布名称

```python
hub.list_canvases()
# [{"name": "默认画布", "id": "canvas_default", "node_count": 4, "edge_count": 3}, ...]
```

**2. get_canvas(name)** — 画布完整结构

```python
hub.get_canvas("默认画布")
# {
#   "id": "canvas_default",
#   "name": "默认画布",
#   "nodes": [...],
#   "edges": [...],
#   "mermaid": "```mermaid\ngraph TD\n    ..."
# }
```

**3. get_upstream(node_id, canvas_name)** — 直接上游

```python
hub.get_upstream("dw_report_gen", "默认画布")
# [{"id": "dw_001", "label": "订单同步", "comment": "...", "lineStyle": "solid"}, ...]
```

**4. get_downstream(node_id, canvas_name)** — 直接下游

```python
hub.get_downstream("dw_user_etl", "默认画布")
# [{"id": "dw_002", "label": "日报生成", "comment": "...", "lineStyle": "dashed"}, ...]
```

**5. get_chain(canvas_name, start_id, end_id)** — 两节点间链路

```python
hub.get_chain("默认画布", "dw_user_etl", "dw_report_gen")
# {
#   "start": {"id": "...", "label": "..."},
#   "end":   {"id": "...", "label": "..."},
#   "nodes": [...],
#   "edges": [...],
#   "mermaid": "```mermaid\ngraph TD\n    ..."
# }
```

### 给 Agent 使用

`get_canvas` 和 `get_chain` 返回的 `mermaid` 字段包含完整的 Mermaid 文本，开头附有业务规则声明：

```
### 数仓血缘图例与排查规则声明：
1. 实线箭头 (-->) 代表【强依赖 / 数据流依赖】
   - 业务含义：上游任务必须成功运行并产出数据，下游才能正常读取和计算
   - 排查指导：下游数据缺失时，优先排查实线指向的上游执行异常或数据断流
   - 补数指导：重跑上游后，必须顺着实线箭头依次重跑所有下游
2. 虚线箭头 (-.->) 代表【弱依赖 / 跨链关联 / 未配置调度】
   - 业务含义：节点间存在逻辑关联，但 DataWorks 内部未配置底层调度依赖
   - 排查指导：下游数据缺失时，需排查弱依赖的触发器、中间表或外部同步任务
   - 补数指导：重跑虚线上游时，下游不会自动联动，需手动补数
```

直接复制粘贴给 LLM，Agent 即可理解你的数据依赖关系并给出排障建议。

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
          "type": "customNode",
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
          "label": "",
          "data": { "lineStyle": "solid" }
        }
      ]
    }
  ],
  "activeCanvasId": "canvas_default"
}
```

## 项目结构

```
LocalDataGraph/
├── package.json
├── vite.config.js              # Vite 构建配置
├── index.html                  # 入口 HTML
├── server.js                   # Express 后端（API + 静态文件）
├── lineage.py                  # Python 图谱分析 SDK
├── graph.json                  # 图谱数据（git 忽略，用户私有）
├── .gitignore
├── public/
│   └── favicon.svg
├── src/
│   ├── main.jsx                # React 入口
│   ├── App.jsx                 # 主布局 + 多画布状态
│   ├── App.css
│   ├── index.css
│   ├── api.js                  # 前端 API 请求层
│   └── components/
│       ├── GraphEditor.jsx     # React Flow 编辑器（undo/redo + 保存确认）
│       ├── CustomNode.jsx      # 自定义节点 + 编辑弹窗
│       ├── TabBar.jsx          # 多画布 Tab 栏
│       └── Logo.jsx            # SVG 呼吸灯 Logo
└── dist/                       # 构建产物（npm run build）
```

## 技术栈

| 层 | 技术 |
|----|------|
| 前端 | Vite + React + @xyflow/react |
| 后端 | Express |
| SDK | Python 3，零依赖 |
