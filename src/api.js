const API_BASE = '/api'

export async function fetchGraph() {
  const res = await fetch(`${API_BASE}/graph`)
  if (!res.ok) throw new Error('加载图谱失败')
  return res.json()
}

export async function saveGraph(graphData) {
  const res = await fetch(`${API_BASE}/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(graphData)
  })
  if (!res.ok) throw new Error('保存失败')
  return res.json()
}
