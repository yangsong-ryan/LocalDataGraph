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
      activeCanvasId: 'canvas_default'
    }
  }
  const raw = JSON.parse(readFileSync(GRAPH_PATH, 'utf-8'))
  // 兼容旧格式（无 canvases 字段）
  if (!raw.canvases) {
    return {
      canvases: [{ id: 'canvas_default', name: '默认画布', nodes: raw.nodes || [], edges: raw.edges || [] }],
      activeCanvasId: 'canvas_default'
    }
  }
  return raw
}

function writeGraph(data) {
  writeFileSync(GRAPH_PATH, JSON.stringify(data, null, 2), 'utf-8')
}

// API: 读取图谱
app.get('/api/graph', (_req, res) => {
  res.json(readGraph())
})

// API: 保存图谱（全量覆盖）
app.post('/api/save', (req, res) => {
  const { canvases, activeCanvasId } = req.body
  if (!Array.isArray(canvases)) {
    return res.status(400).json({ error: '数据格式错误：缺少 canvases 数组' })
  }
  writeGraph({ canvases, activeCanvasId })
  const canvas = canvases.find(c => c.id === activeCanvasId) || canvases[0]
  res.json({ ok: true, canvasCount: canvases.length, nodeCount: canvas.nodes.length, edgeCount: canvas.edges.length })
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
