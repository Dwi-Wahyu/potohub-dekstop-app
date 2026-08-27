import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router'
import { useStickers, EmojiPicker, StickerCanvas } from '@/components/EmojiStickers'
import { QRCodeSVG } from 'qrcode.react'
import { Camera, QrCode, Ticket, Check, Image, Printer, RefreshCcw, ArrowRight, ChevronLeft, ChevronRight, Delete } from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────
type Step = 'landing' | 'tutorial' | 'payment' | 'qris' | 'ticket' | 'frame' | 'session' | 'preview' | 'filter' | 'download'

// ── Constants ─────────────────────────────────────────────────────────────────
const BOOTH_NAME  = 'Senayan 01'
const PRICE_BASE  = 35000
const FILTERS = [
  { id: 'Original', name: 'Original', style: '' },
  { id: 'B&W',      name: 'B&W',      style: 'grayscale' },
  { id: 'Sepia',    name: 'Sepia',    style: 'sepia' },
  { id: 'Cool',     name: 'Cool',     style: 'saturate-50' },
  { id: 'Warm',     name: 'Warm',     style: 'brightness-110' },
]

const STEPPER_LABELS = ['Tutorial', 'Payment', 'Frames', 'Photo Session', 'Edit & Filter', 'Scan File']
const STEPPER_STEPS: Step[] = ['tutorial', 'payment', 'frame', 'session', 'filter', 'download']
const FRAME_CATEGORIES = ['ALL FRAMES', 'SERIES', 'MUSIC', 'IDOL', 'BIRTHDAY']

const FRAMES = [
  { id: 'strip-2x4', label: 'Strip 2×4',  cols: 2, rows: 4, cats: ['ALL FRAMES', 'SERIES'] },
  { id: 'grid-2x2',  label: 'Grid 2×2',   cols: 2, rows: 2, cats: ['ALL FRAMES', 'IDOL'] },
  { id: 'wide-1x3',  label: 'Wide 1×3',   cols: 1, rows: 3, cats: ['ALL FRAMES', 'MUSIC'] },
  { id: 'classic-4', label: 'Classic ×4', cols: 2, rows: 2, cats: ['ALL FRAMES', 'BIRTHDAY'] },
  { id: 'square-9',  label: 'Square ×9',  cols: 3, rows: 3, cats: ['ALL FRAMES', 'SERIES', 'IDOL'] },
  { id: 'panorama',  label: 'Panorama',   cols: 1, rows: 2, cats: ['ALL FRAMES', 'MUSIC'] },
]

const SERIF = "'Playfair Display', Georgia, serif"

// ── Decorative border ─────────────────────────────────────────────────────────
function ClassicBorder({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-5 pointer-events-none z-0">
      <div className="absolute inset-0 border-[3px] border-black rounded-[28px]" />
      <div className="absolute inset-[6px] border border-black/20 rounded-[23px]" />
      {/* corner ornaments */}
      {[
        'top-3 left-3', 'top-3 right-3', 'bottom-3 left-3', 'bottom-3 right-3',
      ].map(pos => (
        <div key={pos} className={`absolute ${pos} w-4 h-4`}>
          <div className="w-2 h-2 border-t-2 border-l-2 border-black absolute top-0 left-0" style={{ borderRadius: '2px 0 0 0' }} />
        </div>
      ))}
      {children}
    </div>
  )
}

// ── Stepper header ────────────────────────────────────────────────────────────
function StepperHeader({ step }: { step: Step }) {
  const activeIdx = STEPPER_STEPS.indexOf(step === 'preview' ? 'session' : step)
  return (
    <div
      className="w-full h-16 flex items-center justify-between px-10 border-b-2 border-black shrink-0 relative z-20 select-none"
      style={{ background: '#C7EED8' }}
    >
      {/* dot pattern */}
      <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, rgba(255,255,255,0.5) 1px, transparent 0)', backgroundSize: '24px 24px' }} />

      {/* stepper pills */}
      <div className="flex items-center gap-1 relative z-10">
        {STEPPER_LABELS.map((label, i) => {
          const isActive = i === activeIdx
          const isDone = i < activeIdx
          return (
            <div key={label} className="flex items-center">
              <div className={`px-4 py-1.5 rounded-full border-2 border-black font-bold text-xs transition-all ${
                isActive ? 'bg-[#C7EED8] text-black shadow-[4px_4px_0_0_rgba(0,0,0,1)]'
                : isDone  ? 'bg-black text-white border-black'
                : 'text-black/40 border-black/30 bg-transparent'
              }`}>
                {label}
              </div>
              {i < STEPPER_LABELS.length - 1 && (
                <div className={`w-6 h-px border-t border-black mx-0.5 ${isDone ? 'opacity-100' : 'opacity-30'}`} />
              )}
            </div>
          )
        })}
      </div>

      {/* brand */}
      <div className="flex items-center gap-2 relative z-10">
        <div className="w-8 h-8 rounded-xl border-2 border-black bg-white flex items-center justify-center text-[#2a2873] shadow-inner">
          <QrCode size={18} strokeWidth={2.5} />
        </div>
        <h1 className="text-black font-black text-xl m-0 tracking-wide drop-shadow-sm" style={{ fontFamily: "'Nunito', sans-serif" }}>POTOHUB</h1>
      </div>
    </div>
  )
}

// ── Frame preview miniature ───────────────────────────────────────────────────
function FrameMini({ cols, rows, active }: { cols: number; rows: number; active?: boolean }) {
  const cells = Array.from({ length: cols * rows })
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gridTemplateRows: `repeat(${rows}, 1fr)`,
        gap: '3px',
        aspectRatio: cols === 1 ? '2/3' : cols >= 3 ? '1/1' : '2/3',
        width: '100%',
      }}
    >
      {cells.map((_, i) => (
        <div key={i} style={{ background: active ? '#111' : '#e5e5e5', border: '1.5px solid', borderColor: active ? '#555' : '#bbb', borderRadius: '3px' }} />
      ))}
    </div>
  )
}

// ── Photo slot (simulated captured photo) ─────────────────────────────────────
function PhotoSlot({ filled, filter }: { filled: boolean; filter: string }) {
  const filterStyle: React.CSSProperties = {
    filter: filter === 'B&W' ? 'grayscale(100%)' : filter === 'Sepia' ? 'sepia(80%)' : filter === 'Cool' ? 'hue-rotate(30deg) saturate(0.8)' : filter === 'Warm' ? 'sepia(30%) saturate(1.2)' : 'none',
  }
  return (
    <div style={{ flex: 1, border: '2px solid black', display: 'flex', alignItems: 'center', justifyContent: 'center', background: filled ? '#d1d5db' : '#f3f4f6', ...filterStyle, position: 'relative', overflow: 'hidden' }}>
      {filled ? (
        <Camera size={20} style={{ opacity: 0.2 }} />
      ) : (
        <span style={{ fontSize: '18px', fontWeight: 700, color: '#aaa', fontFamily: SERIF }}></span>
      )}
    </div>
  )
}

