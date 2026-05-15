import { useCallback, useEffect, useState } from 'react'
import {
  ReactFlow,
  Controls,
  Background,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  Panel,
  MarkerType
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import dagre from 'dagre'
import CustomNode, { NodeEditModal } from './CustomNode'

const NODE_TYPES_CONFIG = {
  dw: { label: 'DataWorks 节点', origin: 'DataWorks', deletable: true },
  custom: { label: '自定义节点', origin: '自定义', deletable: true }
}

const nodeTypes = { customNode: CustomNode }

let idCounter = 0
function genId(prefix = 'node') {
  return `${prefix}_${Date.now()}_${idCounter++}`
}

function layoutDagre(nodes, edges) {
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: 'LR', nodesep: 120, ranksep: 200 })

  nodes.forEach(n => g.setNode(n.id, { width: 200, height: 80 }))
  edges.forEach(e => g.setEdge(e.source, e.target))

  dagre.layout(g)

  return nodes.map(n => {
    const pos = g.node(n.id)
    return { ...n, position: { x: pos.x - 100, y: pos.y - 35 } }
  })
}

// ---------- 主组件 ----------
export default function GraphEditor({ nodes: initialNodes, edges: initialEdges, onSave }) {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState('')

  // 节点编辑弹窗
  const [editingNode, setEditingNode] = useState(null)

  // 切换画布时同步数据，确保节点可删除
  useEffect(() => {
    setNodes(initialNodes.map(n => ({ ...n, deletable: true })))
    setEdges(initialEdges)
  }, [initialNodes, initialEdges, setNodes, setEdges])

  // 直接连线，不弹窗
  const onConnect = useCallback(
    params => {
      setEdges(eds =>
        addEdge(
          {
            ...params,
            label: '',
            id: genId('e'),
            markerEnd: { type: MarkerType.ArrowClosed }
          },
          eds
        )
      )
    },
    [setEdges]
  )

  // 节点双击 → 打开编辑弹窗
  const onNodeDoubleClick = useCallback((_, node) => {
    setEditingNode({ id: node.id, label: node.data.label, comment: node.data.comment || '' })
  }, [])

  const handleNodeEditConfirm = useCallback(
    (newId, newLabel, newComment) => {
      if (!editingNode) return
      const oldId = editingNode.id

      setNodes(nds =>
        nds.map(n =>
          n.id === oldId
            ? { ...n, id: newId, data: { ...n.data, label: newLabel, comment: newComment } }
            : n
        )
      )

      // ID 变更时同步更新边引用
      if (newId !== oldId) {
        setEdges(eds =>
          eds.map(e => ({
            ...e,
            source: e.source === oldId ? newId : e.source,
            target: e.target === oldId ? newId : e.target
          }))
        )
      }

      setEditingNode(null)
    },
    [editingNode, setNodes, setEdges]
  )

  const handleSave = useCallback(async () => {
    setSaving(true)
    try {
      const cleanEdges = edges.map(({ type, markerEnd, ...rest }) => rest)
      await onSave(nodes, cleanEdges)
      setStatus('保存成功 ' + new Date().toLocaleTimeString())
    } catch {
      setStatus('保存失败')
    } finally {
      setSaving(false)
    }
  }, [nodes, edges, onSave])

  const handleAutoLayout = useCallback(() => {
    setNodes(nds => layoutDagre(nds, edges))
    setStatus('自动布局完成')
  }, [edges, setNodes])

  const addNode = useCallback(
    type => {
      const def = NODE_TYPES_CONFIG[type]
      setNodes(nds => [
        ...nds,
        {
          id: genId(type),
          type: 'customNode',
          data: { label: def.label, origin: def.origin, comment: '' },
          position: { x: Math.random() * 300 + 100, y: Math.random() * 300 + 100 },
          deletable: def.deletable
        }
      ])
    },
    [setNodes]
  )

  // 收集当前所有节点 ID 用于重复校验
  const allNodeIds = nodes.map(n => n.id)

  return (
    <div className="canvas-wrap">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeDoubleClick={onNodeDoubleClick}
        nodeTypes={nodeTypes}
        defaultEdgeOptions={{
          type: 'smoothstep',
          markerEnd: { type: MarkerType.ArrowClosed }
        }}
        fitView
      >
        <Controls />
        <Background />
        <MiniMap nodeColor={n => (n.data?.origin === 'DataWorks' ? '#1976d2' : '#f57c00')} />
        <Panel position="top-left">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn-add-dw" onClick={() => addNode('dw')}>
              + DataWorks 节点
            </button>
            <button className="btn-add-custom" onClick={() => addNode('custom')}>
              + 自定义节点
            </button>
            <button className="btn-auto" onClick={handleAutoLayout}>
              自动布局
            </button>
            <button className="btn-save" onClick={handleSave} disabled={saving}>
              {saving ? '保存中...' : '保存'}
            </button>
          </div>
        </Panel>
      </ReactFlow>

      {editingNode && (
        <NodeEditModal
          nodeId={editingNode.id}
          label={editingNode.label}
          comment={editingNode.comment}
          allNodeIds={allNodeIds}
          onConfirm={handleNodeEditConfirm}
          onCancel={() => setEditingNode(null)}
        />
      )}

      <div className="status-bar">{status}</div>
    </div>
  )
}
