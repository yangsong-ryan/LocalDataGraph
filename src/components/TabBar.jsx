import { useState, useRef } from 'react'

export default function TabBar({ canvases, activeId, onSwitch, onAdd, onDelete, onRename }) {
  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName] = useState('')
  const inputRef = useRef(null)

  const startRename = (canvas) => {
    setEditingId(canvas.id)
    setEditName(canvas.name)
    setTimeout(() => inputRef.current?.select(), 0)
  }

  const confirmRename = () => {
    if (editName.trim() && editingId) {
      onRename(editingId, editName.trim())
    }
    setEditingId(null)
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 2,
      background: '#e8e8e8', padding: '4px 8px 0',
      flexShrink: 0, overflow: 'auto'
    }}>
      {canvases.map(c => (
        <div
          key={c.id}
          onClick={() => onSwitch(c.id)}
          onDoubleClick={() => startRename(c)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 12px',
            borderRadius: '6px 6px 0 0',
            cursor: 'pointer',
            fontSize: 13,
            fontWeight: c.id === activeId ? 600 : 400,
            background: c.id === activeId ? '#fff' : 'transparent',
            color: c.id === activeId ? '#333' : '#666',
            border: c.id === activeId ? '1px solid #ddd' : '1px solid transparent',
            borderBottom: c.id === activeId ? '1px solid #fff' : 'none',
            marginBottom: -1,
            userSelect: 'none',
            whiteSpace: 'nowrap',
            flexShrink: 0,
            position: 'relative'
          }}
        >
          {editingId === c.id ? (
            <input
              ref={inputRef}
              value={editName}
              onChange={e => setEditName(e.target.value)}
              onBlur={confirmRename}
              onKeyDown={e => {
                if (e.key === 'Enter') confirmRename()
                if (e.key === 'Escape') setEditingId(null)
              }}
              onClick={e => e.stopPropagation()}
              style={{
                width: 100, padding: '2px 4px', fontSize: 12,
                border: '1px solid #1976d2', borderRadius: 2,
                outline: 'none', fontFamily: 'inherit'
              }}
            />
          ) : (
            c.name
          )}
          {canvases.length > 1 && (
            <span
              onClick={e => {
                e.stopPropagation()
                if (confirm('确定删除画布「' + c.name + '」？')) onDelete(c.id)
              }}
              title="删除画布"
              style={{
                fontSize: 14, lineHeight: 1, cursor: 'pointer',
                color: '#999', marginLeft: 2, padding: '0 2px'
              }}
            >
              ×
            </span>
          )}
        </div>
      ))}
      <button
        onClick={onAdd}
        title="新建画布"
        style={{
          padding: '4px 10px', marginLeft: 4, marginBottom: 4,
          border: 'none', background: 'transparent', color: '#1976d2',
          fontSize: 18, cursor: 'pointer', borderRadius: 4, lineHeight: 1
        }}
      >
        +
      </button>
    </div>
  )
}