function TicketInput({ onConfirm }: { onConfirm: () => void }) {
  const [code, setCode] = useState('')
  const [error, setError] = useState(false)
  function verify() {
    if (code.trim().length >= 4) { onConfirm() }
    else { setError(true); setTimeout(() => setError(false), 1500) }
  }
  return (
    <div className="flex flex-col items-center gap-3 w-full">
      <input
        value={code}
        onChange={e => setCode(e.target.value.toUpperCase())}
        onKeyDown={e => e.key === 'Enter' && verify()}
        placeholder="XXXX-XXXX-XXXX"
        className={`w-full text-center text-xl font-black tracking-[0.25em] border-[2.5px] rounded-2xl px-4 py-3 outline-none transition-colors ${error ? 'border-red-500 bg-red-50' : 'border-black bg-white focus:bg-gray-50'}`}
        style={{ fontFamily: "'Courier New', monospace" }}
      />
      {error && <p className="text-xs text-red-500 font-bold tracking-wider">Kode tidak valid</p>}
      <button
        onClick={verify}
        className="w-full py-4 bg-black text-white text-base font-bold tracking-[0.2em] uppercase rounded-full hover:bg-gray-900 transition-all shadow-[6px_6px_0_0_rgba(0,0,0,0.25)] hover:shadow-none hover:translate-x-[6px] hover:translate-y-[6px] active:scale-95"
      >
        Verifikasi Tiket ✓
      </button>
    </div>
  )
}

// ── V2 On-screen keyboard (black/white editorial style) ───────────────────────
const KB_ROWS_ALPHA = [
  ['q','w','e','r','t','y','u','i','o','p'],
  ['a','s','d','f','g','h','j','k','l'],
  ['SHIFT','z','x','c','v','b','n','m','⌫'],
]
const KB_ROWS_NUM = [
  ['1','2','3','4','5','6','7','8','9','0'],
  ['-','_','.','@','#','!','&','*','(',')',],
  ['ABC','/','\\',':',';',"'",'"',',','⌫'],
]

function V2Keyboard({ value, onChange, onDone }: { value: string; onChange: (v: string) => void; onDone: () => void }) {
  const [caps, setCaps] = useState(false)
  const [numMode, setNumMode] = useState(false)

  function press(key: string) {
    if (key === '⌫') { onChange(value.slice(0, -1)); return }
    if (key === 'SHIFT') { setCaps(c => !c); return }
    if (key === 'ABC') { setNumMode(false); return }
    if (key === '123') { setNumMode(true); return }
    const ch = caps && !numMode ? key.toUpperCase() : key
    onChange(value + ch)
    if (caps) setCaps(false)
  }

  const rows = numMode ? KB_ROWS_NUM : KB_ROWS_ALPHA

  return (
    <div className="flex flex-col gap-1.5 px-3 pb-4 pt-3" style={{ background: '#fff', borderTop: '3px solid #000' }}>
      {rows.map((row, ri) => (
        <div key={ri} className="flex gap-1.5 w-full">
          {row.map(key => {
            const isSpecial = key === 'SHIFT' || key === '⌫' || key === 'ABC' || key === '123'
            const isShiftActive = key === 'SHIFT' && caps
            return (
              <button
                key={key}
                onPointerDown={e => { e.preventDefault(); press(key) }}
                className="rounded-lg flex items-center justify-center font-bold transition-all active:scale-95 select-none border-[2px] border-black"
                style={{
                  height: 46,
                  flex: isSpecial ? '0 0 9%' : '1 1 0',
                  minWidth: 0,
                  background: isShiftActive ? '#000' : isSpecial ? '#f0f0f0' : '#fff',
                  color: isShiftActive ? '#fff' : '#000',
                  fontSize: key === '⌫' ? 14 : 16,
                  boxShadow: '2px 2px 0 0 #000',
                  fontFamily: "'Nunito', sans-serif",
                }}
              >
                {key === '⌫' ? <Delete size={15} /> : caps && !numMode && key.length === 1 ? key.toUpperCase() : key}
              </button>
            )
          })}
        </div>
      ))}

      {/* Bottom row */}
      <div className="flex w-full gap-1.5">
        <button
          onPointerDown={e => { e.preventDefault(); setNumMode(n => !n) }}
          className="rounded-lg flex items-center justify-center font-bold border-[2px] border-black active:scale-95"
          style={{ height: 46, flex: '0 0 9%', background: '#f0f0f0', fontSize: 13, boxShadow: '2px 2px 0 0 #000', fontFamily: "'Nunito', sans-serif" }}
        >
          {numMode ? 'ABC' : '123'}
        </button>
        <button
          onPointerDown={e => { e.preventDefault(); onChange(value + ' ') }}
          className="rounded-lg flex-1 flex items-center justify-center border-[2px] border-black active:scale-95"
          style={{ height: 46, background: '#fff', boxShadow: '2px 2px 0 0 #000', fontSize: 13, fontFamily: "'Nunito', sans-serif" }}
        >
          spasi
        </button>
        {['@', '.'].map(ch => (
          <button
            key={ch}
            onPointerDown={e => { e.preventDefault(); onChange(value + ch) }}
            className="rounded-lg flex items-center justify-center font-bold border-[2px] border-black active:scale-95"
            style={{ height: 46, flex: '0 0 7%', background: '#fff', fontSize: 17, boxShadow: '2px 2px 0 0 #000', fontFamily: "'Nunito', sans-serif" }}
          >
            {ch}
          </button>
        ))}
        <button
          onPointerDown={e => { e.preventDefault(); onDone() }}
          className="rounded-lg flex items-center justify-center font-black border-[2px] border-black active:scale-95"
          style={{ height: 46, flex: '0 0 13%', background: '#000', color: '#fff', fontSize: 13, boxShadow: '2px 2px 0 0 rgba(0,0,0,0.35)', fontFamily: "'Nunito', sans-serif" }}
        >
          Kirim
        </button>
      </div>
    </div>
  )
}

