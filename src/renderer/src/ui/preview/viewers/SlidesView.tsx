// Presentaciones de PowerPoint (.pptx) en el panel de vista previa: las diapositivas una debajo de otra, del ancho
// del panel, con su número. Las lee pptx.ts; aquí solo se pintan (cajas con posición absoluta y una escala).
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { BarChart3, EyeOff, Film, Network, Shapes } from 'lucide-react'
import { t } from '@/lib/i18n'
import { errorText } from '../../common/util'
import { MAX_SLIDES, readPptx, type Box, type Deck, type Item, type Para, type Slide, type TextBody } from './pptx'
import { useBytes, useWidth, ViewerBusy, ViewerFail } from './shared'
import s from './viewers.module.css'

type Parsed = { status: 'loading' } | { status: 'ready'; deck: Deck & { total: number } } | { status: 'error'; message: string }

/** Recortes de las formas más usadas (lo demás se pinta como rectángulo). */
const CLIP: Record<string, string> = {
  triangle: 'polygon(50% 0, 100% 100%, 0 100%)',
  rtTriangle: 'polygon(0 0, 100% 100%, 0 100%)',
  diamond: 'polygon(50% 0, 100% 50%, 50% 100%, 0 50%)',
  parallelogram: 'polygon(25% 0, 100% 0, 75% 100%, 0 100%)',
  trapezoid: 'polygon(25% 0, 75% 0, 100% 100%, 0 100%)',
  pentagon: 'polygon(50% 0, 100% 38%, 82% 100%, 18% 100%, 0 38%)',
  hexagon: 'polygon(25% 0, 75% 0, 100% 50%, 75% 100%, 25% 100%, 0 50%)',
  octagon: 'polygon(29% 0, 71% 0, 100% 29%, 100% 71%, 71% 100%, 29% 100%, 0 71%, 0 29%)',
  rightArrow: 'polygon(0 25%, 60% 25%, 60% 0, 100% 50%, 60% 100%, 60% 75%, 0 75%)',
  leftArrow: 'polygon(100% 25%, 40% 25%, 40% 0, 0 50%, 40% 100%, 40% 75%, 100% 75%)',
  upArrow: 'polygon(25% 100%, 25% 40%, 0 40%, 50% 0, 100% 40%, 75% 40%, 75% 100%)',
  downArrow: 'polygon(25% 0, 75% 0, 75% 60%, 100% 60%, 50% 100%, 0 60%, 25% 60%)',
  chevron: 'polygon(0 0, 75% 0, 100% 50%, 75% 100%, 0 100%, 25% 50%)',
  homePlate: 'polygon(0 0, 80% 0, 100% 50%, 80% 100%, 0 100%)',
  star5: 'polygon(50% 0, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)'
}

export default function SlidesView({ url }: { url: string }) {
  const bytes = useBytes(url)
  const [parsed, setParsed] = useState<Parsed>({ status: 'loading' })
  const scrollRef = useRef<HTMLDivElement>(null)
  const width = useWidth(scrollRef)

  useEffect(() => {
    if (bytes.status === 'error') return setParsed({ status: 'error', message: bytes.message })
    if (bytes.status !== 'ready') return
    // Un respiro para que se vea «Abriendo…» antes de leer (con muchas diapositivas tarda un momento).
    const id = window.setTimeout(() => {
      try {
        setParsed({ status: 'ready', deck: readPptx(bytes.data) })
      } catch (e) {
        setParsed({ status: 'error', message: t('La presentación parece dañada o no es un PowerPoint moderno (.pptx): {error}', { error: errorText(e) }) })
      }
    }, 0)
    return () => window.clearTimeout(id)
  }, [bytes])

  const deck = parsed.status === 'ready' ? parsed.deck : null
  const urls = useMemo(() => {
    const map = new Map<string, string>()
    if (!deck) return map
    for (const [path, data] of deck.media) {
      const ext = path.split('.').pop()?.toLowerCase() ?? 'png'
      const type = ext === 'svg' ? 'image/svg+xml' : ext === 'jpg' ? 'image/jpeg' : ext.startsWith('tif') ? 'image/tiff' : `image/${ext}`
      map.set(path, URL.createObjectURL(new Blob([data as BlobPart], { type })))
    }
    return map
  }, [deck])
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls])

  if (parsed.status === 'error') return <ViewerFail message={parsed.message} />
  const avail = Math.max(120, width - 32)
  return (
    <div className={s.slides} ref={scrollRef}>
      {!deck ? (
        <ViewerBusy label={t('Abriendo la presentación…')} />
      ) : deck.slides.length === 0 ? (
        <div className={s.state}>{t('La presentación no tiene diapositivas.')}</div>
      ) : (
        <>
          {deck.slides.map((slide, i) => (
            <figure key={i} className={s.slideFigure}>
              <SlideView slide={slide} deck={deck} scale={avail / deck.width} urls={urls} label={t('Diapositiva {n}', { n: i + 1 })} />
              <figcaption className={s.slideNum}>
                {i + 1}
                {slide.hidden && (
                  <span className={s.slideHidden}>
                    <EyeOff size={12} aria-hidden="true" /> {t('Oculta')}
                  </span>
                )}
              </figcaption>
            </figure>
          ))}
          {deck.total > MAX_SLIDES && (
            <p className={s.sheetNote}>{t('Se ven las primeras {n} diapositivas de {total}.', { n: MAX_SLIDES, total: deck.total })}</p>
          )}
        </>
      )}
    </div>
  )
}

