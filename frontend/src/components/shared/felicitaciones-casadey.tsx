import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const STORAGE_KEY = 'felicidades_dr_casadey_v1'
const DURATION_MS = 12_000

const CONFETTI_COLORS = [
  '#FFD700', '#FF6B6B', '#4ECDC4', '#96E6A1', '#DDA0DD',
  '#F7DC6F', '#45B7D1', '#FF8C42', '#FF6FA8', '#A8E063',
]

type Particle = {
  x: number; y: number; vx: number; vy: number
  w: number; h: number; color: string
  angle: number; spin: number; shape: 0 | 1
  alpha: number
}

function makeParticle(W: number, burst?: { x: number; y: number }): Particle {
  const angle = burst
    ? Math.random() * Math.PI - Math.PI / 2 - Math.PI / 4
    : Math.random() * Math.PI * 2

  const speed = burst ? Math.random() * 18 + 8 : Math.random() * 3 + 1.5
  return {
    x: burst ? burst.x : Math.random() * W,
    y: burst ? burst.y : -Math.random() * 40,
    vx: burst ? Math.cos(angle) * speed : (Math.random() - 0.5) * 3,
    vy: burst ? Math.sin(angle) * speed : Math.random() * 2.5 + 1.5,
    w: Math.random() * 13 + 5,
    h: Math.random() * 7 + 3,
    color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
    angle: Math.random() * Math.PI * 2,
    spin: (Math.random() - 0.5) * 0.18,
    shape: Math.random() > 0.55 ? 1 : 0,
    alpha: 1,
  }
}

