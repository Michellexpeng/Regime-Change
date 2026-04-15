import { useState, useRef } from 'react'
import { createPortal } from 'react-dom'

interface Props {
  text: string
  width?: number
}

/**
 * Hover ⓘ icon that renders the tooltip via a React portal at document root,
 * so it always appears above every overflow-hidden/scroll container.
 */
export function InfoTooltip({ text, width = 240 }: Props) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  function handleMouseEnter() {
    if (!ref.current) return
    const rect = ref.current.getBoundingClientRect()
    // Prefer showing to the right; clamp to stay inside viewport
    let left = rect.right + 6
    if (left + width > window.innerWidth - 8) {
      left = rect.left - width - 6
    }
    setPos({ top: rect.top, left })
  }

  function handleMouseLeave() {
    setPos(null)
  }

  return (
    <>
      <div
        ref={ref}
        className="inline-flex items-center cursor-help select-none"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <svg
          width="11" height="11" viewBox="0 0 12 12" fill="none"
          aria-label="More information"
          role="img"
          className="text-t3 hover:text-t2 transition-colors duration-100"
        >
          <circle cx="6" cy="6" r="5.5" stroke="currentColor" strokeWidth="1" />
          <line x1="6" y1="5.2" x2="6" y2="9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          <circle cx="6" cy="3.5" r="0.65" fill="currentColor" />
        </svg>
      </div>

      {pos && createPortal(
        <div
          className="fixed z-[9999] bg-card border border-border/90 rounded-md px-3 py-2.5 shadow-2xl pointer-events-none"
          style={{ top: pos.top, left: pos.left, width }}
        >
          <p className="text-[10.5px] text-t2 font-sans leading-relaxed">{text}</p>
        </div>,
        document.body,
      )}
    </>
  )
}
