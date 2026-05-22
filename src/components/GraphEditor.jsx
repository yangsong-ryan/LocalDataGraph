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
  const [conflict, setConflict] = useState(null)
  const conflictRef = useRef(null)
  const conflictTimerRef = useRef(null)

  const autoSaveRef = useRef(null)
  const nodesRef = useRef(nodes)
  const edgesRef = useRef(edges)

  nodesRef.current = nodes
  edgesRef.current = edges

  const scheduleAutoSave = useCallback(() => {
    if (conflictRef.current) return
    if (autoSaveRef.current) clearTimeout(autoSaveRef.current)
    setSaveStatus('')
    autoSaveRef.current = setTimeout(async () => {
      setSaveStatus('保存中...')
      try {
        const cleanEdges = edgesRef.current.map(({ type, markerEnd, ...rest }) => rest)
        await onSave(nodesRef.current, cleanEdges)
        setSaveStatus('已自动保存 ' + new Date().toLocaleTimeString())
      } catch (e) {
        const msg = e.message || '自动保存失败'
        if (msg.includes('外部') || msg.includes('刷新')) {
          conflictRef.current = true
          setConflict(msg)
          let count = 3
          setSaveStatus(`数据版本冲突，${count} 秒后自动刷新...`)
          conflictTimerRef.current = setInterval(() => {
            count--
            if (count <= 0) {
              clearInterval(conflictTimerRef.current)
              window.location.reload()
            } else {
              setSaveStatus(`数据版本冲突，${count} 秒后自动刷新...`)
            }
          }, 1000)
        } else {
          setSaveStatus(msg)
        }
      }
    }, 800)
  }, [onSave])

  useEffect(() => {
    return () => {
      if (autoSaveRef.current) clearTimeout(autoSaveRef.current)
      if (conflictTimerRef.current) clearInterval(conflictTimerRef.current)
    }
  }, [])

  useEffect(() => {
    const nds = initialNodes.map(n => ({ ...n, deletable: true }))
    setNodes(nds)
    setEdges(initialEdges)
  }, [initialNodes, initialEdges, setNodes, setEdges])

  const onNodeDragStop = useCallback(() => {
    scheduleAutoSave()
  }, [scheduleAutoSave])

  const onNodesDelete = useCallback(() => {
    scheduleAutoSave()
  }, [scheduleAutoSave])

  const onEdgesDelete = useCallback(() => {
    scheduleAutoSave()
  }, [scheduleAutoSave])

  const onConnect = useCallback(params => {
    setEdges(eds => {
      const next = addEdge({
        ...params,
        label: '',
        data: { lineStyle: 'solid' },
        id: genId('e'),
        markerEnd: { type: MarkerType.ArrowClosed }
      }, eds)
      return next
    })
    scheduleAutoSave()
  }, [setEdges, scheduleAutoSave])

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
      setEdges(eds => eds.map(e => ({
        ...e, source: e.source === oldId ? newId : e.source, target: e.target === oldId ? newId : e.target
      })))
    }
    setEditingNode(null)
    scheduleAutoSave()
  }, [editingNode, setNodes, setEdges, scheduleAutoSave])

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
      return next
    })
    scheduleAutoSave()
  }, [setEdges, scheduleAutoSave])

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
      return next
    })
    scheduleAutoSave()
  }, [setNodes, scheduleAutoSave])

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

      {conflict && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,.5)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 99999
        }}>
          <div style={{
            background: '#fff', borderRadius: 8, padding: 32,
            maxWidth: 480, textAlign: 'center', boxShadow: '0 8px 32px rgba(0,0,0,.3)'
          }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8, color: '#e53935' }}>
              数据版本冲突
            </div>
            <div style={{ fontSize: 13, color: '#666', marginBottom: 8, lineHeight: 1.6 }}>
              {conflict}
            </div>
            <div style={{ fontSize: 12, color: '#999' }}>
              页面将在 3 秒后自动刷新...
            </div>
          </div>
        </div>
      )}

      <div className="status-bar"
        style={saveStatus.includes('外部') || saveStatus.includes('失败') || saveStatus.includes('冲突') ? { color: '#e53935', fontWeight: 700 } : {}}>
        {saveStatus}
      </div>
    </div>
  )
}
