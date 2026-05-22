import express from 'express'
import cors from 'cors'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const GRAPH_PATH = resolve(__dirname, 'graph.json')
const DIST_PATH = resolve(__dirname, 'dist')

const app = express()
app.use(cors())
app.use(express.json({ limit: '10mb' }))

function readGraph() {
  if (!existsSync(GRAPH_PATH)) {
    return {
      canvases: [{ id: 'canvas_default', name: '默认画布', nodes: [], edges: [] }],
      activeCanvasId: 'canvas_default',
      version: 1
    }
  }
  const raw = JSON.parse(readFileSync(GRAPH_PATH, 'utf-8'))
  // 兼容旧格式（无 canvases 字段）
  if (!raw.canvases) {
    return {
      canvases: [{ id: 'canvas_default', name: '默认画布', nodes: raw.nodes || [], edges: raw.edges || [] }],
      activeCanvasId: 'canvas_default',
      version: raw.version || 1
    }
  }
  if (!raw.version) raw.version = 1
  return raw
}

function writeGraph(data) {
  writeFileSync(GRAPH_PATH, JSON.stringify(data, null, 2), 'utf-8')
}

// API: 读取图谱
app.get('/api/graph', (_req, res) => {
  res.json(readGraph())
})

// API: 保存图谱（全量覆盖，版本校验）
app.post('/api/save', (req, res) => {
  const { canvases, activeCanvasId, version } = req.body
  if (!Array.isArray(canvases)) {
    return res.status(400).json({ error: '数据格式错误：缺少 canvases 数组' })
  }

  const current = readGraph()
  if (version !== current.version) {
    return res.status(409).json({
      ok: false,
      error: `数据已被外部修改（当前版本 ${current.version}，你的版本 ${version}），请刷新页面后再操作。`
    })
  }

  const saved = { canvases, activeCanvasId, version: current.version + 1 }
  writeGraph(saved)
  const canvas = canvases.find(c => c.id === activeCanvasId) || canvases[0]
  res.json({ ok: true, canvasCount: canvases.length, nodeCount: canvas.nodes.length, edgeCount: canvas.edges.length, version: saved.version })
})

// 托管前端静态文件
app.use(express.static(DIST_PATH))
app.get('*', (_req, res) => {
  res.sendFile(resolve(DIST_PATH, 'index.html'))
})

const PORT = process.env.PORT || 3001
app.listen(PORT, () => {
  console.log(`🔗 血缘影子中枢已启动: http://localhost:${PORT}`)
  console.log(`📁 图谱数据: ${GRAPH_PATH}`)
})
