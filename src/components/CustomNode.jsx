import { memo, useState } from 'react'
import { Handle, Position } from '@xyflow/react'

// source = 出边（右侧、底部），target = 入边（左侧、顶部）
// 避免每边同时有 source+target 导致箭头方向反转
const HANDLE_CONFIG = [
  { id: 'source-right',  type: 'source', position: Position.Right },
  { id: 'source-bottom', type: 'source', position: Position.Bottom },
  { id: 'target-left',   type: 'target', position: Position.Left },
  { id: 'target-top',    type: 'target', position: Position.Top },
]

export function NodeEditModal({ nodeId, label, comment, allNodeIds, onConfirm, onCancel }) {
  const [newId, setNewId] = useState(nodeId || '')
  const [newLabel, setNewLabel] = useState(label || '')
  const [newComment, setNewComment] = useState(comment || '')
  const [idError, setIdError] = useState('')

  const handleConfirm = () => {
    const trimmed = newId.trim()
    if (!trimmed) {
      setIdError('ID 不能为空')
      return
    }
    if (trimmed !== nodeId && allNodeIds.includes(trimmed)) {
      setIdError('ID 重复，请使用唯一 ID')
      return
    }
    onConfirm(trimmed, newLabel, newComment)
  }

  return (
    <div
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(0,0,0,.3)', display: 'flex',
        alignItems: 'center', justifyContent: 'center', zIndex: 9999
      }}
      onClick={onCancel}
    >
      <div
        style={{
          background: '#fff', borderRadius: 8, padding: 20,
          minWidth: 420, maxWidth: 560, boxShadow: '0 4px 20px rgba(0,0,0,.2)'
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>编辑节点</div>

        <label style={{ display: 'block', fontSize: 12, color: '#666', marginBottom: 4 }}>ID（必填，不可与已有节点重复）</label>
        <input
          value={newId}
          onChange={e => { setNewId(e.target.value); setIdError('') }}
          autoFocus
          style={{
            width: '100%', padding: '6px 8px', borderRadius: 4,
            border: `1px solid ${idError ? '#e53935' : '#ccc'}`,
            fontSize: 12, fontFamily: 'monospace', marginBottom: idError ? 2 : 10,
            outline: 'none'
          }}
        />
        {idError && (
          <div style={{ color: '#e53935', fontSize: 11, marginBottom: 10 }}>{idError}</div>
        )}

        <label style={{ display: 'block', fontSize: 12, color: '#666', marginBottom: 4 }}>名称</label>
        <input
          value={newLabel}
          onChange={e => setNewLabel(e.target.value)}
          style={{
            width: '100%', padding: '6px 8px', borderRadius: 4,
            border: '1px solid #ccc', fontSize: 13, marginBottom: 10,
            fontFamily: 'inherit'
          }}
        />

        <label style={{ display: 'block', fontSize: 12, color: '#666', marginBottom: 4 }}>注释</label>
        <textarea
          value={newComment}
          onChange={e => setNewComment(e.target.value)}
          placeholder="输入备注、说明..."
          rows={6}
          style={{
            width: '100%', padding: '6px 8px', borderRadius: 4,
            border: '1px solid #ccc', fontSize: 13, marginBottom: 12,
            resize: 'vertical', fontFamily: 'inherit'
          }}
        />

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            style={{ padding: '6px 14px', border: '1px solid #ccc', borderRadius: 4, background: '#fff', cursor: 'pointer' }}
          >
            取消
          </button>
          <button
            onClick={handleConfirm}
            style={{ padding: '6px 14px', border: 'none', borderRadius: 4, background: '#1976d2', color: '#fff', cursor: 'pointer' }}
          >
            确定
          </button>
        </div>
      </div>
    </div>
  )
}

export default memo(function CustomNode({ id, data }) {
  const isDataWorks = data.origin === 'DataWorks'
  const bgColor = isDataWorks ? '#1976d2' : '#f57c00'

  return (
    <div
      style={{
        background: bgColor,
        color: '#fff',
        border: `2px solid ${bgColor}`,
        borderRadius: 6,
        padding: '8px 14px 10px',
        minWidth: 140,
        maxWidth: 280,
        fontSize: 13,
        fontWeight: 600,
        textAlign: 'center',
        wordBreak: 'break-word',
        whiteSpace: 'pre-wrap',
        lineHeight: 1.5,
        position: 'relative'
      }}
    >
      {HANDLE_CONFIG.map(h => (
        <Handle
          key={h.id}
          id={h.id}
          type={h.type}
          position={h.position}
          style={{
            width: 9,
            height: 9,
            background: '#fff',
            border: `2px solid ${bgColor}`
          }}
        />
      ))}
      <div>{data.label}</div>
      {data.comment ? (
        <div
          style={{
            fontSize: 11,
            fontWeight: 400,
            opacity: 0.85,
            marginTop: 4,
            borderTop: '1px solid rgba(255,255,255,.25)',
            paddingTop: 4,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            textAlign: 'left'
          }}
        >
          {data.comment}
        </div>
      ) : null}
      <div
        style={{
          fontSize: 10,
          fontWeight: 400,
          opacity: 0.55,
          marginTop: data.comment ? 2 : 6,
          fontFamily: 'monospace'
        }}
      >
        {id}
      </div>
    </div>
  )
})
