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
  MarkerType,
  BaseEdge,
  getSmoothStepPath
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

// ---------- 自定义连线（支持虚/实线）----------
function StyledEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, data }) {
  const [edgePath] = getSmoothStepPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition })
  const isDashed = data?.lineStyle === 'dashed'
  return (
    <BaseEdge
      id={id}
      path={edgePath}
      markerEnd={markerEnd}
      style={{
        stroke: isDashed ? '#999' : '#555',
        strokeWidth: isDashed ? 1.5 : 2,
        strokeDasharray: isDashed ? '8,4' : 'none'
      }}
    />
  )
}

const edgeTypes = { styled: StyledEdge }

// ---------- 右键菜单 ----------
function EdgeContextMenu({ x, y, edge, onToggleStyle, onClose }) {
  useEffect(() => {
    const handler = () => onClose()
    window.addEventListener('click', handler)
    return () => window.removeEventListener('click', handler)
  }, [onClose])

  return (
    <div
      style={{
        position: 'fixed', left: x, top: y, zIndex: 10000,
        background: '#fff', borderRadius: 6, boxShadow: '0 3px 16px rgba(0,0,0,.18)',
        padding: '4px 0', minWidth: 140, fontSize: 13
      }}
    >
      <div style={{ padding: '4px 12px', color: '#999', fontSize: 11, borderBottom: '1px solid #eee' }}>
        连线操作
      </div>
      <div
        onClick={() => { onToggleStyle(edge.id); onClose() }}
        style={{ padding: '6px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
        onMouseEnter={e => e.target.style.background = '#f0f0f0'}
        onMouseLeave={e => e.target.style.background = 'transparent'}
      >
        <span style={{ fontSize: 16 }}>
          {edge.data?.lineStyle === 'dashed' ? '┅' : '━'}
        </span>
        <span>{edge.data?.lineStyle === 'dashed' ? '切换为强依赖（实线）' : '切换为弱依赖（虚线）'}</span>
      </div>
    </div>
  )
}

// ---------- 主组件 ----------
export default function GraphEditor({ nodes: initialNodes, edges: initialEdges, onSave }) {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
  const [saveStatus, setSaveStatus] = useState('')
  const [editingNode, setEditingNode] = useState(null)
  const [contextMenu, setContextMenu] = useState(null)

  const historyRef = useRef([])
  const historyIndexRef = useRef(-1)
  const skipHistoryRef = useRef(false)
  const autoSaveRef = useRef(null)
  const nodesRef = useRef(nodes)
  const edgesRef = useRef(edges)

  // 始终保持 ref 与 state 同步
  nodesRef.current = nodes
  edgesRef.current = edges

  const scheduleAutoSave = useCallback(() => {
    if (autoSaveRef.current) clearTimeout(autoSaveRef.current)
    setSaveStatus('')
    autoSaveRef.current = setTimeout(async () => {
      setSaveStatus('保存中...')
      try {
        const cleanEdges = edgesRef.current.map(({ type, markerEnd, ...rest }) => rest)
        await onSave(nodesRef.current, cleanEdges)
        setSaveStatus('已自动保存 ' + new Date().toLocaleTimeString())
      } catch {
        setSaveStatus('自动保存失败')
      }
    }, 1500)
  }, [onSave])

  useEffect(() => {
    return () => { if (autoSaveRef.current) clearTimeout(autoSaveRef.current) }
  }, [])

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
    setSaveStatus('已撤回')
    scheduleAutoSave()
  }, [setNodes, setEdges, scheduleAutoSave])

  const redo = useCallback(() => {
    if (historyIndexRef.current >= historyRef.current.length - 1) return
    historyIndexRef.current++
    const snap = historyRef.current[historyIndexRef.current]
    skipHistoryRef.current = true
    setNodes(snap.nodes)
    setEdges(snap.edges)
    setTimeout(() => { skipHistoryRef.current = false }, 0)
    setSaveStatus('已重做')
    scheduleAutoSave()
  }, [setNodes, setEdges, scheduleAutoSave])

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

  useEffect(() => {
    if (historyRef.current.length === 0 && nodes.length >= 0) {
      pushHistory(nodes, edges)
    }
  }, [])

  const onNodeDragStop = useCallback(() => {
    pushHistory(nodes, edges)
    scheduleAutoSave()
  }, [nodes, edges, pushHistory, scheduleAutoSave])

  const onNodesDelete = useCallback((deleted) => {
    pushHistory(
      nodes.filter(n => !deleted.some(d => d.id === n.id)),
      edges.filter(e => !deleted.some(d => d.id === e.source || d.id === e.target))
    )
    scheduleAutoSave()
  }, [nodes, edges, pushHistory, scheduleAutoSave])

  const onEdgesDelete = useCallback((deleted) => {
    pushHistory(nodes, edges.filter(e => !deleted.some(d => d.id === e.id)))
    scheduleAutoSave()
  }, [nodes, edges, pushHistory, scheduleAutoSave])

  const onConnect = useCallback(params => {
    const newEdge = {
      ...params,
      label: '',
      data: { lineStyle: 'solid' },
      id: genId('e'),
      markerEnd: { type: MarkerType.ArrowClosed }
    }
    setEdges(eds => {
      const next = addEdge(newEdge, eds)
      pushHistory(nodes, next)
      return next
    })
    scheduleAutoSave()
  }, [nodes, pushHistory, setEdges, scheduleAutoSave])

  const onNodeDoubleClick = useCallback((_, node) => {
    setEditingNode({ id: node.id, label: node.data.label, comment: node.data.comment || '' })
  }, [])

  const handleNodeEditConfirm = useCallback((newId, newLabel, newComment) => {
    if (!editingNode) return
    const oldId = editingNode.id
    setNodes(nds => {
      const next = nds.map(n =>
        n.id === oldId ? { ...n, id: newId, data: { ...n.data, label: newLabel, comment: newComment } } : n
      )
      return next
    })
    if (newId !== oldId) {
      setEdges(eds => {
        const next = eds.map(e => ({
          ...e, source: e.source === oldId ? newId : e.source, target: e.target === oldId ? newId : e.target
        }))
        pushHistory(nodes.map(n => n.id === oldId ? { ...n, id: newId } : n), next)
        return next
      })
    } else {
      setNodes(nds => {
        const next = nds.map(n =>
          n.id === oldId ? { ...n, id: newId, data: { ...n.data, label: newLabel, comment: newComment } } : n
        )
        pushHistory(next, edges)
        return next
      })
    }
    setEditingNode(null)
    scheduleAutoSave()
  }, [editingNode, nodes, edges, pushHistory, setNodes, setEdges, scheduleAutoSave])

  // 右键连线 → 切换虚/实线
  const onEdgeContextMenu = useCallback((event, edge) => {
    event.preventDefault()
    setContextMenu({ x: event.clientX, y: event.clientY, edge })
  }, [])

  const toggleLineStyle = useCallback(edgeId => {
    setEdges(eds => {
      const next = eds.map(e => {
        if (e.id !== edgeId) return e
        const cur = e.data?.lineStyle || 'solid'
        return { ...e, data: { ...e.data, lineStyle: cur === 'dashed' ? 'solid' : 'dashed' } }
      })
      pushHistory(nodes, next)
      return next
    })
    scheduleAutoSave()
  }, [nodes, pushHistory, setEdges, scheduleAutoSave])

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
    scheduleAutoSave()
  }, [edges, pushHistory, setNodes, scheduleAutoSave])

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
        onEdgeContextMenu={onEdgeContextMenu}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        defaultEdgeOptions={{
          type: 'styled',
          markerEnd: { type: MarkerType.ArrowClosed }
        }}
        selectNodesOnDrag
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
            <button onClick={undo} disabled={historyIndexRef.current <= 0} title="撤回 (Ctrl+Z)"
              style={{ padding: '6px 10px', border: '1px solid #ccc', borderRadius: 4, background: '#fff', cursor: 'pointer', fontSize: 13 }}>↩</button>
            <button onClick={redo} disabled={historyIndexRef.current >= historyRef.current.length - 1} title="重做 (Ctrl+Shift+Z)"
              style={{ padding: '6px 10px', border: '1px solid #ccc', borderRadius: 4, background: '#fff', cursor: 'pointer', fontSize: 13 }}>↪</button>
          </div>
        </Panel>
      </ReactFlow>

      {editingNode && (
        <NodeEditModal
          nodeId={editingNode.id} label={editingNode.label} comment={editingNode.comment}
          allNodeIds={allNodeIds} onConfirm={handleNodeEditConfirm} onCancel={() => setEditingNode(null)}
        />
      )}

      {contextMenu && (
        <EdgeContextMenu
          x={contextMenu.x} y={contextMenu.y} edge={contextMenu.edge}
          onToggleStyle={toggleLineStyle} onClose={() => setContextMenu(null)}
        />
      )}

      <div className="status-bar">{saveStatus}</div>
    </div>
  )
}