function SlideView({ slide, deck, scale, urls, label }: { slide: Slide; deck: Deck; scale: number; urls: Map<string, string>; label: string }) {
  const bgImage = slide.backgroundImage ? urls.get(slide.backgroundImage) : undefined
  return (
    <div className={s.slideFrame} style={{ width: deck.width * scale, height: deck.height * scale }} role="img" aria-label={label}>
      <div
        className={s.slide}
        style={{
          width: deck.width,
          height: deck.height,
          transform: `scale(${scale})`,
          background: slide.background,
          backgroundImage: bgImage ? `url("${bgImage}")` : undefined
        }}
      >
        {slide.items.map((item, i) => (
          <ItemView key={i} item={item} urls={urls} />
        ))}
      </div>
    </div>
  )
}

function boxStyle(b: Box): CSSProperties {
  const tf: string[] = []
  if (b.rot) tf.push(`rotate(${b.rot}deg)`)
  if (b.flipH) tf.push('scaleX(-1)')
  if (b.flipV) tf.push('scaleY(-1)')
  return { left: b.x, top: b.y, width: b.w, height: b.h, transform: tf.length ? tf.join(' ') : undefined }
}

function ItemView({ item, urls }: { item: Item; urls: Map<string, string> }) {
  switch (item.kind) {
    case 'shape': {
      const style: CSSProperties = { ...boxStyle(item.box) }
      const custom = item.geom === 'custom' && item.path
      if (!custom) {
        if (item.fill) style.background = item.fill
        if (item.line) style.border = `${item.line.width}px ${item.line.dash ? 'dashed' : 'solid'} ${item.line.color}`
        if (item.geom === 'ellipse') style.borderRadius = '50%'
        else if (item.radius) style.borderRadius = item.radius
        else if (CLIP[item.geom]) style.clipPath = CLIP[item.geom]
      }
      return (
        <div className={s.shape} style={style}>
          {custom && (
            <svg className={s.shapeSvg} viewBox={`0 0 ${item.box.w} ${item.box.h}`} preserveAspectRatio="none" aria-hidden="true">
              {item.path!.map((p, i) => (
                <path
                  key={i}
                  d={p.d}
                  transform={p.w && p.h ? `scale(${item.box.w / p.w} ${item.box.h / p.h})` : undefined}
                  fill={item.fill && !item.fill.includes('gradient') ? item.fill : item.fill ? 'currentColor' : 'none'}
                  stroke={item.line?.color ?? 'none'}
                  strokeWidth={item.line?.width ?? 0}
                  vectorEffect="non-scaling-stroke"
                />
              ))}
            </svg>
          )}
          {item.text && <TextView body={item.text} flip={item.box.flipH || item.box.flipV} />}
        </div>
      )
    }
    case 'line': {
      const { box, line } = item
      const x1 = box.flipH ? box.w : 0
      const x2 = box.flipH ? 0 : box.w
      const y1 = box.flipV ? box.h : 0
      const y2 = box.flipV ? 0 : box.h
      return (
        <svg className={s.shape} style={{ ...boxStyle({ ...box, flipH: false, flipV: false }), overflow: 'visible' }} aria-hidden="true">
          <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={line.color} strokeWidth={line.width} strokeDasharray={line.dash ? `${line.width * 4} ${line.width * 3}` : undefined} />
        </svg>
      )
    }
    case 'pic': {
      const src = urls.get(item.media)
      if (!src) return null
      const [l, tp, r, b] = item.crop ?? [0, 0, 0, 0]
      const w = 1 - l - r || 1
      const h = 1 - tp - b || 1
      const style: CSSProperties = { ...boxStyle(item.box), overflow: 'hidden' }
      if (item.geom === 'ellipse') style.borderRadius = '50%'
      else if (item.geom === 'roundRect') style.borderRadius = Math.min(item.box.w, item.box.h) * 0.1667
      return (
        <div className={s.shape} style={style}>
          <img
            src={src}
            alt=""
            draggable={false}
            style={{ position: 'absolute', width: `${100 / w}%`, height: `${100 / h}%`, left: `${(-l / w) * 100}%`, top: `${(-tp / h) * 100}%`, maxWidth: 'none' }}
          />
        </div>
      )
    }
    case 'table':
      return (
        <div className={s.shape} style={boxStyle(item.box)}>
          <table className={s.slideTable}>
            <colgroup>
              {item.cols.map((w, i) => (
                <col key={i} style={{ width: w }} />
              ))}
            </colgroup>
            <tbody>
              {item.rows.map((row, ri) => (
                <tr key={ri} style={{ height: row.h }}>
                  {row.cells.map((cell, ci) =>
                    cell ? (
                      <td key={ci} colSpan={cell.colSpan} rowSpan={cell.rowSpan} style={{ background: cell.fill }}>
                        <TextView body={cell.text} inCell />
                      </td>
                    ) : null
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    case 'missing': {
      const Icon = item.label === 'chart' ? BarChart3 : item.label === 'diagram' ? Network : item.label === 'media' ? Film : Shapes
      const text = item.label === 'chart' ? t('Gráfico') : item.label === 'diagram' ? t('Diagrama') : item.label === 'media' ? t('Imagen o vídeo') : t('Objeto')
      return (
        <div className={s.slideMissing} style={boxStyle(item.box)} title={t('Este elemento solo se ve en PowerPoint')}>
          <Icon size={Math.max(16, Math.min(item.box.w, item.box.h) / 5)} aria-hidden="true" />
          <span>{text}</span>
        </div>
      )
    }
  }
}

function TextView({ body, inCell, flip }: { body: TextBody; inCell?: boolean; flip?: boolean }) {
  const [l, tp, r, b] = body.insets
  return (
    <div
      className={inCell ? s.cellText : s.text}
      style={{
        padding: `${tp}px ${r}px ${b}px ${l}px`,
        justifyContent: body.anchor === 'middle' ? 'center' : body.anchor === 'bottom' ? 'flex-end' : 'flex-start',
        whiteSpace: body.wrap ? 'pre-wrap' : 'pre',
        // Si la forma está volteada, el texto no (PowerPoint lo deja derecho).
        transform: flip ? 'scale(-1, -1)' : undefined
      }}
    >
      {body.paras.map((p, i) => (
        <ParaView key={i} p={p} />
      ))}
    </div>
  )
}

function ParaView({ p }: { p: Para }) {
  const first = p.runs.find((r) => r.text) ?? null
  const size = first?.size ?? p.emptySize
  const style: CSSProperties = {
    textAlign: p.align,
    paddingLeft: p.marL,
    textIndent: p.bullet ? 0 : p.indent,
    lineHeight: p.line ? p.line * 1.2 : 1.2,
    marginTop: p.before,
    marginBottom: p.after,
    fontSize: size
  }
  if (!p.runs.some((r) => r.text)) return <p className={s.para} style={style}>{' '}</p>
  return (
    <p className={s.para} style={style}>
      {p.bullet && (
        <span
          className={s.bullet}
          style={{ marginLeft: p.indent, width: Math.max(0, -p.indent) || undefined, color: p.bullet.color, fontSize: p.bullet.size ?? size }}
        >
          {p.bullet.char}
        </span>
      )}
      {p.runs.map((r, i) =>
        r.br ? (
          <br key={i} />
        ) : (
          <span
            key={i}
            style={{
              fontSize: r.size,
              fontWeight: r.bold ? 700 : undefined,
              fontStyle: r.italic ? 'italic' : undefined,
              textDecoration: [r.underline && 'underline', r.strike && 'line-through'].filter(Boolean).join(' ') || undefined,
              color: r.color,
              fontFamily: r.font ? `"${r.font}", var(--font-sans, system-ui), sans-serif` : undefined
            }}
          >
            {r.text}
          </span>
        )
      )}
    </p>
  )
}
