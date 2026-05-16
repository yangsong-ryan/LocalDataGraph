import { useState, useEffect, useCallback } from 'react'
import { fetchGraph, saveGraph } from './api'
import TabBar from './components/TabBar'
import GraphEditor from './components/GraphEditor'
import Logo from './components/Logo'
import './App.css'

let idCounter = 0
function genCanvasId() {
  return `canvas_${Date.now()}_${idCounter++}`
}

const DEFAULT_CANVAS = {
  id: 'canvas_default',
  name: '默认画布',
  nodes: [],
  edges: []
}

export default function App() {
  const [canvases, setCanvases] = useState([DEFAULT_CANVAS])
  const [activeId, setActiveId] = useState(DEFAULT_CANVAS.id)
  const [loaded, setLoaded] = useState(false)

  // 初始化加载
  useEffect(() => {
    fetchGraph()
      .then(data => {
        if (data.canvases && data.canvases.length > 0) {
          setCanvases(data.canvases)
          setActiveId(data.activeCanvasId || data.canvases[0].id)
        }
      })
      .catch(() => {})
      .finally(() => setLoaded(true))
  }, [])

  const activeCanvas = canvases.find(c => c.id === activeId) || canvases[0]

  // 全量保存
  const save = useCallback(async (newCanvases, newActiveId) => {
    await saveGraph({ canvases: newCanvases, activeCanvasId: newActiveId })
  }, [])

  // 保存当前画布的节点和边
  const handleSaveCanvas = useCallback(async (nodes, edges) => {
    const updated = canvases.map(c =>
      c.id === activeId ? { ...c, nodes, edges } : c
    )
    setCanvases(updated)
    await saveGraph({ canvases: updated, activeCanvasId: activeId })
  }, [canvases, activeId])

  // 切换画布
  const handleSwitch = useCallback(id => setActiveId(id), [])

  // 新建画布
  const handleAdd = useCallback(async () => {
    const newCanvas = {
      id: genCanvasId(),
      name: '新建画布 ' + (canvases.length + 1),
      nodes: [],
      edges: []
    }
    const updated = [...canvases, newCanvas]
    setCanvases(updated)
    setActiveId(newCanvas.id)
    await save(updated, newCanvas.id)
  }, [canvases, save])

  // 删除画布
  const handleDelete = useCallback(async id => {
    if (canvases.length <= 1) return
    const updated = canvases.filter(c => c.id !== id)
    const newActiveId = id === activeId ? updated[0].id : activeId
    setCanvases(updated)
    setActiveId(newActiveId)
    await save(updated, newActiveId)
  }, [canvases, activeId, save])

  // 重命名画布
  const handleRename = useCallback(async (id, name) => {
    const updated = canvases.map(c =>
      c.id === id ? { ...c, name } : c
    )
    setCanvases(updated)
    await save(updated, activeId)
  }, [canvases, activeId, save])

  if (!loaded) return <div style={{ padding: 40, color: '#999' }}>加载中...</div>

  return (
    <div className="app">
      <div className="toolbar">
        <Logo size={28} />
        <h1>DataWorks 血缘影子中枢</h1>
        <span style={{ fontSize: 12, opacity: 0.7 }}>双击节点编辑 | 右键连线切换虚/实线 | Shift+框选多节点拖拽 | Ctrl+Z 撤回 | 双击画布名重命名</span>
      </div>
      <TabBar
        canvases={canvases}
        activeId={activeId}
        onSwitch={handleSwitch}
        onAdd={handleAdd}
        onDelete={handleDelete}
        onRename={handleRename}
      />
      <GraphEditor
        key={activeId}
        nodes={activeCanvas.nodes}
        edges={activeCanvas.edges}
        onSave={handleSaveCanvas}
      />
    </div>
  )
}