function runConfetti(canvas: HTMLCanvasElement): () => void {
  const ctx = canvas.getContext('2d')!
  canvas.width = window.innerWidth
  canvas.height = window.innerHeight
  const W = canvas.width
  const H = canvas.height

  // Continuous rain
  const rain: Particle[] = Array.from({ length: 160 }, () => ({
    ...makeParticle(W),
    y: Math.random() * H * 1.2 - H * 0.2,
  }))

  // Initial bursts from bottom corners
  const bursts: Particle[] = [
    ...Array.from({ length: 60 }, () => makeParticle(W, { x: 0, y: H })),
    ...Array.from({ length: 60 }, () => makeParticle(W, { x: W, y: H })),
    ...Array.from({ length: 30 }, () => makeParticle(W, { x: W / 2, y: H })),
  ]

  let running = true

  function draw() {
    if (!running) return
    ctx.clearRect(0, 0, W, H)

    for (const p of [...bursts, ...rain]) {
      if (p.alpha <= 0) continue
      ctx.save()
      ctx.globalAlpha = p.alpha
      ctx.translate(p.x, p.y)
      ctx.rotate(p.angle)
      ctx.fillStyle = p.color
      if (p.shape === 1) {
        ctx.beginPath()
        ctx.arc(0, 0, p.w / 2.5, 0, Math.PI * 2)
        ctx.fill()
      } else {
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h)
      }
      ctx.restore()

      p.x += p.vx
      p.y += p.vy
      p.angle += p.spin
      p.vx *= 0.995
      p.vy += 0.12 // gravity
    }

    // Burst particles fade/die
    for (const p of bursts) {
      if (p.vy > 15) p.alpha -= 0.015
    }

    // Rain recycles
    for (const p of rain) {
      if (p.y > H + 20) {
        p.y = -15
        p.x = Math.random() * W
        p.vx = (Math.random() - 0.5) * 3
        p.vy = Math.random() * 2.5 + 1.5
        p.alpha = 1
      }
    }

    requestAnimationFrame(draw)
  }

  draw()
  return () => { running = false }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FelicitacionesCasadey() {
  const [visible, setVisible] = useState(() => !localStorage.getItem(STORAGE_KEY))
  const [progress, setProgress] = useState(100)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  function dismiss() {
    localStorage.setItem(STORAGE_KEY, '1')
    setVisible(false)
  }

  useEffect(() => {
    if (!visible || !canvasRef.current) return
    const stop = runConfetti(canvasRef.current)
    const step = 100 / (DURATION_MS / 100)
    let p = 100
    const interval = setInterval(() => {
      p -= step
      setProgress(Math.max(0, p))
    }, 100)
    const timer = setTimeout(dismiss, DURATION_MS)
    return () => { stop(); clearInterval(interval); clearTimeout(timer) }
  }, [visible])

  if (!visible) return null

  return createPortal(
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'radial-gradient(ellipse at center, rgba(10,10,30,0.92) 0%, rgba(5,5,20,0.97) 100%)',
      }}
      onClick={dismiss}
    >
      {/* Confetti canvas */}
      <canvas
        ref={canvasRef}
        style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
      />

      {/* Card */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative', zIndex: 1,
          textAlign: 'center',
          padding: '3rem 3.5rem',
          borderRadius: '1.5rem',
          background: 'rgba(255,255,255,0.05)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(255,215,0,0.3)',
          boxShadow: '0 0 80px rgba(255,215,0,0.15), 0 0 200px rgba(255,100,100,0.08)',
          maxWidth: '90vw',
          animation: 'casadey-pop 0.6s cubic-bezier(0.34,1.56,0.64,1) both',
        }}
      >
        {/* Top emojis */}
        <div style={{ fontSize: '3rem', lineHeight: 1, marginBottom: '1rem', animation: 'casadey-bounce 1.2s ease-in-out infinite alternate' }}>
          🎉🎊🎓
        </div>

        {/* Main title */}
        <h1
          style={{
            fontSize: 'clamp(2rem, 6vw, 3.5rem)',
            fontWeight: 900,
            letterSpacing: '-0.02em',
            lineHeight: 1.05,
            marginBottom: '0.5rem',
            background: 'linear-gradient(135deg, #FFD700 0%, #FF6FA8 40%, #4ECDC4 80%, #FFD700 100%)',
            backgroundSize: '200% 200%',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            animation: 'casadey-shimmer 3s linear infinite',
          }}
        >
          ¡FELICITACIONES
        </h1>
        <h1
          style={{
            fontSize: 'clamp(2.2rem, 7vw, 4rem)',
            fontWeight: 900,
            letterSpacing: '-0.02em',
            lineHeight: 1.05,
            marginBottom: '1.25rem',
            background: 'linear-gradient(135deg, #FFD700 0%, #FF6FA8 40%, #4ECDC4 80%, #FFD700 100%)',
            backgroundSize: '200% 200%',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            animation: 'casadey-shimmer 3s linear infinite',
          }}
        >
          DOCTOR CASADEY!
        </h1>

        {/* Subtitle */}
        <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: '1rem', fontStyle: 'italic', marginBottom: '0.25rem' }}>
          Abogado de la República Argentina
        </p>
        <p style={{ color: 'rgba(255,215,0,0.8)', fontSize: '0.875rem', fontWeight: 600, letterSpacing: '0.08em', marginBottom: '2rem' }}>
          DR. FACUNDO CASADEY · MATRÍCULA 2026
        </p>

        {/* Bottom emojis */}
        <div style={{ fontSize: '2rem', marginBottom: '1.5rem', animation: 'casadey-wobble 2s ease-in-out infinite' }}>
          🥂 ⚖️ 🎖️ 🥂
        </div>

        {/* Progress bar */}
        <div style={{ height: 3, background: 'rgba(255,255,255,0.1)', borderRadius: 2, overflow: 'hidden', marginBottom: '1rem' }}>
          <div
            style={{
              height: '100%', borderRadius: 2,
              width: `${progress}%`,
              background: 'linear-gradient(90deg, #FFD700, #FF6FA8)',
              transition: 'width 0.1s linear',
            }}
          />
        </div>

        <button
          onClick={dismiss}
          style={{
            background: 'rgba(255,255,255,0.1)',
            border: '1px solid rgba(255,255,255,0.2)',
            color: 'rgba(255,255,255,0.6)',
            borderRadius: 8,
            padding: '0.5rem 1.5rem',
            cursor: 'pointer',
            fontSize: '0.8rem',
            transition: 'background 0.2s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.18)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.1)')}
        >
          Cerrar
        </button>
      </div>

      <style>{`
        @keyframes casadey-pop {
          from { opacity: 0; transform: scale(0.5) rotate(-5deg); }
          to   { opacity: 1; transform: scale(1) rotate(0deg); }
        }
        @keyframes casadey-shimmer {
          0%   { background-position: 0% 50%; }
          100% { background-position: 200% 50%; }
        }
        @keyframes casadey-bounce {
          from { transform: translateY(0) scale(1); }
          to   { transform: translateY(-12px) scale(1.05); }
        }
        @keyframes casadey-wobble {
          0%,100% { transform: rotate(-4deg) scale(1); }
          50%     { transform: rotate(4deg) scale(1.08); }
        }
      `}</style>
    </div>,
    document.body,
  )
}
