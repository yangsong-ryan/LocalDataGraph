import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from '@modelcontextprotocol/sdk/types.js'
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const GRAPH_PATH = resolve(__dirname, 'graph.json')

function loadFullGraph() {
  if (!existsSync(GRAPH_PATH)) {
    return {
      canvases: [{ id: 'canvas_default', name: '默认画布', nodes: [], edges: [] }],
      activeCanvasId: 'canvas_default'
    }
  }
  const raw = JSON.parse(readFileSync(GRAPH_PATH, 'utf-8'))
  // 兼容旧格式
  if (!raw.canvases) {
    return {
      canvases: [{ id: 'canvas_default', name: '默认画布', nodes: raw.nodes || [], edges: raw.edges || [] }],
      activeCanvasId: 'canvas_default'
    }
  }
  return raw
}

function findCanvas(canvasId) {
  const full = loadFullGraph()
  if (canvasId) {
    return full.canvases.find(c => c.id === canvasId) || null
  }
  return full.canvases.find(c => c.id === full.activeCanvasId) || full.canvases[0] || null
}

function buildAdjacency(canvas) {
  const downstream = {}
  const upstream = {}
  const nodeMap = {}

  for (const n of canvas.nodes) {
    downstream[n.id] = []
    upstream[n.id] = []
    nodeMap[n.id] = n
  }
  for (const e of canvas.edges) {
    if (downstream[e.source]) downstream[e.source].push(e.target)
    if (upstream[e.target]) upstream[e.target].push(e.source)
  }
  return { downstream, upstream, nodeMap }
}

function layeredBFS(startId, adj) {
  if (!adj[startId]) return null

  const visited = new Set([startId])
  const queue = [startId]
  const layers = []
  const parentMap = {}

  while (queue.length > 0) {
    const levelSize = queue.length
    const currentLayer = []
    for (let i = 0; i < levelSize; i++) {
      const nodeId = queue.shift()
      for (const neighbor of (adj[nodeId] || [])) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor)
          currentLayer.push(neighbor)
          parentMap[neighbor] = nodeId
          queue.push(neighbor)
        }
      }
    }
    if (currentLayer.length > 0) layers.push(currentLayer)
  }

  return { layers, visited: [...visited], parentMap }
}

function formatNodeLabel(nodeMap, nodeId) {
  const n = nodeMap[nodeId]
  if (!n) return nodeId
  let text = `${n.data.label} [${nodeId}]`
  if (n.data.comment) text += `\n  备注: ${n.data.comment}`
  return text
}

const server = new Server(
  { name: 'shadow-lineage-mcp', version: '1.0.0' },
  { capabilities: { tools: {} } }
)

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'list_canvases',
      description: '列出所有画布及其基本信息（ID、名称、节点数、边数）。',
      inputSchema: { type: 'object', properties: {}, required: [] }
    },
    {
      name: 'get_impact_analysis',
      description:
        '对指定节点进行下游影响分析（BFS）。返回分层的受影响节点列表，包括通过自定义连线（隐性依赖）传播的下游。节点备注也会一并返回。',
      inputSchema: {
        type: 'object',
        properties: {
          nodeId: { type: 'string', description: '起始节点 ID' },
          canvasId: { type: 'string', description: '画布 ID（可选，默认使用活跃画布）' }
        },
        required: ['nodeId']
      }
    },
    {
      name: 'get_source_tracing',
      description:
        '对指定节点进行上游溯源（反向 BFS）。返回该节点的所有祖先路径层级，节点备注也会一并返回。',
      inputSchema: {
        type: 'object',
        properties: {
          nodeId: { type: 'string', description: '目标节点 ID' },
          canvasId: { type: 'string', description: '画布 ID（可选，默认使用活跃画布）' }
        },
        required: ['nodeId']
      }
    }
  ]
}))

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params

  switch (name) {
    case 'list_canvases': {
      const full = loadFullGraph()
      const lines = ['## 画布列表', '']
      full.canvases.forEach(c => {
        lines.push(`- **${c.name}** (ID: \`${c.id}\`) | ${c.nodes.length} 节点, ${c.edges.length} 连线${c.id === full.activeCanvasId ? ' ← 当前活跃' : ''}`)
      })
      return { content: [{ type: 'text', text: lines.join('\n') }] }
    }

    case 'get_impact_analysis': {
      const canvas = findCanvas(args.canvasId)
      if (!canvas) {
        return { content: [{ type: 'text', text: `画布 "${args.canvasId}" 不存在。` }] }
      }
      const { downstream, nodeMap } = buildAdjacency(canvas)
      const result = layeredBFS(args.nodeId, downstream)
      if (!result) {
        return { content: [{ type: 'text', text: `节点 "${args.nodeId}" 不存在于画布「${canvas.name}」中。` }] }
      }
      const lines = [
        `## 下游影响分析: ${formatNodeLabel(nodeMap, args.nodeId)}`,
        `画布: ${canvas.name} | 受影响节点总数: ${result.visited.length - 1}`,
        ''
      ]
      result.layers.forEach((layer, i) => {
        lines.push(`### 第 ${i + 1} 层（距离 ${i + 1}）`)
        layer.forEach(nid => {
          const parent = result.parentMap[nid]
          const edgeLabel = canvas.edges.find(
            e => e.source === parent && e.target === nid
          )?.label || ''
          const suffix = edgeLabel ? `  [${edgeLabel}]` : ''
          lines.push(`- ${formatNodeLabel(nodeMap, nid)}${suffix}`)
        })
        lines.push('')
      })
      if (result.visited.length === 1) lines.push('（无下游节点）')
      return { content: [{ type: 'text', text: lines.join('\n') }] }
    }

    case 'get_source_tracing': {
      const canvas = findCanvas(args.canvasId)
      if (!canvas) {
        return { content: [{ type: 'text', text: `画布 "${args.canvasId}" 不存在。` }] }
      }
      const { upstream, nodeMap } = buildAdjacency(canvas)
      const result = layeredBFS(args.nodeId, upstream)
      if (!result) {
        return { content: [{ type: 'text', text: `节点 "${args.nodeId}" 不存在于画布「${canvas.name}」中。` }] }
      }
      const lines = [
        `## 上游溯源: ${formatNodeLabel(nodeMap, args.nodeId)}`,
        `画布: ${canvas.name} | 祖先节点总数: ${result.visited.length - 1}`,
        ''
      ]
      result.layers.forEach((layer, i) => {
        lines.push(`### 第 ${i + 1} 层（距离 ${i + 1}）`)
        layer.forEach(nid => {
          const edgeLabel = canvas.edges.find(
            e => e.source === nid && e.target === args.nodeId
          )?.label || ''
          const suffix = edgeLabel ? `  [${edgeLabel}]` : ''
          lines.push(`- ${formatNodeLabel(nodeMap, nid)}${suffix}`)
        })
        lines.push('')
      })
      if (result.visited.length === 1) lines.push('（无上游节点）')
      return { content: [{ type: 'text', text: lines.join('\n') }] }
    }

    default:
      return { content: [{ type: 'text', text: `未知工具: ${name}` }] }
  }
})

const transport = new StdioServerTransport()
server.connect(transport).then(() => {
  console.error('[MCP] 血缘影子中枢 MCP Server 已启动 (多画布模式)')
})