// ── Download / Softfile screen ────────────────────────────────────────────────
function DownloadStep({ boothName, onDone }: { boothName: string; onDone: () => void }) {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState(false)
  const [timer, setTimer] = useState(60)
  const [kbOpen, setKbOpen] = useState(false)

  useEffect(() => {
    if (!sent) return
    const t = setInterval(() => setTimer(s => (s > 0 ? s - 1 : 0)), 1000)
    return () => clearInterval(t)
  }, [sent])
  useEffect(() => { if (timer === 0) onDone() }, [timer, onDone])

  function handleSend() {
    const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
    if (!valid) { setError(true); setTimeout(() => setError(false), 1600); return }
    setSent(true)
    setKbOpen(false)
  }

  const sessionCode = `PH-${boothName.replace(/\s/g,'-').toUpperCase()}-${Date.now().toString(36).toUpperCase().slice(-6)}`
  const downloadUrl = `https://potohub.com/dl/${sessionCode.toLowerCase()}`

  return (
    <div className="w-screen h-screen bg-[#fafafa] flex flex-col relative overflow-hidden select-none" style={{ fontFamily: SERIF }}>
      <StepperHeader step="download" />
      <ClassicBorder><></></ClassicBorder>

      {/* Main — shifts up when keyboard open */}
      <div
        className="relative z-10 flex-1 flex items-center justify-center gap-12 px-16 py-8 transition-transform duration-300"
        style={{ transform: kbOpen ? 'translateY(-60px)' : 'translateY(0)' }}
      >
        {/* Left — session complete copy */}
        <div className="flex flex-col max-w-[300px]">
          <p className="text-xs tracking-[0.35em] uppercase text-black/30 mb-4 font-['Nunito',sans-serif] font-black">Session Complete</p>
          <h2 className="text-[56px] font-black uppercase tracking-tight leading-[0.9] mb-3">
            Thank<br />You
          </h2>
          <h3 className="text-xl font-bold italic text-black/50 mb-5">for printing with us!</h3>
          <div className="w-16 h-[3px] bg-black mb-5" />
          <p className="text-sm text-black/40 leading-relaxed">
            Fotomu sedang dicetak. Masukkan email untuk mendapatkan softfile, atau scan QR setelah mengirim email.
          </p>
          {sent && (
            <div className="mt-5 flex items-center gap-2 text-black/50 text-xs font-['Nunito',sans-serif] font-black tracking-[0.15em] uppercase">
              <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" strokeLinejoin="round"/></svg>
              Home dalam {timer}s
            </div>
          )}
          <button
            onClick={onDone}
            className="mt-6 self-start px-7 py-2.5 text-xs font-bold border-[2px] border-black rounded-full uppercase tracking-[0.18em] hover:bg-black hover:text-white transition-all active:scale-95 font-['Nunito',sans-serif]"
          >
            {sent ? 'Selesai' : 'Lewati →'}
          </button>
        </div>

        {/* Right — email card + QR */}
        <div className="flex flex-col gap-5">
          {/* Email card */}
          <div
            className="border-[3px] border-black rounded-3xl bg-white p-7 w-[380px] transition-all duration-500"
            style={{ boxShadow: sent ? '4px 4px 0 0 #000' : '12px 12px 0 0 #000' }}
          >
            {!sent ? (
              <>
                <p className="text-xs font-black uppercase tracking-[0.25em] mb-1 text-black/40 font-['Nunito',sans-serif]">Kirim Softfile</p>
                <p className="text-[13px] text-black/40 mb-5">Ketuk kolom email untuk membuka keyboard</p>

                <div className="flex flex-col gap-3">
                  {/* Tappable email display — opens keyboard */}
                  <div
                    onClick={() => setKbOpen(true)}
                    className="w-full border-[2.5px] rounded-2xl px-4 py-3 cursor-text flex items-center transition-all"
                    style={{
                      fontFamily: "'Courier New', monospace",
                      fontSize: 15,
                      fontWeight: 700,
                      borderColor: error ? '#ef4444' : kbOpen ? '#000' : '#d1d5db',
                      background: error ? '#fff5f5' : kbOpen ? '#fafafa' : '#f9f9f9',
                      color: email ? (error ? '#ef4444' : '#000') : '#aaa',
                      minHeight: 50,
                      boxShadow: kbOpen ? '3px 3px 0 0 #000' : 'none',
                    }}
                  >
                    {email || 'nama@email.com'}
                    {kbOpen && (
                      <span className="ml-0.5 inline-block w-0.5 h-5 bg-black animate-pulse" />
                    )}
                  </div>

                  {error && (
                    <p className="text-xs text-red-500 font-bold tracking-wide flex items-center gap-1.5 font-['Nunito',sans-serif]">
                      <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01" strokeLinecap="round"/></svg>
                      Format email tidak valid
                    </p>
                  )}

                  <button
                    onClick={handleSend}
                    className="w-full py-3 bg-black text-white font-black uppercase text-sm tracking-[0.18em] rounded-2xl hover:bg-black/80 active:scale-95 transition-all flex items-center justify-center gap-2 font-['Nunito',sans-serif]"
                    style={{ boxShadow: '4px 4px 0 0 rgba(0,0,0,0.25)' }}
                  >
                    <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    Kirim Email
                  </button>
                </div>

                <p className="text-[11px] text-black/25 mt-4 text-center font-['Nunito',sans-serif]">
                  Link aktif selama 30 hari · Tidak ada spam
                </p>
              </>
            ) : (
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-black flex items-center justify-center flex-shrink-0">
                  <svg width="18" height="18" fill="none" stroke="white" strokeWidth="2.8" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </div>
                <div>
                  <p className="font-black text-sm uppercase tracking-[0.15em] font-['Nunito',sans-serif]">Email Terkirim!</p>
                  <p className="text-xs text-black/40 mt-0.5 font-['Nunito',sans-serif]">{email}</p>
                </div>
              </div>
            )}
          </div>

          {/* QR card — slides in after email sent */}
          <div
            className="border-[3px] border-black rounded-3xl bg-white flex flex-col items-center overflow-hidden transition-all duration-700"
            style={{
              boxShadow: '12px 12px 0 0 #000',
              maxHeight: sent ? '320px' : '0px',
              opacity: sent ? 1 : 0,
              padding: sent ? '28px' : '0 28px',
              borderWidth: sent ? 3 : 0,
              width: '380px',
            }}
          >
            <p className="text-xs font-black uppercase tracking-[0.25em] mb-1 text-black/40 font-['Nunito',sans-serif]">Scan to Download</p>
            <p className="text-[12px] text-black/30 mb-4 font-['Nunito',sans-serif]">Atau buka link yang dikirim ke email kamu</p>
            <div className="border-[2.5px] border-black rounded-2xl p-3 mb-3">
              <QRCodeSVG value={downloadUrl} size={140} fgColor="#000000" bgColor="#ffffff" />
            </div>
            <p className="text-[10px] font-black tracking-[0.3em] text-black/30 font-['Nunito',sans-serif]">SCAN ME · {sessionCode}</p>
          </div>
        </div>
      </div>

      {/* On-screen keyboard — slides up from bottom */}
      <div
        className="absolute bottom-0 left-0 right-0 z-50 transition-transform duration-300"
        style={{ transform: kbOpen ? 'translateY(0)' : 'translateY(100%)' }}
      >
        {/* Close strip */}
        <div
          className="flex items-center justify-between px-5 py-2 border-t-[3px] border-black bg-[#f0f0f0] cursor-pointer"
          onClick={() => setKbOpen(false)}
        >
          <span className="text-xs font-black uppercase tracking-[0.2em] text-black/40 font-['Nunito',sans-serif]">Keyboard</span>
          <span className="text-xs font-black text-black/40 font-['Nunito',sans-serif]">✕ Tutup</span>
        </div>
        <V2Keyboard value={email} onChange={setEmail} onDone={handleSend} />
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function BoothClientV2() {
  const [searchParams] = useSearchParams()
  const boothId = searchParams.get('booth') ?? 'v2'
  const STEP_MAP: Record<string, Step> = { start: 'landing', tutorial: 'tutorial', payment: 'payment', qris: 'qris', frame: 'frame' }
  const [step, setStep] = useState<Step>(STEP_MAP[searchParams.get('step') ?? ''] ?? 'landing')
  const [showQtyModal,  setShowQtyModal] = useState(false)
  const [qty,           setQty]          = useState(1)
  const [selectedFrame, setSelectedFrame]= useState('strip-2x4')
  const [activeFilter,  setActiveFilter] = useState('Original')
  const [activeFilterIndex, setActiveFilterIndex] = useState(0)
  const [activeCategory, setActiveCategory] = useState('ALL FRAMES')
  const [countdown,     setCountdown]    = useState<number | null>(null)
  const [sessionNum,    setSessionNum]   = useState(1)
  const [sessionsDone,  setSessionsDone] = useState(0)
  const [timeLeft,      setTimeLeft]     = useState(300)
  const { stickers, addSticker, moveSticker, removeSticker } = useStickers()

  const frame = FRAMES.find(f => f.id === selectedFrame) ?? FRAMES[0]

  // countdown timer — stops at 0 for review mode
  useEffect(() => {
    if (step !== 'session' || countdown === null || countdown === 0) return
    const t = setTimeout(() => setCountdown(c => (c ?? 1) - 1), 1000)
    return () => clearTimeout(t)
  }, [step, countdown])

  // global session timer
  useEffect(() => {
    if (!['frame', 'session', 'preview', 'filter'].includes(step)) return
    if (timeLeft <= 0) { setStep('landing'); return }
    const t = setInterval(() => setTimeLeft(n => n - 1), 1000)
    return () => clearInterval(t)
  }, [step, timeLeft])

  const fmtTime = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

  function startPhoto() { if (sessionsDone < frame.cols * frame.rows) setCountdown(5) }

  function handleAcceptPreview() {
    setSessionsDone(n => n + 1)
    setCountdown(null)
  }

  function handleRetake() {
    if (countdown === 0) {
      setCountdown(null) // discard current capture, back to ready
    } else if (sessionsDone > 0) {
      setSessionsDone(n => n - 1) // undo last accepted photo
    }
  }

  function finishSession() {
    setCountdown(null)
    setStep('filter')
  }

  function handleFilterSwipe(dir: 'left' | 'right') {
    const total = FILTERS.length
    setActiveFilterIndex(i => dir === 'left' ? (i + 1) % total : (i - 1 + total) % total)
  }

  function handleContinuePreview() {
    if (sessionsDone < frame.cols * frame.rows) {
      setSessionNum(n => n + 1)
      setStep('session')
    } else {
      setStep('filter')
    }
  }

  // ── Step 1: Landing ────────────────────────────────────────────────────────
  if (step === 'landing') return (
    <div className="w-screen h-screen bg-[#fafafa] flex items-center justify-center relative overflow-hidden select-none" style={{ fontFamily: SERIF }}>
      <ClassicBorder><></></ClassicBorder>

      {/* booth badge */}
      <div className="absolute top-8 right-10 z-10">
        <span className="text-xs font-bold tracking-[0.18em] uppercase text-black/40 border border-black/20 rounded-full px-4 py-1.5">{BOOTH_NAME}</span>
      </div>

      <div className="relative z-10 flex flex-col items-center">
        <p className="text-base italic tracking-[0.2em] text-black/40 mb-10">Bringing fun to every frame</p>

        {/* Logo card */}
        <div className="relative mb-14">
          <div className="w-72 h-36 border-[3px] border-black rounded-[32px] bg-white flex items-center justify-center shadow-[8px_8px_0_0_#000]">
            <h1 className="text-5xl font-black tracking-tighter uppercase" style={{ letterSpacing: '-0.03em' }}>POTOHUB</h1>
          </div>
          <div className="absolute -top-3 -left-3 w-5 h-5 border-[3px] border-black rounded-full bg-[#fafafa]" />
          <div className="absolute -bottom-3 -right-3 w-5 h-5 border-[3px] border-black rounded-full bg-[#fafafa]" />
        </div>

        <p className="text-sm tracking-widest text-black/30 mb-8 uppercase">Touch the screen to begin</p>

        <button
          onClick={() => { setStep('tutorial'); setTimeLeft(300) }}
          className="px-14 py-3.5 border-[2.5px] border-black rounded-full text-lg font-bold uppercase tracking-[0.2em] hover:bg-black hover:text-white transition-all active:scale-95 shadow-[4px_4px_0_0_#000] hover:shadow-none hover:translate-x-1 hover:translate-y-1"
        >
          Start
        </button>
      </div>
    </div>
  )

  // ── Step 2: Tutorial ───────────────────────────────────────────────────────
  if (step === 'tutorial') {
    const TSTEPS = [
      {
        n: '01', label: 'Pembayaran',
        desc: 'Pilih QRIS atau Ticket',
        visual: (
          <div className="flex gap-2 w-full">
            {[{ icon: <QrCode size={20} strokeWidth={1.5}/>, label:'QRIS' }, { icon: <Ticket size={20} strokeWidth={1.5}/>, label:'Voucher' }].map(m => (
              <div key={m.label} className="flex-1 border-[1.5px] border-black/60 rounded-lg py-2.5 flex flex-col items-center gap-1 bg-[#fafafa]">
                {m.icon}
                <span className="text-[8.5px] font-black tracking-wider">{m.label}</span>
              </div>
            ))}
          </div>
        ),
      },
      {
        n: '02', label: 'Pilih Frame',
        desc: 'Tentukan layout strip fotomu',
        visual: (
          <div className="flex gap-2 w-full justify-center">
            {[{c:2,r:3,active:true},{c:1,r:3,active:false},{c:2,r:2,active:false}].map((f,i) => (
              <div key={i} className={`rounded-lg p-1 border-[1.5px] ${f.active ? 'border-black' : 'border-black/25'}`} style={{ width: 32 }}>
                <div style={{ display:'grid', gridTemplateColumns:`repeat(${f.c},1fr)`, gap:'2px', aspectRatio:'2/3' }}>
                  {Array.from({length:f.c*f.r}).map((_,j)=>(
                    <div key={j} className={`rounded-[1px] ${f.active?'bg-black/70':'bg-black/15'}`}/>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ),
      },
      {
        n: '03', label: 'Sesi Foto',
        desc: 'Berpose & hitung mundur',
        visual: (
          <div className="w-full rounded-xl bg-black overflow-hidden relative" style={{ aspectRatio:'4/3' }}>
            <div className="absolute inset-2 border border-dashed border-white/25 rounded-lg" />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-white font-black text-3xl opacity-90">3</span>
            </div>
            <div className="absolute bottom-2 left-0 right-0 flex justify-center">
              <span className="text-white/40 text-[7px] font-black tracking-widest uppercase">Tap to Start</span>
            </div>
          </div>
        ),
      },
      {
        n: '04', label: 'Pilih Filter',
        desc: 'Percantik hasil fotomu',
        visual: (
          <div className="flex gap-1.5 w-full">
            {[{label:'Ori',cls:''},{label:'B&W',cls:'grayscale'},{label:'Sepia',cls:'sepia'}].map((f,i)=>(
              <div key={f.label} className={`flex-1 rounded-lg overflow-hidden border-[1.5px] ${i===0?'border-black':'border-black/25'}`}>
                <div className={`w-full ${f.cls} bg-gray-300 flex items-center justify-center`} style={{aspectRatio:'1/1'}}>
                  <Camera size={10} className="opacity-20"/>
                </div>
                <div className={`text-center text-[7.5px] font-black py-1 ${i===0?'bg-black text-white':''}`}>{f.label}</div>
              </div>
            ))}
          </div>
        ),
      },
      {
        n: '05', label: 'Print & Download',
        desc: 'Ambil cetak & scan QR',
        visual: (
          <div className="w-full flex flex-col items-center gap-2">
            <div className="border-[1.5px] border-black rounded-lg p-1.5 bg-white">
              <div className="grid grid-cols-5 gap-[2px]" style={{width:44,height:44}}>
                {[1,1,0,1,1, 1,0,1,0,1, 0,1,1,1,0, 1,0,1,0,1, 1,1,0,1,1].map((v,i)=>(
                  <div key={i} className={`rounded-[1px] ${v?'bg-black':'bg-white'}`}/>
                ))}
              </div>
            </div>
            <span className="text-[8px] font-black tracking-[0.15em] text-black/40">SCAN ME</span>
          </div>
        ),
      },
    ]

    return (
      <div className="w-screen h-screen bg-[#fafafa] flex flex-col relative overflow-hidden select-none" style={{ fontFamily: SERIF }}>
        <StepperHeader step={step} />
        <ClassicBorder><></></ClassicBorder>

        <div className="relative z-10 flex flex-col items-center w-full flex-1 justify-center">
          {/* header */}
          <h2 className="text-3xl font-bold tracking-wide mb-1">Panduan Penggunaan</h2>
          <div className="w-16 h-[2px] bg-black mb-10" />

          {/* cards + connectors */}
          <div className="flex items-center justify-center gap-0 mb-8">
            {TSTEPS.map((s, i) => (
              <div key={s.n} className="flex items-center">
                {/* card */}
                <div className="flex flex-col items-center gap-3" style={{ width: 148 }}>
                  {/* step badge */}
                  <div className="w-8 h-8 border-[2px] border-black rounded-full flex items-center justify-center bg-white">
                    <span className="text-[10px] font-black tracking-widest">{s.n}</span>
                  </div>

                  {/* card body */}
                  <div className="w-full border-[2.5px] border-black rounded-2xl bg-white overflow-hidden shadow-[4px_4px_0_0_#000]">
                    {/* illustration */}
                    <div className="px-4 pt-4 pb-3">
                      {s.visual}
                    </div>
                    {/* label strip */}
                    <div className="border-t-[2px] border-black px-3 py-2 flex items-center justify-center">
                      <span className="text-[11px] font-black tracking-wide text-center leading-tight">{s.label}</span>
                    </div>
                  </div>

                  {/* desc */}
                  <p className="text-[10.5px] text-center text-black/45 leading-relaxed">{s.desc}</p>
                </div>

                {/* arrow connector */}
                {i < TSTEPS.length - 1 && (
                  <div className="flex items-center justify-center mb-10 mx-1" style={{ width: 36 }}>
                    <svg width="28" height="10" viewBox="0 0 28 10" fill="none">
                      <path d="M0 5h24M19 1l5 4-5 4" stroke="black" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* CTA */}
          <button
            onClick={() => setStep('payment')}
            className="px-14 py-3.5 border-[2.5px] border-black rounded-full text-base font-bold uppercase tracking-[0.2em] hover:bg-black hover:text-white transition-all active:scale-95 shadow-[4px_4px_0_0_#000] hover:shadow-none hover:translate-x-1 hover:translate-y-1"
          >
            Mulai Sekarang
          </button>
        </div>
      </div>
    )
  }

  // ── Step 3: Payment ────────────────────────────────────────────────────────
  if (step === 'payment') return (
    <div className="w-screen h-screen bg-[#fafafa] flex flex-col relative overflow-hidden select-none" style={{ fontFamily: SERIF }}>
      <StepperHeader step={step} />
      <ClassicBorder><></></ClassicBorder>

      <div className="relative z-10 flex flex-col items-center flex-1 justify-center">
        <h2 className="text-3xl font-bold mb-2">Select Payment Method</h2>
        <div className="w-20 h-[2px] bg-black mb-16" />

        <div className="flex gap-12">
          {[
            { icon: <QrCode size={72} strokeWidth={1.2} />, label: 'QRIS',   onClick: () => setShowQtyModal(true) },
            { icon: <Ticket size={72} strokeWidth={1.2} />, label: 'Ticket', onClick: () => setStep('ticket') },
          ].map(opt => (
            <button
              key={opt.label}
              onClick={opt.onClick}
              className="group flex flex-col items-center gap-6 px-12 py-10 border-[3px] border-black rounded-3xl bg-white hover:bg-black hover:text-white transition-all shadow-[8px_8px_0_0_#000] hover:shadow-none hover:translate-x-2 hover:translate-y-2 active:scale-95"
            >
              {opt.icon}
              <span className="text-xl font-black tracking-[0.2em] uppercase px-6 py-2 border-[2.5px] border-black rounded-full group-hover:border-white transition-colors">
                {opt.label}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Quantity modal */}
      {showQtyModal && (
        <div className="absolute inset-0 bg-white/85 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-white border-[3px] border-black rounded-3xl p-12 flex flex-col items-center shadow-[16px_16px_0_0_#000] w-[460px] relative">
            <button onClick={() => setShowQtyModal(false)} className="absolute top-6 right-6 w-9 h-9 border-2 border-black rounded-full text-lg font-black flex items-center justify-center hover:bg-black hover:text-white transition-colors">✕</button>

            <h3 className="text-2xl font-bold mb-2">Print Quantity</h3>
            <div className="w-12 h-[2px] bg-black mb-8" />

            <div className="flex items-center gap-10 mb-6">
              <button onClick={() => setQty(q => Math.max(1, q - 1))} className="w-14 h-14 border-[2.5px] border-black rounded-full text-2xl font-black flex items-center justify-center hover:bg-black hover:text-white transition-colors shadow-[3px_3px_0_0_#000] hover:shadow-none hover:translate-x-[3px] hover:translate-y-[3px]">−</button>
              <span className="text-5xl font-black w-16 text-center">{qty}</span>
              <button onClick={() => setQty(q => Math.min(10, q + 1))} className="w-14 h-14 border-[2.5px] border-black rounded-full text-2xl font-black flex items-center justify-center hover:bg-black hover:text-white transition-colors shadow-[3px_3px_0_0_#000] hover:shadow-none hover:translate-x-[3px] hover:translate-y-[3px]">+</button>
            </div>

            <div className="text-4xl font-black mb-2">Rp {(PRICE_BASE * qty).toLocaleString('id-ID')}</div>
            <p className="text-sm text-black/40 tracking-widest mb-10">{qty} × Rp {PRICE_BASE.toLocaleString('id-ID')}</p>

            <button
              onClick={() => { setShowQtyModal(false); setStep('qris') }}
              className="w-full py-4 bg-black text-white text-xl font-bold tracking-[0.15em] uppercase rounded-full hover:bg-gray-900 transition-colors shadow-[6px_6px_0_0_rgba(0,0,0,0.2)]"
            >
              Proceed to Payment
            </button>
          </div>
        </div>
      )}
    </div>
  )

  // ── Step 3b: QRIS Scan ─────────────────────────────────────────────────────
  if (step === 'qris') {
    const total = PRICE_BASE * qty
    return (
      <div className="w-screen h-screen bg-[#fafafa] flex flex-col relative overflow-hidden select-none" style={{ fontFamily: SERIF }}>
        <StepperHeader step="payment" />
        <ClassicBorder><></></ClassicBorder>

        <div className="relative z-10 flex flex-col items-center flex-1 justify-center gap-0">
          {/* title */}
          <p className="text-xs tracking-[0.35em] uppercase text-black/40 mb-3">Scan &amp; Pay</p>
          <h2 className="text-3xl font-bold mb-1">Pembayaran QRIS</h2>
          <div className="w-16 h-[2px] bg-black mb-8" />

          {/* QR card */}
          <div className="bg-white border-[3px] border-black rounded-3xl shadow-[10px_10px_0_0_#000] p-8 flex flex-col items-center gap-5 w-[360px]">
            {/* amount */}
            <div className="text-center">
              <p className="text-xs tracking-widest text-black/40 mb-1">TOTAL PEMBAYARAN</p>
              <p className="text-4xl font-black">Rp {total.toLocaleString('id-ID')}</p>
              <p className="text-xs text-black/35 mt-1">{qty} print × Rp {PRICE_BASE.toLocaleString('id-ID')}</p>
            </div>

            {/* QR code */}
            <div className="p-3 border-[2px] border-black/10 rounded-2xl bg-white">
              <QRCodeSVG
                value={`potohub://pay?booth=${BOOTH_NAME}&amount=${total}&ref=${Date.now()}`}
                size={200}
                fgColor="#000000"
                bgColor="#ffffff"
                level="M"
              />
            </div>

            {/* accepted logos */}
            <div className="flex items-center gap-3">
              {['GoPay', 'OVO', 'DANA', 'LinkAja', 'ShopeePay'].map(name => (
                <span key={name} className="text-[9px] font-black tracking-wider px-2 py-1 border border-black/20 rounded-md text-black/50">{name}</span>
              ))}
            </div>

            <p className="text-[10px] text-black/30 tracking-widest text-center">Gunakan aplikasi e-wallet atau m-banking</p>
          </div>

          {/* countdown hint */}
          <p className="mt-6 text-xs text-black/30 tracking-widest">QR berlaku selama 15 menit</p>

          {/* confirm button */}
          <button
            onClick={() => setStep('frame')}
            className="mt-8 px-16 py-4 bg-black text-white text-base font-bold tracking-[0.2em] uppercase rounded-full hover:bg-gray-900 transition-all shadow-[6px_6px_0_0_rgba(0,0,0,0.25)] hover:shadow-none hover:translate-x-[6px] hover:translate-y-[6px] active:scale-95"
          >
            Saya Sudah Bayar ✓
          </button>

          {/* back */}
          <button
            onClick={() => setStep('payment')}
            className="mt-4 flex items-center gap-2 text-sm text-black/40 hover:text-black transition-colors"
          >
            <ChevronLeft size={14} /> Ganti Metode Pembayaran
          </button>
        </div>
      </div>
    )
  }

  // ── Step 3c: Ticket Scan ───────────────────────────────────────────────────
  if (step === 'ticket') {
    return (
      <div className="w-screen h-screen bg-[#fafafa] flex flex-col relative overflow-hidden select-none" style={{ fontFamily: SERIF }}>
        <StepperHeader step="payment" />
        <ClassicBorder><></></ClassicBorder>

        <div className="relative z-10 flex flex-col items-center flex-1 justify-center gap-0">
          <p className="text-xs tracking-[0.35em] uppercase text-black/40 mb-3">Scan or Enter Code</p>
          <h2 className="text-3xl font-bold mb-1">Scan Tiket</h2>
          <div className="w-16 h-[2px] bg-black mb-8" />

          <div className="bg-white border-[3px] border-black rounded-3xl shadow-[10px_10px_0_0_#000] p-8 flex flex-col items-center gap-6 w-[380px]">
            {/* scanner viewfinder */}
            <div className="relative w-52 h-52 border-[3px] border-black rounded-2xl overflow-hidden bg-black/5 flex items-center justify-center">
              {/* corner brackets */}
              {[['top-2 left-2','border-t-4 border-l-4'],['top-2 right-2','border-t-4 border-r-4'],['bottom-2 left-2','border-b-4 border-l-4'],['bottom-2 right-2','border-b-4 border-r-4']].map(([pos,bdr]) => (
                <div key={pos} className={`absolute ${pos} w-6 h-6 border-black ${bdr}`} />
              ))}
              {/* scan line animation */}
              <div className="absolute inset-x-2 h-0.5 bg-black/70 rounded animate-bounce" style={{ top: '45%' }} />
              <Ticket size={48} strokeWidth={1.2} className="text-black/20" />
            </div>

            <p className="text-xs text-black/40 tracking-widest">— atau masukkan kode manual —</p>

            <TicketInput onConfirm={() => setStep('frame')} />
          </div>

          <button onClick={() => setStep('payment')} className="mt-6 flex items-center gap-2 text-sm text-black/40 hover:text-black transition-colors">
            <ChevronLeft size={14} /> Ganti Metode
          </button>
        </div>
      </div>
    )
  }

  // ── Step 4: Frame Selection ────────────────────────────────────────────────
  if (step === 'frame') {
    const catIdx = FRAME_CATEGORIES.indexOf(activeCategory)
    const catProgress = (catIdx + 1) / FRAME_CATEGORIES.length
    const visibleFrames = FRAMES.filter(f => f.cats.includes(activeCategory))

    return (
      <div className="w-screen h-screen bg-[#fafafa] flex flex-col relative overflow-hidden select-none" style={{ fontFamily: SERIF }}>
        <StepperHeader step={step} />
        <div className="flex flex-1 gap-5 p-5 min-h-0">

        {/* Left: selected frame preview */}
        <div className="w-[28%] border-[3px] border-black rounded-3xl bg-white flex flex-col items-center p-6 gap-4 relative">
          <div className="absolute top-5 left-5 px-4 py-1 border-2 border-black rounded-full text-sm font-black tracking-widest">{fmtTime(timeLeft)}</div>

          <p className="text-xs font-bold uppercase tracking-[0.18em] text-black/40 mt-8">Preview</p>
          <h3 className="text-xl font-bold">{frame.label}</h3>

          <div className="flex-1 flex items-center justify-center w-full">
            <div className="w-[65%] border-[3px] border-black bg-[#fafafa] p-2 shadow-[8px_8px_0_0_#000]" style={{ aspectRatio: frame.cols === 1 ? '2/3' : frame.cols >= 3 ? '1/1' : '2/3' }}>
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${frame.cols}, 1fr)`, gridTemplateRows: `repeat(${frame.rows}, 1fr)`, gap: '4px', width: '100%', height: '100%' }}>
                {Array.from({ length: frame.cols * frame.rows }).map((_, i) => (
                  <div key={i} className="border-2 border-black flex items-center justify-center text-sm font-bold text-black/30">{i + 1}</div>
                ))}
              </div>
            </div>
          </div>

          <button
            onClick={() => { setSessionsDone(0); setSessionNum(1); setStep('session') }}
            className="w-4/5 py-3.5 border-[2.5px] border-black rounded-full text-base font-bold uppercase tracking-widest hover:bg-black hover:text-white transition-all shadow-[4px_4px_0_0_#000] hover:shadow-none hover:translate-x-1 hover:translate-y-1"
          >
            Select Frame
          </button>
        </div>

        {/* Right: categories + frame grid */}
        <div className="flex-1 border-[3px] border-black rounded-3xl bg-white flex flex-col overflow-hidden">

          {/* header */}
          <div className="px-7 pt-6 pb-0 shrink-0">
            <h2 className="text-3xl font-bold text-center mb-1">Choose Your Frame</h2>
            <div className="w-16 h-[2px] bg-black mx-auto mb-5" />

            {/* category pill bar */}
            <div className="flex items-center gap-2 overflow-x-auto pb-0" style={{ scrollbarWidth: 'none' }}>
              {FRAME_CATEGORIES.map(cat => {
                const isActive = activeCategory === cat
                return (
                  <button
                    key={cat}
                    onClick={() => setActiveCategory(cat)}
                    className={`shrink-0 px-4 py-2 rounded-full text-[11px] font-black tracking-[0.14em] uppercase border-[2px] transition-all ${
                      isActive
                        ? 'bg-black text-white border-black shadow-[3px_3px_0_0_rgba(0,0,0,0.25)]'
                        : 'bg-white text-black border-black/25 hover:border-black'
                    }`}
                  >
                    {cat}
                  </button>
                )
              })}
            </div>

            {/* scroll progress bar */}
            <div className="mt-3 mb-4 h-[3px] bg-black/8 rounded-full overflow-hidden">
              <div
                className="h-full bg-black rounded-full transition-all duration-300"
                style={{ width: `${catProgress * 100}%` }}
              />
            </div>
          </div>

          {/* frame grid */}
          <div className="flex-1 overflow-y-auto px-7 pb-7 min-h-0">
            <div className="grid grid-cols-3 gap-4">
              {visibleFrames.map(f => {
                const active = selectedFrame === f.id
                return (
                  <button
                    key={f.id}
                    onClick={() => setSelectedFrame(f.id)}
                    className={`border-[2.5px] rounded-2xl p-4 flex flex-col items-center gap-3 cursor-pointer transition-all ${
                      active ? 'border-black shadow-[5px_5px_0_0_#000] bg-gray-50' : 'border-black/20 hover:border-black bg-white'
                    }`}
                  >
                    <div className="w-2/3 h-24 flex items-stretch">
                      <FrameMini cols={f.cols} rows={f.rows} active={active} />
                    </div>
                    <span className="text-xs font-black tracking-wide">{f.label}</span>
                    {active && <Check size={14} strokeWidth={3} />}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
        </div>
      </div>
    )
  }

  // ── Step 5: Photo Session ──────────────────────────────────────────────────
  if (step === 'session') {
    const totalSlots = frame.cols * frame.rows
    const isSessionComplete = sessionsDone >= totalSlots
    const isReviewing = countdown === 0

    return (
      <div className="w-screen h-screen bg-[#fafafa] flex flex-col relative overflow-hidden select-none" style={{ fontFamily: SERIF }}>
        <StepperHeader step={step} />
        <div className="flex flex-1 items-center justify-center p-6 gap-6 min-h-0">

        {/* ── Kiri: Viewfinder (70%) ─────────────────────────────── */}
        <div className="flex-[0_0_70%] h-full bg-black rounded-3xl border-[3px] border-black flex items-center justify-center relative overflow-hidden shadow-sm">

          {/* dashed mockup guide */}
          <div className="w-[50%] aspect-[3/4] border-2 border-dashed border-white/40 rounded-[32px] pointer-events-none" />

          {countdown !== null && countdown > 0 ? (
            /* STATE 1: Countdown */
            <div className="absolute inset-0 flex items-center justify-center bg-black/30 backdrop-blur-sm z-10">
              <div className="text-[18rem] text-white font-black leading-none drop-shadow-[0_0_30px_rgba(255,255,255,0.8)]">
                {countdown}
              </div>
            </div>
          ) : isReviewing ? (
            /* STATE 2: Review foto yang baru diambil */
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-white z-10">
              <div className="w-full h-full bg-gray-200 flex flex-col items-center justify-center border-8 border-white">
                <Camera size={80} strokeWidth={1.5} className="mb-6 opacity-30" />
                <h2 className="text-5xl font-black italic mb-2" style={{ fontFamily: SERIF }}>Looking Good!</h2>
                <p className="text-xl font-bold tracking-widest uppercase opacity-50">Preview Photo {sessionsDone + 1}</p>
              </div>
            </div>
          ) : isSessionComplete ? (
            /* STATE 3: Semua slot selesai */
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-md z-10">
              <h2 className="text-white text-5xl font-black italic mb-4" style={{ fontFamily: SERIF }}>All Done!</h2>
              <p className="text-white/80 text-xl tracking-widest uppercase">Great poses!</p>
            </div>
          ) : (
            /* STATE 4: Idle / siap memotret */
            <div className="absolute inset-0 flex flex-col items-center justify-center z-10 pointer-events-none">
              <div className="text-white/80 text-6xl font-black uppercase tracking-[0.2em] mb-4 drop-shadow-[0_0_20px_rgba(255,255,255,0.3)]">Ready?</div>
              <p className="text-white/50 italic text-xl">Click "Capture" on the right</p>
            </div>
          )}

          {/* Photo counter badge — hidden saat review */}
          {!isReviewing && (
            <div className="absolute top-6 left-6 px-6 py-2 border-2 border-white rounded-full text-white font-bold text-xl tracking-widest bg-black/50 backdrop-blur-md z-20">
              Photo {Math.min(sessionsDone + 1, totalSlots)} / {totalSlots}
            </div>
          )}

          {/* Timer badge */}
          <div className="absolute top-6 right-6 px-5 py-2 border-2 border-white/30 rounded-full text-white/60 font-bold text-sm tracking-widest bg-black/40 backdrop-blur-md z-20">
            {fmtTime(timeLeft)}
          </div>
        </div>

        {/* ── Kanan: Preview frame + Aksi (30%) ──────────────────── */}
        <div className="flex-1 h-full border-[3px] border-black rounded-3xl pt-8 pb-8 px-6 flex flex-col bg-white shadow-[8px_8px_0_0_rgba(0,0,0,1)]">

          <h3 className="text-xl font-bold text-center mb-6 border-b-2 border-black pb-4 uppercase tracking-widest">
            {isReviewing ? 'Accept Photo?' : 'Preview'}
          </h3>

          {/* Miniatur frame grid */}
          <div className="flex-1 flex flex-col items-center justify-start min-h-0 py-2 overflow-hidden">
            <div
              className="border-[3px] border-black bg-[#fafafa] p-1.5 shadow-[4px_4px_0_0_rgba(0,0,0,1)]"
              style={{ width: '70%', maxWidth: 200 }}
            >
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(${frame.cols}, 1fr)`,
                  gridTemplateRows: `repeat(${frame.rows}, 1fr)`,
                  gap: '4px',
                  aspectRatio: frame.cols === 1 ? '2/3' : frame.cols >= 3 ? '1/1' : '2/3',
                }}
              >
                {Array.from({ length: totalSlots }).map((_, i) => {
                  // Saat review, slot berikutnya dianggap sudah terisi untuk preview
                  const isFilled = i < sessionsDone || (isReviewing && i === sessionsDone)
                  const isCurrent = i === sessionsDone && countdown !== null && countdown > 0
                  return (
                    <div
                      key={i}
                      className={`flex items-center justify-center overflow-hidden border transition-all duration-300
                        ${isFilled ? 'bg-gray-300 border-black' : 'bg-white border-black/30'}
                        ${isCurrent ? 'bg-black/10 border-dashed border-2 border-black scale-95' : ''}
                      `}
                    >
                      {isFilled
                        ? <Camera className="opacity-40" size={14} />
                        : <span className="font-bold text-gray-300 text-[10px]">{i + 1}</span>
                      }
                    </div>
                  )
                })}
              </div>
            </div>

            <p className="mt-4 font-bold text-gray-400 text-xs tracking-widest uppercase">
              {isReviewing
                ? `${sessionsDone + 1} of ${totalSlots} captured`
                : `${sessionsDone} of ${totalSlots} taken`}
            </p>
          </div>

          {/* Tombol aksi */}
          <div className="flex flex-col gap-3 mt-4 shrink-0">

            {/* Accept & Next / Accept & Finish — hanya saat review */}
            {isReviewing && (
              <button
                onClick={handleAcceptPreview}
                className="w-full py-4 bg-black text-white rounded-xl text-lg font-bold tracking-widest uppercase hover:bg-gray-800 transition-colors shadow-[4px_4px_0_0_rgba(200,200,200,1)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none flex items-center justify-center gap-3"
              >
                {sessionsDone + 1 >= totalSlots ? 'Accept & Finish' : 'Accept & Next'} <ArrowRight size={20} strokeWidth={3} />
              </button>
            )}

            {/* Capture — hanya saat idle dan belum selesai */}
            {countdown === null && !isSessionComplete && (
              <button
                onClick={startPhoto}
                className="w-full py-4 bg-black text-white rounded-xl text-lg font-bold tracking-widest uppercase hover:bg-gray-800 transition-colors shadow-[4px_4px_0_0_rgba(200,200,200,1)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none flex items-center justify-center gap-3"
              >
                <Camera size={20} /> Capture
              </button>
            )}

            {/* Retake — aktif saat review (buang foto ini) atau saat ada foto tersimpan */}
            <button
              onClick={handleRetake}
              disabled={(sessionsDone === 0 && !isReviewing) || (countdown !== null && countdown > 0)}
              className={`w-full py-3 border-2 border-black rounded-xl font-bold tracking-widest uppercase flex items-center justify-center gap-2 transition-all
                ${(sessionsDone > 0 || isReviewing) && (countdown === null || isReviewing)
                  ? 'hover:bg-gray-100 shadow-[4px_4px_0_0_rgba(0,0,0,1)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none text-black'
                  : 'opacity-30 cursor-not-allowed bg-gray-50'
                }`}
            >
              <RefreshCcw size={16} strokeWidth={2.5} /> Retake
            </button>

            {/* Finish — muncul saat semua slot selesai atau sudah ada foto & tidak sedang countdown */}
            {isSessionComplete && countdown === null && (
              <button
                onClick={finishSession}
                className="w-full py-3 border-2 border-black bg-black text-white rounded-xl font-bold tracking-widest uppercase flex items-center justify-center gap-2 hover:bg-gray-800 shadow-[4px_4px_0_0_rgba(200,200,200,1)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all"
              >
                Finish <ArrowRight size={18} strokeWidth={3} />
              </button>
            )}
          </div>
        </div>
        </div>
      </div>
    )
  }

  // ── Step 6: Preview / Retake ───────────────────────────────────────────────
  if (step === 'preview') return (
    <div className="w-screen h-screen bg-[#fafafa] flex flex-col relative overflow-hidden select-none" style={{ fontFamily: SERIF }}>
      <StepperHeader step={step} />
      <ClassicBorder><></></ClassicBorder>
      <div className="flex flex-1 items-center px-6 gap-6 min-h-0">

      {/* Left: current strip */}
      <div className="flex-[0_0_38%] relative z-10 flex justify-center">
        <div className="-rotate-2 border-[3px] border-black bg-white p-3 shadow-[12px_12px_0_0_#000]" style={{ width: '55%', aspectRatio: frame.cols === 1 ? '2/4' : '2/3' }}>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${frame.cols}, 1fr)`, gridTemplateRows: `repeat(${frame.rows}, 1fr)`, gap: '4px', width: '100%', height: '100%' }}>
            {Array.from({ length: frame.cols * frame.rows }).map((_, i) => (
              <PhotoSlot key={i} filled={i < sessionsDone} filter="Original" />
            ))}
          </div>
        </div>
      </div>

      {/* Right: decision */}
      <div className="flex-1 relative z-10 flex flex-col gap-8 pl-6">
        <div>
          <h2 className="text-4xl font-bold italic leading-tight mb-3">Want to retake<br />your photo?</h2>
          <p className="text-sm text-black/40 tracking-widest">Shot {sessionsDone} of {frame.cols * frame.rows} taken</p>
        </div>

        {/* progress dots */}
        <div className="flex gap-2">
          {Array.from({ length: frame.cols * frame.rows }).map((_, i) => (
            <div key={i} className={`w-3 h-3 rounded-full border-2 border-black ${i < sessionsDone ? 'bg-black' : 'bg-transparent'}`} />
          ))}
        </div>

        <div className="flex flex-col gap-4 w-64">
          <button
            onClick={() => setStep('session')}
            className="w-full py-4 border-[2.5px] border-black rounded-full text-lg font-bold tracking-[0.15em] uppercase hover:bg-black hover:text-white transition-all shadow-[5px_5px_0_0_#000] hover:shadow-none hover:translate-x-[5px] hover:translate-y-[5px]"
          >
            Retake
          </button>
          <button
            onClick={handleContinuePreview}
            className="w-full py-4 bg-black text-white rounded-full text-lg font-bold tracking-[0.15em] uppercase hover:bg-gray-900 transition-all shadow-[5px_5px_0_0_rgba(0,0,0,0.3)] hover:shadow-none hover:translate-x-[5px] hover:translate-y-[5px]"
          >
            {sessionsDone >= frame.cols * frame.rows ? 'Continue' : `Next Shot (${sessionsDone + 1}/${frame.cols * frame.rows})`}
          </button>
        </div>
      </div>
      </div>
    </div>
  )

  // ── Step 8: Filter ────────────────────────────────────────────────────────
  if (step === 'filter') {
    const total = FILTERS.length
    return (
    <div className="w-screen h-screen bg-[#fafafa] flex flex-col relative overflow-hidden select-none" style={{ fontFamily: SERIF }}>
      <StepperHeader step={step} />

      <div className="flex flex-col flex-1 min-h-0 pt-5 pb-4 px-10 gap-4">
        {/* Emoji picker – sits above the carousel */}
        <div className="shrink-0">
          <EmojiPicker onPick={addSticker} boothId={boothId} />
        </div>

        <h2 className="text-3xl font-bold border-b-2 border-black pb-2 shrink-0">Choose filter!</h2>

        {/* Carousel – active card gets the sticker canvas overlay */}
        <div className="flex flex-1 items-center justify-center relative overflow-visible">
          {FILTERS.map((f, i) => {
            const isActive = i === activeFilterIndex
            const isPrev = i === (activeFilterIndex - 1 + total) % total
            const isNext = i === (activeFilterIndex + 1) % total
            if (!isActive && !isPrev && !isNext) return null
            return (
              <div
                key={f.id}
                onClick={() => !isActive && setActiveFilterIndex(i)}
                className={`absolute aspect-[2/3] border-[3px] rounded-3xl bg-white p-3 transition-all duration-300 ${
                  isActive
                    ? 'border-black shadow-[8px_8px_0_0_rgba(0,0,0,1)] z-10 scale-100 cursor-default'
                    : 'border-gray-400 opacity-50 z-0 scale-[0.82] cursor-pointer'
                } ${isPrev ? '-translate-x-[200px]' : isNext ? 'translate-x-[200px]' : ''}`}
                style={{ height: '100%' }}
              >
                {isActive ? (
                  <StickerCanvas
                    stickers={stickers}
                    onMove={moveSticker}
                    onRemove={removeSticker}
                    className="w-full h-full"
                  >
                    <div className="w-full h-full flex flex-col gap-2">
                      {Array.from({ length: frame.rows }).map((_, r) => (
                        <div key={r} className="flex gap-2 flex-1">
                          {Array.from({ length: frame.cols }).map((_, c) => (
                            <div key={c} className={`flex-1 border-2 border-black bg-gray-300 flex items-center justify-center overflow-hidden ${f.style}`}>
                              <Camera className="opacity-20" size={20} />
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  </StickerCanvas>
                ) : (
                  <div className="w-full h-full flex flex-col gap-2 blur-[1px] grayscale opacity-70">
                    {Array.from({ length: frame.rows }).map((_, r) => (
                      <div key={r} className="flex gap-2 flex-1">
                        {Array.from({ length: frame.cols }).map((_, c) => (
                          <div key={c} className={`flex-1 border-2 border-black bg-gray-300 flex items-center justify-center overflow-hidden ${f.style}`}>
                            <Camera className="opacity-20" size={20} />
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}

          <button
            onClick={() => handleFilterSwipe('right')}
            className="absolute left-6 top-1/2 -translate-y-1/2 w-14 h-14 rounded-full bg-white border-4 border-black flex items-center justify-center hover:bg-gray-100 shadow-[6px_6px_0_0_rgba(0,0,0,1)] active:translate-x-1 active:translate-y-1 active:shadow-none z-20"
          >
            <ChevronLeft size={28} strokeWidth={3} />
          </button>
          <button
            onClick={() => handleFilterSwipe('left')}
            className="absolute right-6 top-1/2 -translate-y-1/2 w-14 h-14 rounded-full bg-white border-4 border-black flex items-center justify-center hover:bg-gray-100 shadow-[6px_6px_0_0_rgba(0,0,0,1)] active:translate-x-1 active:translate-y-1 active:shadow-none z-20"
          >
            <ChevronRight size={28} strokeWidth={3} />
          </button>
        </div>

        <div className="flex items-center justify-between shrink-0">
          <h3 className="text-lg font-bold tracking-widest uppercase">{FILTERS[activeFilterIndex].name}</h3>
          <button
            onClick={() => { setActiveFilter(FILTERS[activeFilterIndex].id); setStep('download') }}
            className="px-12 py-4 bg-[#f97316] text-white rounded-full text-lg font-bold tracking-widest uppercase shadow-[4px_4px_0_0_rgba(200,200,200,1)] hover:translate-x-[2px] hover:translate-y-[2px] active:translate-x-[4px] active:translate-y-[4px] active:shadow-none transition-all flex items-center gap-3"
          >
            Print <ArrowRight size={20} strokeWidth={3} />
          </button>
        </div>
      </div>
    </div>
  )}

  // ── Step 9: Download ──────────────────────────────────────────────────────
  if (step === 'download') return (
    <DownloadStep
      boothName={BOOTH_NAME}
      onDone={() => { setStep('landing'); setQty(1); setSessionsDone(0); setSessionNum(1); setTimeLeft(300); setActiveFilter('Original') }}
    />
  )

  return null
}
