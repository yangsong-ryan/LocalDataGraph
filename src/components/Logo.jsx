export default function Logo({ size = 32 }) {
  const scale = size / 32

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8 * scale,
        flexShrink: 0,
        userSelect: 'none'
      }}
    >
      {/* 图标区 */}
      <div
        style={{
          width: size,
          height: size,
          borderRadius: size * 0.22,
          background: 'linear-gradient(145deg, #1a1a2e 0%, #16213e 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          boxShadow: '0 2px 12px rgba(99, 102, 241, 0.25)'
        }}
      >
        <svg
          width={size * 0.75}
          height={size * 0.75}
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            {/* 普通连线渐变 */}
            <linearGradient id="edgeDim" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#4a5568" />
              <stop offset="100%" stopColor="#718096" />
            </linearGradient>
            {/* 点亮连线渐变 — 呼吸灯效果 */}
            <linearGradient id="edgeGlow" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#6366f1">
                <animate
                  attributeName="stop-color"
                  values="#6366f1;#a855f7;#6366f1"
                  dur="2s"
                  repeatCount="indefinite"
                />
              </stop>
              <stop offset="100%" stopColor="#a855f7">
                <animate
                  attributeName="stop-color"
                  values="#a855f7;#6366f1;#a855f7"
                  dur="2s"
                  repeatCount="indefinite"
                />
              </stop>
            </linearGradient>
            {/* 发光节点 */}
            <radialGradient id="nodeGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#a855f7" stopOpacity="0.6" />
              <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* 节点发光圈 */}
          <circle cx="4" cy="8" r="4" fill="url(#nodeGlow)" />
          <circle cx="12" cy="4" r="4" fill="url(#nodeGlow)" />
          <circle cx="20" cy="10" r="4" fill="url(#nodeGlow)" />

          {/* 节点实体 */}
          <circle cx="4" cy="8" r="2.5" fill="#c4b5fd" />
          <circle cx="12" cy="4" r="2.5" fill="#c4b5fd" />
          <circle cx="20" cy="10" r="2.5" fill="#c4b5fd" />

          {/* 普通连线: 节点2 → 节点1 */}
          <line
            x1="12" y1="4" x2="4" y2="8"
            stroke="url(#edgeDim)"
            strokeWidth="1"
            strokeLinecap="round"
          />

          {/* 点亮连线: 节点1 → 节点3（隐性血缘）*/}
          <line
            x1="4" y1="8" x2="20" y2="10"
            stroke="url(#edgeGlow)"
            strokeWidth="1.5"
            strokeLinecap="round"
            style={{ filter: 'drop-shadow(0 0 3px rgba(168, 85, 247, 0.6))' }}
          >
            <animate
              attributeName="opacity"
              values="0.6;1;0.6"
              dur="2s"
              repeatCount="indefinite"
            />
          </line>

          {/* 普通连线: 节点2 → 节点3 */}
          <line
            x1="12" y1="4" x2="20" y2="10"
            stroke="url(#edgeDim)"
            strokeWidth="1"
            strokeLinecap="round"
          />
        </svg>
      </div>

    </div>
  )
}
