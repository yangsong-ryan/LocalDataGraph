import { useCallback, useEffect, useState, useRef } from 'react'
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
import CustomNode, { NodeEditModal } from './CustomNode'

const NODE_TYPES_CONFIG = {
  dw: { label: 'DataWorks 节点', origin: 'DataWorks' },
  custom: { label: '自定义节点', origin: '自定义' }
}

const nodeTypes = { customNode: CustomNode }

let idCounter = 0
function genId(prefix = 'node') {
  return `${prefix}_${Date.now()}_${idCounter++}`
}

const MAX_HISTORY = 50

// ---------- 保存确认弹窗 ----------
function SaveConfirmModal({ onConfirm, onCancel }) {
  return (
    <div
      style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}
      onClick={onCancel}
    >
      <div style={{ background: '#fff', borderRadius: 8, padding: 24, minWidth: 300, boxShadow: '0 4px 20px rgba(0,0,0,.2)', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>确认保存</div>
        <div style={{ fontSize: 13, color: '#666', marginBottom: 20 }}>将覆盖写入 graph.json，不可撤回。</div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
          <button onClick={onCancel} style={{ padding: '8px 20px', border: '1px solid #ccc', borderRadius: 4, background: '#fff', cursor: 'pointer', fontSize: 13 }}>取消</button>
          <button onClick={onConfirm} style={{ padding: '8px 20px', border: 'none', borderRadius: 4, background: '#4caf50', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>确认保存</button>
        </div>
      </div>
    </div>
  )
}

// ---------- 主组件 ----------
export default function GraphEditor({ nodes: initialNodes, edges: initialEdges, onSave }) {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState('')
  const [editingNode, setEditingNode] = useState(null)
  const [showSaveConfirm, setShowSaveConfirm] = useState(false)

  // undo/redo 历史
  const historyRef = useRef([])
  const historyIndexRef = useRef(-1)
  const skipHistoryRef = useRef(false)

  const pushHistory = useCallback((nds, eds) => {
    if (skipHistoryRef.current) return
    const snap = { nodes: JSON.parse(JSON.stringify(nds)), edges: JSON.parse(JSON.stringify(eds)) }
    const idx = historyIndexRef.current
    historyRef.current = historyRef.current.slice(0, idx + 1)
    historyRef.current.push(snap)
    if (historyRef.current.length > MAX_HISTORY) historyRef.current.shift()
    historyIndexRef.current = historyRef.current.length - 1
  }, [])

  const undo = useCallback(() => {
    if (historyIndexRef.current <= 0) return
    historyIndexRef.current--
    const snap = historyRef.current[historyIndexRef.current]
    skipHistoryRef.current = true
    setNodes(snap.nodes)
    setEdges(snap.edges)
    setTimeout(() => { skipHistoryRef.current = false }, 0)
    setStatus('已撤回')
  }, [setNodes, setEdges])

  const redo = useCallback(() => {
    if (historyIndexRef.current >= historyRef.current.length - 1) return
    historyIndexRef.current++
    const snap = historyRef.current[historyIndexRef.current]
    skipHistoryRef.current = true
    setNodes(snap.nodes)
    setEdges(snap.edges)
    setTimeout(() => { skipHistoryRef.current = false }, 0)
    setStatus('已重做')
  }, [setNodes, setEdges])

  // Ctrl+Z / Ctrl+Shift+Z
  useEffect(() => {
    const handler = e => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [undo, redo])

  // 切换画布时同步数据
  useEffect(() => {
    const nds = initialNodes.map(n => ({ ...n, deletable: true }))
    setNodes(nds)
    setEdges(initialEdges)
    historyRef.current = []
    historyIndexRef.current = -1
    skipHistoryRef.current = true
    setTimeout(() => {
      pushHistory(nds, initialEdges)
      skipHistoryRef.current = false
    }, 100)
  }, [initialNodes, initialEdges, setNodes, setEdges, pushHistory])

  // 初始化历史
  useEffect(() => {
    if (historyRef.current.length === 0 && nodes.length >= 0) {
      pushHistory(nodes, edges)
    }
  }, [])

  // 拖拽结束时记录历史
  const onNodeDragStop = useCallback(() => {
    pushHistory(nodes, edges)
  }, [nodes, edges, pushHistory])

  // 删除时记录历史
  const onNodesDelete = useCallback((deleted) => {
    pushHistory(
      nodes.filter(n => !deleted.some(d => d.id === n.id)),
      edges.filter(e => !deleted.some(d => d.id === e.source || d.id === e.target))
    )
  }, [nodes, edges, pushHistory])

  const onEdgesDelete = useCallback((deleted) => {
    pushHistory(nodes, edges.filter(e => !deleted.some(d => d.id === e.id)))
  }, [nodes, edges, pushHistory])

  // 连线
  const onConnect = useCallback(params => {
    const newEdge = {
      ...params,
      label: '',
      id: genId('e'),
      markerEnd: { type: MarkerType.ArrowClosed }
    }
    setEdges(eds => {
      const next = addEdge(newEdge, eds)
      pushHistory(nodes, next)
      return next
    })
  }, [nodes, pushHistory, setEdges])

  // 节点双击 → 打开编辑弹窗
  const onNodeDoubleClick = useCallback((_, node) => {
    setEditingNode({ id: node.id, label: node.data.label, comment: node.data.comment || '' })
  }, [])

  const handleNodeEditConfirm = useCallback((newId, newLabel, newComment) => {
    if (!editingNode) return
    const oldId = editingNode.id

    setNodes(nds => {
      const next = nds.map(n =>
        n.id === oldId
          ? { ...n, id: newId, data: { ...n.data, label: newLabel, comment: newComment } }
          : n
      )
      return next
    })

    if (newId !== oldId) {
      setEdges(eds => {
        const next = eds.map(e => ({
          ...e,
          source: e.source === oldId ? newId : e.source,
          target: e.target === oldId ? newId : e.target
        }))
        pushHistory(nodes.map(n => n.id === oldId ? { ...n, id: newId } : n), next)
        return next
      })
    } else {
      setNodes(nds => {
        const next = nds.map(n =>
          n.id === oldId
            ? { ...n, id: newId, data: { ...n.data, label: newLabel, comment: newComment } }
            : n
        )
        pushHistory(next, edges)
        return next
      })
    }

    setEditingNode(null)
  }, [editingNode, nodes, edges, pushHistory, setNodes, setEdges])

  // 保存
  const handleSave = useCallback(async () => {
    setShowSaveConfirm(true)
  }, [])

  const doSave = useCallback(async () => {
    setShowSaveConfirm(false)
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

  const addNode = useCallback(type => {
    const def = NODE_TYPES_CONFIG[type]
    setNodes(nds => {
      const next = [...nds, {
        id: genId(type),
        type: 'customNode',
        data: { label: def.label, origin: def.origin, comment: '' },
        position: { x: Math.random() * 300 + 100, y: Math.random() * 300 + 100 },
        deletable: true
      }]
      pushHistory(next, edges)
      return next
    })
  }, [edges, pushHistory, setNodes])

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
        onNodeDragStop={onNodeDragStop}
        onNodesDelete={onNodesDelete}
        onEdgesDelete={onEdgesDelete}
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
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <button className="btn-add-dw" onClick={() => addNode('dw')}>
              + DataWorks 节点
            </button>
            <button className="btn-add-custom" onClick={() => addNode('custom')}>
              + 自定义节点
            </button>
            <span style={{ color: '#ccc', margin: '0 2px' }}>|</span>
            <button
              onClick={undo}
              disabled={historyIndexRef.current <= 0}
              title="撤回 (Ctrl+Z)"
              style={{
                padding: '6px 10px', border: '1px solid #ccc', borderRadius: 4,
                background: '#fff', cursor: 'pointer', fontSize: 13
              }}
            >
              ↩
            </button>
            <button
              onClick={redo}
              disabled={historyIndexRef.current >= historyRef.current.length - 1}
              title="重做 (Ctrl+Shift+Z)"
              style={{
                padding: '6px 10px', border: '1px solid #ccc', borderRadius: 4,
                background: '#fff', cursor: 'pointer', fontSize: 13
              }}
            >
              ↪
            </button>
            <span style={{ color: '#ccc', margin: '0 2px' }}>|</span>
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

      {showSaveConfirm && (
        <SaveConfirmModal
          onConfirm={doSave}
          onCancel={() => setShowSaveConfirm(false)}
        />
      )}

      <div className="status-bar">{status}</div>
    </div>
  )
}
