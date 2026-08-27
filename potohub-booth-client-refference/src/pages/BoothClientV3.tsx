import { useState, useEffect } from 'react'
import { useParams, useSearchParams } from 'react-router'
import { QrCode, Camera, Download, Clock, Image as ImageIcon, ChevronRight, Ticket, Check, Star, Sparkles, Delete } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { getCategories, subscribeCategories, type StoreCategory } from '../store/frameStore'
import { getUIConfig, subscribeUIConfig, type BoothUIConfig } from '../store/uiConfigStore'
import { useStickers, EmojiPicker, StickerCanvas } from '@/components/EmojiStickers'

type Step = 'start' | 'tutorial' | 'package' | 'payment' | 'ticket' | 'frame' | 'session' | 'filter' | 'loading' | 'download'

const FONT_MAP: Record<BoothUIConfig['frameTitleStyle']['font'], string> = {
  'Sans Serif': "'Inter', sans-serif",
  'Serif':      "'Playfair Display', serif",
  'Monospace':  "'Space Mono', monospace",
}
const SIZE_MAP: Record<BoothUIConfig['frameTitleStyle']['size'], string> = {
  'Kecil':  '1rem',
  'Sedang': '1.5rem',
  'Besar':  '2rem',
}

function V3TicketInput({ onConfirm }: { onConfirm: () => void }) {
  const [code, setCode] = useState('')
  const [error, setError] = useState(false)
  function verify() {
    if (code.trim().length >= 4) onConfirm()
    else { setError(true); setTimeout(() => setError(false), 1500) }
  }
  return (
    <div className="flex flex-col gap-3">
      <input
        value={code}
        onChange={e => setCode(e.target.value.toUpperCase())}
        onKeyDown={e => e.key === 'Enter' && verify()}
        placeholder="XXXX-XXXX-XXXX"
        className={`w-full text-center text-lg font-black tracking-[0.2em] rounded-xl px-4 py-3 outline-none border-2 transition-colors bg-white/10 text-white placeholder-white/20 ${error ? 'border-red-400' : 'border-white/20 focus:border-[#FFC107]'}`}
        style={{ fontFamily: "'Space Mono', monospace" }}
      />
      {error && <p className="text-xs text-red-400 text-center tracking-wider">Kode tidak valid</p>}
      <button
        onClick={verify}
        className="w-full py-3.5 bg-[#FFC107] text-black font-black tracking-[0.2em] uppercase rounded-full hover:bg-yellow-300 transition-colors shadow-lg text-sm active:scale-95"
      >
        Verifikasi Tiket ✓
      </button>
    </div>
  )
}

// ── V3 on-screen keyboard (dark retro style) ──────────────────────────────────
const V3_KB_ALPHA = [
  ['q','w','e','r','t','y','u','i','o','p'],
  ['a','s','d','f','g','h','j','k','l'],
  ['SHIFT','z','x','c','v','b','n','m','⌫'],
]
const V3_KB_NUM = [
  ['1','2','3','4','5','6','7','8','9','0'],
  ['-','_','.','@','#','!','&','*','(',')',],
  ['ABC','/','\\',':',';',"'",'"',',','⌫'],
]

function V3Keyboard({ value, onChange, onDone }: { value: string; onChange: (v: string) => void; onDone: () => void }) {
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

  const rows = numMode ? V3_KB_NUM : V3_KB_ALPHA

  return (
    <div className="flex flex-col gap-1.5 px-3 pb-4 pt-3" style={{ background: 'rgba(10,10,15,0.98)', backdropFilter: 'blur(16px)', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
      {rows.map((row, ri) => (
        <div key={ri} className="flex gap-1.5 w-full">
          {row.map(key => {
            const isSpecial = key === 'SHIFT' || key === '⌫' || key === 'ABC' || key === '123'
            const isShiftActive = key === 'SHIFT' && caps
            return (
              <button
                key={key}
                onPointerDown={e => { e.preventDefault(); press(key) }}
                className="rounded-lg flex items-center justify-center font-semibold transition-all active:scale-95 select-none"
                style={{
                  height: 46,
                  flex: isSpecial ? '0 0 9%' : '1 1 0',
                  minWidth: 0,
                  background: isShiftActive ? '#FFC107' : isSpecial ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.12)',
                  color: isShiftActive ? '#000' : '#fff',
                  fontSize: key === '⌫' ? 14 : 16,
                  boxShadow: '0 2px 0 rgba(0,0,0,0.5)',
                  fontFamily: 'Inter, system-ui, sans-serif',
                  border: '1px solid rgba(255,255,255,0.06)',
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
          className="rounded-lg flex items-center justify-center font-semibold active:scale-95"
          style={{ height: 46, flex: '0 0 9%', background: 'rgba(255,255,255,0.08)', color: '#fff', fontSize: 13, boxShadow: '0 2px 0 rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.06)', fontFamily: 'Inter, system-ui, sans-serif' }}
        >
          {numMode ? 'ABC' : '123'}
        </button>
        <button
          onPointerDown={e => { e.preventDefault(); onChange(value + ' ') }}
          className="rounded-lg flex-1 flex items-center justify-center active:scale-95"
          style={{ height: 46, background: 'rgba(255,255,255,0.12)', color: '#fff', fontSize: 13, boxShadow: '0 2px 0 rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.06)', fontFamily: 'Inter, system-ui, sans-serif' }}
        >
          spasi
        </button>
        {['@', '.'].map(ch => (
          <button
            key={ch}
            onPointerDown={e => { e.preventDefault(); onChange(value + ch) }}
            className="rounded-lg flex items-center justify-center font-bold active:scale-95"
            style={{ height: 46, flex: '0 0 7%', background: 'rgba(255,255,255,0.12)', color: '#fff', fontSize: 18, boxShadow: '0 2px 0 rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.06)' }}
          >
            {ch}
          </button>
        ))}
        <button
          onPointerDown={e => { e.preventDefault(); onDone() }}
          className="rounded-lg flex items-center justify-center font-black active:scale-95"
          style={{ height: 46, flex: '0 0 13%', background: '#FFC107', color: '#000', fontSize: 13, boxShadow: '0 2px 0 rgba(0,0,0,0.5)', fontFamily: 'Inter, system-ui, sans-serif' }}
        >
          Kirim
        </button>
      </div>
    </div>
  )
}

export default function ClientBoothV3() {
  const { boothId = 'default' } = useParams<{ boothId: string }>()
  const [searchParams] = useSearchParams()
  const stepParam = searchParams.get('step')
  const initialStep: Step = stepParam === 'qris' ? 'payment' : (stepParam as Step | null) ?? 'start'

  const [step, setStep] = useState<Step>(initialStep)
  const [selectedCategory, setSelectedCategory] = useState('SEMUA')
  const [selectedFrame, setSelectedFrame]       = useState('frame1')
  const [activeFilter, setActiveFilter]         = useState('Original')
  const [selectedPackage, setSelectedPackage]   = useState<StoreCategory | null>(null)
  const [showQtyModal, setShowQtyModal]         = useState(false)
  const [qty, setQty]                           = useState(1)
  const [countdown, setCountdown]               = useState<number | null>(null)
  const TOTAL                                   = 3
  const [photosTaken, setPhotosTaken]           = useState(0)
  const [storeCategories, setStoreCategories]   = useState<StoreCategory[]>(() => getCategories())
  const [uiConfig, setUiConfig]                 = useState<BoothUIConfig>(() => getUIConfig(boothId))
  const { stickers, addSticker, moveSticker, removeSticker } = useStickers()
  const [dlEmail, setDlEmail] = useState('')
  const [dlSent, setDlSent] = useState(false)
  const [dlError, setDlError] = useState(false)
  const [dlKbOpen, setDlKbOpen] = useState(false)
  const [dlTimer, setDlTimer] = useState(60)

  useEffect(() => subscribeCategories(setStoreCategories), [])
  useEffect(() => {
    setUiConfig(getUIConfig(boothId))
    return subscribeUIConfig(boothId, setUiConfig)
  }, [boothId])

  const nextStep = (target: Step) => setStep(target)

  useEffect(() => {
    if (step !== 'session' || countdown === null) return
    if (countdown > 0) {
      const t = setTimeout(() => setCountdown(c => (c ?? 1) - 1), 1000)
      return () => clearTimeout(t)
    }
    const t = setTimeout(() => { setCountdown(null); setPhotosTaken(p => p + 1) }, 500)
    return () => clearTimeout(t)
  }, [step, countdown])

  const startCapture = () => { if (photosTaken < TOTAL) setCountdown(5) }

  useEffect(() => {
    if (!dlSent) return
    const t = setInterval(() => setDlTimer(s => (s > 0 ? s - 1 : 0)), 1000)
    return () => clearInterval(t)
  }, [dlSent])

  function handleDlSend() {
    const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dlEmail.trim())
    if (!valid) { setDlError(true); setTimeout(() => setDlError(false), 1600); return }
    setDlSent(true)
    setDlKbOpen(false)
  }

  function resetDownload() {
    setDlEmail(''); setDlSent(false); setDlError(false); setDlKbOpen(false); setDlTimer(60)
  }

  useEffect(() => {
    if (step !== 'loading') return
    const t = setTimeout(() => nextStep('download'), 3000)
    return () => clearTimeout(t)
  }, [step])

  const filterCls = (f: string) =>
    f === 'B&W' ? 'grayscale' : f === 'Noir' ? 'contrast-125 grayscale' : f === 'Vintage' ? 'sepia' : ''

  const StripPreview = ({ scale = 1 }: { scale?: number }) => (
    <div
      className="bg-[#CD1C33] flex flex-col gap-1.5 shadow-xl relative"
      style={{ width: 110 * scale, padding: `${8 * scale}px`, paddingBottom: `${28 * scale}px` }}
    >
      {/* film holes */}
      <div className="absolute left-0 top-0 bottom-0 w-[10px] flex flex-col justify-around items-center">
        {Array.from({ length: 8 }).map((_, i) => <div key={i} className="w-[5px] h-[5px] rounded-full bg-black/20" />)}
      </div>
      <div className="absolute right-0 top-0 bottom-0 w-[10px] flex flex-col justify-around items-center">
        {Array.from({ length: 8 }).map((_, i) => <div key={i} className="w-[5px] h-[5px] rounded-full bg-black/20" />)}
      </div>
      <div className="text-white text-center font-bold tracking-widest ml-2 mr-2" style={{ fontSize: 7 * scale, marginBottom: 4 * scale, fontFamily: "'Playfair Display', serif" }}>
        ✦ OUR STUDIO ✦
      </div>
      {[1, 2, 3].map(i => {
        const filled = i <= photosTaken
        return (
          <div key={i} className={`bg-gray-100 border border-gray-200 flex items-center justify-center overflow-hidden mx-2 ${filterCls(activeFilter)}`} style={{ aspectRatio: '4/3' }}>
            {filled
              ? <Camera className="opacity-20 text-gray-600" style={{ width: 18 * scale, height: 18 * scale }} />
              : <span className="text-gray-400 font-medium" style={{ fontSize: 9 * scale }}>Foto {i}</span>}
          </div>
        )
      })}
    </div>
  )

  const VISIBLE_STEPS: Step[] = ['package', 'payment', 'frame', 'session', 'filter']
  const Stepper = () => {
    const cur = VISIBLE_STEPS.indexOf(step)
    return (
      <div className="flex items-center gap-1.5">
        {VISIBLE_STEPS.map((s, i) => {
          const done   = cur > i
          const active = cur === i
          return (
            <div key={s} className="flex items-center gap-1.5">
              <div className={`w-7 h-7 rounded-full text-[9px] font-black flex items-center justify-center border-2 transition-all
                ${done ? 'bg-[#FFC107] border-[#FFC107] text-black' : active ? 'bg-white border-white text-[#CD1C33]' : 'bg-transparent border-white/30 text-white/40'}`}>
                {done ? <Check size={10} strokeWidth={3} /> : i + 1}
              </div>
              {i < VISIBLE_STEPS.length - 1 && (
                <div className={`w-6 h-[2px] rounded-full ${done ? 'bg-[#FFC107]' : 'bg-white/20'}`} />
              )}
            </div>
          )
        })}
      </div>
    )
  }

  const Header = ({ title, sub }: { title: string; sub?: string }) => (
    <div className="h-[68px] bg-[#CD1C33] flex items-center justify-between px-8 shadow-lg shrink-0 z-20 relative overflow-hidden">
      {/* background stripe pattern */}
      <div className="absolute inset-0 opacity-[0.06]" style={{ backgroundImage: 'repeating-linear-gradient(90deg, transparent, transparent 20px, #fff 20px, #fff 40px)' }} />
      <div className="relative">
        <h1 className="text-xl text-white font-serif-custom font-bold tracking-[0.15em] leading-none">{title}</h1>
        {sub && <p className="text-white/50 text-[8px] uppercase tracking-[0.3em] mt-1">{sub}</p>}
      </div>
      <Stepper />
    </div>
  )

  /* ── Decorative film strip bar ───────────────────────────────────────── */
  const FilmBar = ({ color = '#1a1a1a' }: { color?: string }) => (
    <div className="h-6 flex items-center" style={{ background: color }}>
      <div className="flex gap-2 px-3">
        {Array.from({ length: 40 }).map((_, i) => (
          <div key={i} className="w-5 h-3 rounded-[2px] bg-white/10 border border-white/5" />
        ))}
      </div>
    </div>
  )

  return (
    <div className="w-screen h-screen overflow-hidden text-gray-800 bg-gray-900 flex items-center justify-center" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Dancing+Script:wght@700&family=Playfair+Display:ital,wght@0,400;0,700;1,700&family=Inter:wght@400;500;600;700&display=swap');
        .font-serif-custom { font-family: 'Playfair Display', serif; }
        .font-cursive       { font-family: 'Dancing Script', cursive; }

        .bg-red-stripes {
          background-color: #CD1C33;
          background-image: repeating-linear-gradient(90deg, transparent, transparent 40px, rgba(0,0,0,0.05) 40px, rgba(0,0,0,0.05) 80px);
        }
        .bg-green-stripes {
          background-color: #0E8E5E;
          background-image: repeating-linear-gradient(90deg, transparent, transparent 40px, rgba(0,0,0,0.07) 40px, rgba(0,0,0,0.07) 80px);
        }
        .bg-checker {
          background-color: #fdfdfd;
          background-image: repeating-linear-gradient(45deg, #f0f0f0 25%, transparent 25%, transparent 75%, #f0f0f0 75%),
                            repeating-linear-gradient(45deg, #f0f0f0 25%, #fdfdfd 25%, #fdfdfd 75%, #f0f0f0 75%);
          background-size: 20px 20px;
          background-position: 0 0, 10px 10px;
        }

        .ticket-both { position: relative; }
        .ticket-both::before {
          content: ""; position: absolute; top: 0; bottom: 0; left: -7px; width: 7px;
          background-image: radial-gradient(circle at 0px 9px, transparent 4px, #ffffff 4.5px);
          background-size: 7px 18px;
        }
        .ticket-both::after {
          content: ""; position: absolute; top: 0; bottom: 0; right: -7px; width: 7px;
          background-image: radial-gradient(circle at 7px 9px, transparent 4px, #ffffff 4.5px);
          background-size: 7px 18px;
        }
        .ticket-left { position: relative; }
        .ticket-left::before {
          content: ""; position: absolute; top: 0; bottom: 0; left: -8px; width: 8px;
          background-image: radial-gradient(circle at 0px 10px, transparent 4px, #ffffff 4.5px);
          background-size: 8px 20px;
        }
        .ticket-right { position: relative; }
        .ticket-right::after {
          content: ""; position: absolute; top: 0; bottom: 0; right: -8px; width: 8px;
          background-image: radial-gradient(circle at 8px 10px, transparent 4px, #ffffff 4.5px);
          background-size: 8px 20px;
        }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }

        @keyframes float { 0%,100% { transform: translateY(0) rotate(-4deg); } 50% { transform: translateY(-8px) rotate(-4deg); } }
        @keyframes float2 { 0%,100% { transform: translateY(0) rotate(3deg); } 50% { transform: translateY(-6px) rotate(3deg); } }
        .animate-float  { animation: float  3s ease-in-out infinite; }
        .animate-float2 { animation: float2 3.5s ease-in-out infinite; }
      `}</style>

      <main className="w-full h-full max-w-[1920px] max-h-[1080px] bg-white relative flex shadow-2xl overflow-hidden flex-col">

        {/* ─── START ───────────────────────────────────────────────────────── */}
        {step === 'start' && (
          <div className="w-full h-full bg-red-stripes flex flex-col">
            <FilmBar />

            <div className="flex-1 flex">
              {/* LEFT */}
              <div className="w-[50%] h-full flex items-center justify-center relative">
                {/* scattered polaroids */}
                <div className="bg-[#FFC107] p-3 pb-10 w-[220px] shadow-2xl animate-float2 absolute top-16 left-24 z-10 border border-yellow-300">
                  <div className="w-full aspect-[4/3] bg-amber-100 border border-amber-200 flex items-center justify-center">
                    <ImageIcon className="text-amber-400" size={36} strokeWidth={1.2} />
                  </div>
                  <p className="text-[8px] font-bold text-center text-amber-800 tracking-widest mt-2 uppercase">Our Moment ✦</p>
                </div>
                <div className="bg-white p-3 pb-10 w-[240px] shadow-2xl animate-float absolute top-32 left-44 z-20 border border-gray-100">
                  <div className="w-full aspect-[4/3] bg-gray-100 border border-gray-200 flex items-center justify-center">
                    <Camera className="text-gray-300" size={40} strokeWidth={1.2} />
                  </div>
                  <p className="text-[8px] font-bold text-center text-gray-400 tracking-widest mt-2 uppercase">Click ✦ Capture</p>
                </div>
                <div className="bg-[#0E8E5E] p-3 pb-10 w-[200px] shadow-xl absolute bottom-24 left-20 z-30 border border-green-800" style={{ transform: 'rotate(-2deg)' }}>
                  <div className="w-full aspect-[4/3] bg-green-700 border border-green-600 flex items-center justify-center">
                    <Star className="text-[#FFC107]" size={32} strokeWidth={1.2} fill="#FFC107" />
                  </div>
                  <p className="text-[8px] font-bold text-center text-green-100 tracking-widest mt-2 uppercase">Memories ✦</p>
                </div>

                {/* floating sticker */}
                <div className="absolute bottom-28 right-8 w-20 h-20 rounded-full bg-[#FFC107] border-4 border-white shadow-xl flex flex-col items-center justify-center z-40 rotate-12">
                  <span className="text-[8px] font-black text-black leading-tight text-center tracking-tight">NEW<br />LOOK</span>
                </div>
              </div>

              {/* RIGHT */}
              <div className="w-[50%] h-full flex flex-col items-start justify-center text-white pr-16 gap-4 relative">
                {/* stamp */}
                <div className="absolute top-8 right-10 w-24 h-24 rounded-full border-[3px] border-dashed border-white/20 flex flex-col items-center justify-center text-white/25 text-center">
                  <span className="text-[8px] font-bold tracking-widest leading-tight">PHOTO<br />BOOTH<br />2025</span>
                </div>

                <p className="text-white/50 text-[10px] font-bold tracking-[0.5em] uppercase">✦ Potohub Studio ✦</p>

                <h1 className="font-serif-custom font-bold leading-[0.82] tracking-tight drop-shadow-lg text-[6rem] lg:text-[7.5rem]">
                  {uiConfig.boothName}
                </h1>

                <div className="flex items-center gap-3">
                  <div className="w-10 h-[1.5px] bg-white/30" />
                  <p className="font-cursive text-4xl text-white/80 drop-shadow-md -rotate-[2deg]">{uiConfig.tagline}</p>
                </div>

                <div className="flex items-center gap-4 mt-4">
                  <button
                    onClick={() => nextStep('tutorial')}
                    className="bg-white text-[#CD1C33] px-10 py-3.5 rounded-full text-base font-black tracking-[0.2em] hover:scale-105 active:scale-95 transition-transform shadow-2xl uppercase"
                  >
                    Mulai Sekarang
                  </button>
                  <div className="w-10 h-10 rounded-full border-2 border-white/30 flex items-center justify-center text-white/50 text-lg">
                    ↓
                  </div>
                </div>

                {/* tagline strip */}
                <div className="absolute bottom-0 left-0 right-0 h-8 bg-black/20 flex items-center overflow-hidden">
                  <div className="flex gap-8 animate-marquee whitespace-nowrap text-white/40 text-[9px] font-bold tracking-widest uppercase">
                    {Array.from({ length: 8 }).map((_, i) => <span key={i}>✦ CETAK FOTO ✦ INGAT KENANGAN ✦ POTOHUB STUDIO ✦ FOTO BOOTH</span>)}
                  </div>
                </div>
              </div>
            </div>

            <FilmBar />
          </div>
        )}

        {/* ─── TUTORIAL ────────────────────────────────────────────────────── */}
        {step === 'tutorial' && (
          <div className="w-full h-full flex flex-col bg-[#fdfdfd]">
            {/* top bar */}
            <div className="bg-[#1a1a1a] h-10 flex items-center px-8 gap-3 shrink-0">
              {['#CD1C33','#FFC107','#0E8E5E'].map(c => <div key={c} className="w-3 h-3 rounded-full" style={{ background: c }} />)}
              <span className="text-white/30 text-[10px] font-mono tracking-widest ml-4">PANDUAN PENGGUNAAN</span>
            </div>

            <div className="flex-1 flex flex-col items-center justify-center px-16 gap-10 relative overflow-hidden">
              {/* big decorative number */}
              <div className="absolute -left-8 top-1/2 -translate-y-1/2 text-[280px] font-black text-gray-100 leading-none select-none pointer-events-none font-serif-custom">?</div>

              <div className="text-center relative z-10">
                <div className="inline-flex items-center gap-2 bg-[#CD1C33] text-white text-[9px] font-bold tracking-[0.3em] uppercase px-4 py-1.5 rounded-full mb-4">
                  <Star size={9} fill="white" /> Panduan Singkat
                </div>
                <h2 className="text-5xl font-serif-custom text-gray-800">
                  Gimana <span className="text-[#CD1C33] italic">caranya?</span>
                </h2>
              </div>

              <div className="grid grid-cols-4 gap-5 w-full max-w-5xl relative z-10">
                {[
                  { n: 1, icon: <QrCode size={32} className="text-[#CD1C33]" strokeWidth={1.5} />,    title: 'Bayar Dulu',          desc: 'QRIS atau voucher code',  bg: '#fef2f2', accent: '#CD1C33' },
                  { n: 2, icon: <ImageIcon size={32} className="text-[#0E8E5E]" strokeWidth={1.5} />, title: 'Pilih Frame',         desc: '10+ pilihan tersedia',    bg: '#f0faf5', accent: '#0E8E5E' },
                  { n: 3, icon: <Camera size={32} className="text-[#1a1a1a]" strokeWidth={1.5} />,    title: 'Pose & Foto',         desc: 'Countdown 5 detik',       bg: '#f7f7f7', accent: '#1a1a1a' },
                  { n: 4, icon: <Download size={32} className="text-[#FFC107]" strokeWidth={1.5} />,  title: 'Unduh Hasilnya',      desc: 'Scan QR, foto tersimpan', bg: '#fffbeb', accent: '#d97706' },
                ].map(item => (
                  <div key={item.n} className="rounded-2xl p-5 flex flex-col gap-3 border border-gray-100 shadow-sm hover:shadow-md transition-all relative overflow-hidden" style={{ background: item.bg }}>
                    <div className="absolute top-3 right-3 text-[48px] font-black opacity-[0.06] font-serif-custom leading-none" style={{ color: item.accent }}>{item.n}</div>
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-white shadow-sm shrink-0">{item.icon}</div>
                    <div>
                      <div className="font-black text-gray-800 text-sm">{item.title}</div>
                      <div className="text-xs text-gray-400 mt-0.5">{item.desc}</div>
                    </div>
                    <div className="h-[2px] w-8 rounded-full mt-auto" style={{ background: item.accent }} />
                  </div>
                ))}
              </div>

              <button
                onClick={() => nextStep('package')}
                className="relative z-10 bg-[#CD1C33] text-white px-14 py-3.5 rounded-full text-sm font-black tracking-[0.2em] uppercase hover:bg-[#A31327] transition-colors shadow-xl flex items-center gap-2"
              >
                Siap! Mulai <ChevronRight size={16} strokeWidth={3} />
              </button>
            </div>

            <div className="h-3 bg-[#CD1C33] shrink-0" />
          </div>
        )}

        {/* ─── METODE PEMBAYARAN ───────────────────────────────────────────── */}
        {step === 'package' && (
          <div className="w-full h-full flex flex-col">
            <Header title="Metode Pembayaran" sub="Langkah 1 dari 5" />

            <div className="flex-1 flex">
              {/* LEFT info */}
              <div className="w-[40%] h-full bg-green-stripes flex flex-col items-center justify-center gap-0 relative overflow-hidden">
                {/* decorative vertical text */}
                <div className="absolute right-0 top-0 bottom-0 w-8 bg-black/10 flex items-center justify-center">
                  <span className="text-white/20 text-[9px] font-bold tracking-[0.4em] uppercase rotate-90 whitespace-nowrap">STEP 1 · BAYAR</span>
                </div>

                <div className="bg-[#fdfdfd] ticket-right w-[82%] h-[86%] shadow-2xl flex flex-col items-center justify-between py-8 px-8 gap-0">
                  {/* top label */}
                  <div className="w-full flex items-center justify-between">
                    <div className="text-[9px] font-bold text-gray-400 uppercase tracking-[0.25em]">Pilih Cara Bayar</div>
                    <div className="w-5 h-5 rounded-full bg-[#CD1C33] flex items-center justify-center">
                      <span className="text-white text-[8px] font-black">1</span>
                    </div>
                  </div>

                  {/* strip preview decorated */}
                  <div className="flex flex-col items-center gap-3">
                    <div className="relative">
                      <StripPreview scale={1.25} />
                      {/* sticker overlay */}
                      <div className="absolute -top-4 -right-6 w-12 h-12 rounded-full bg-[#FFC107] border-2 border-white shadow-lg flex flex-col items-center justify-center rotate-12">
                        <span className="text-[7px] font-black text-black leading-none text-center">HOT<br />DEAL</span>
                      </div>
                    </div>
                    <p className="text-xs text-gray-400 text-center leading-relaxed">
                      Mulai dari <span className="font-bold text-[#CD1C33]">Rp 35.000</span><br />untuk 1 strip foto
                    </p>
                  </div>

                  {/* info rows */}
                  <div className="w-full border border-dashed border-gray-200 rounded-xl p-4 flex flex-col gap-2">
                    {[
                      { k: 'Format', v: '4R / Strip' },
                      { k: 'Cetak', v: '1–10 lembar' },
                      { k: 'Waktu', v: '± 2 menit' },
                    ].map(r => (
                      <div key={r.k} className="flex justify-between text-xs">
                        <span className="text-gray-400">{r.k}</span>
                        <span className="font-bold text-gray-700">{r.v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* RIGHT: payment buttons */}
              <div className="flex-1 bg-[#CD1C33] flex flex-col items-center justify-center gap-8 p-10 relative overflow-hidden">
                {/* bg decoration */}
                <div className="absolute top-6 left-6 text-white/5 text-[120px] font-black font-serif-custom leading-none select-none">Rp</div>
                <div className="absolute bottom-6 right-6 w-32 h-32 rounded-full border-[3px] border-dashed border-white/10" />
                <div className="absolute bottom-10 right-10 w-20 h-20 rounded-full border-[3px] border-dashed border-white/10" />

                <div className="text-center relative z-10">
                  <p className="text-white/50 text-[9px] font-bold tracking-[0.4em] uppercase mb-2">✦ Pilih Salah Satu ✦</p>
                  <h1 className="text-5xl font-serif-custom font-bold text-white tracking-widest drop-shadow-lg">Bayar Sekarang</h1>
                </div>

                <div className="flex gap-6 relative z-10">
                  {[
                    { icon: <QrCode size={52} strokeWidth={1.2} />, label: 'QRIS',   sub: 'Scan & bayar instan',    badge: 'Populer', action: () => setShowQtyModal(true) },
                    { icon: <Ticket size={52} strokeWidth={1.2} />, label: 'Ticket', sub: 'Scan atau masukkan kode',  badge: null,      action: () => nextStep('ticket') },
                  ].map(opt => (
                    <button
                      key={opt.label}
                      onClick={opt.action}
                      className="group bg-[#fdfdfd] ticket-both flex flex-col items-center gap-4 px-10 py-8 w-[220px] shadow-2xl hover:-translate-y-2 hover:shadow-[0_28px_48px_rgba(0,0,0,0.35)] active:scale-95 transition-all relative"
                    >
                      {opt.badge && (
                        <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#FFC107] text-black text-[8px] font-black tracking-widest px-3 py-0.5 rounded-full uppercase shadow-md">
                          {opt.badge}
                        </div>
                      )}
                      <div className="text-[#CD1C33] group-hover:scale-110 transition-transform mt-1">{opt.icon}</div>
                      <div className="text-center">
                        <div className="text-base font-black tracking-[0.15em] uppercase text-gray-800">{opt.label}</div>
                        <div className="text-[9px] text-gray-400 mt-1 leading-tight">{opt.sub}</div>
                      </div>
                      <div className="w-full flex items-center gap-2">
                        <div className="flex-1 h-[1px] bg-gray-100" />
                        <ChevronRight size={12} className="text-[#CD1C33] opacity-60" />
                        <div className="flex-1 h-[1px] bg-gray-100" />
                      </div>
                    </button>
                  ))}
                </div>

                {/* dynamic payment method chips from uiConfig */}
                {uiConfig.paymentMethods.length > 0 && (
                  <div className="flex flex-wrap gap-2 justify-center relative z-10 max-w-xs">
                    {uiConfig.paymentMethods.map((m, i) => (
                      <div key={i} className="bg-white/15 border border-white/25 text-white text-[10px] font-bold px-3 py-1 rounded-lg">
                        {m}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Quantity modal */}
            {showQtyModal && (
              <div className="absolute inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(20,20,20,0.7)', backdropFilter: 'blur(8px)' }}>
                <div className="bg-[#fdfdfd] ticket-both w-[400px] p-10 flex flex-col items-center shadow-2xl relative">
                  <button onClick={() => setShowQtyModal(false)} className="absolute top-4 right-4 w-7 h-7 rounded-full bg-[#CD1C33] text-white text-xs font-black flex items-center justify-center hover:bg-[#A31327] transition-colors">✕</button>

                  <div className="w-full bg-[#CD1C33] -mx-10 -mt-10 mb-6 px-10 py-5 flex flex-col items-center" style={{ marginLeft: -40, marginRight: -40, width: 'calc(100% + 80px)' }}>
                    <p className="text-white/70 text-[9px] font-bold tracking-[0.3em] uppercase mb-1">Jumlah Cetak</p>
                    <h3 className="text-2xl font-serif-custom font-bold text-white">Print Quantity</h3>
                  </div>

                  <div className="flex items-center gap-6 mb-5">
                    <button onClick={() => setQty(q => Math.max(1, q - 1))} className="w-11 h-11 rounded-full border-2 border-[#CD1C33] text-[#CD1C33] text-xl font-black flex items-center justify-center hover:bg-[#CD1C33] hover:text-white transition-colors">−</button>
                    <span className="text-5xl font-black text-gray-800 w-12 text-center font-serif-custom">{qty}</span>
                    <button onClick={() => setQty(q => Math.min(10, q + 1))} className="w-11 h-11 rounded-full border-2 border-[#CD1C33] text-[#CD1C33] text-xl font-black flex items-center justify-center hover:bg-[#CD1C33] hover:text-white transition-colors">+</button>
                  </div>

                  <div className="text-3xl font-black text-[#CD1C33] font-serif-custom mb-1">
                    Rp {((selectedPackage?.basePrice ?? 35000) * qty).toLocaleString('id-ID')}
                  </div>
                  <p className="text-[10px] text-gray-400 tracking-widest mb-8">
                    {qty} × Rp {(selectedPackage?.basePrice ?? 35000).toLocaleString('id-ID')}
                  </p>

                  <button
                    onClick={() => { setShowQtyModal(false); nextStep('payment') }}
                    className="w-full py-3.5 bg-[#0E8E5E] text-white font-bold tracking-widest uppercase rounded-full hover:bg-[#0b7a50] transition-colors shadow-md text-sm"
                  >
                    Lanjut ke Pembayaran →
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ─── PEMBAYARAN ──────────────────────────────────────────────────── */}
        {step === 'payment' && (
          <div className="w-full h-full flex flex-col">
            <Header title="Pembayaran" sub="Scan QRIS untuk melanjutkan" />

            <div className="flex-1 bg-checker flex items-center justify-center gap-8 px-16">
              {/* QRIS card */}
              <div className="bg-white ticket-both w-[360px] shadow-2xl flex flex-col overflow-hidden">
                <div className="bg-[#1a1a1a] px-6 py-3 flex items-center justify-between">
                  <span className="font-black text-lg italic tracking-tighter text-white">QRIS</span>
                  <div className="flex gap-1">
                    {['#CD1C33','#FFC107','#0E8E5E'].map(c => <div key={c} className="w-2 h-2 rounded-full" style={{ background: c }} />)}
                  </div>
                </div>
                <div className="p-6 flex flex-col items-center gap-4">
                  <div className="p-3 border-2 border-gray-100 rounded-xl bg-white shadow-inner">
                    <QRCodeSVG value="https://potohub.com/pay" size={190} />
                  </div>
                  <p className="text-[9px] text-gray-400 tracking-widest uppercase font-bold">Scan menggunakan aplikasi bank kamu</p>
                  <div className="w-full border-t border-dashed border-gray-200 pt-3 flex items-center justify-between">
                    <span className="text-[10px] text-gray-400">Powered by</span>
                    <span className="text-[10px] font-black text-gray-700 tracking-widest">GPN ✦ QRIS</span>
                  </div>
                </div>
              </div>

              {/* Total card */}
              <div className="bg-white ticket-both w-[320px] shadow-2xl flex flex-col overflow-hidden">
                <div className="bg-[#CD1C33] px-6 py-3 flex items-center gap-2">
                  <span className="text-white/70 text-[9px] font-bold uppercase tracking-[0.25em]">Total Tagihan</span>
                </div>
                <div className="p-6 flex flex-col items-center gap-4">
                  <div className="text-center">
                    <div className="text-5xl font-serif-custom font-black text-[#CD1C33]">
                      Rp {((selectedPackage?.basePrice ?? 35000) * qty).toLocaleString('id-ID')}
                    </div>
                    <p className="text-xs text-gray-400 mt-1">{selectedPackage?.name ?? 'Basic Frames'} · {qty} lembar</p>
                  </div>

                  <div className="w-full border border-dashed border-gray-200 rounded-xl p-4 flex flex-col gap-2.5">
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-400">Harga satuan</span>
                      <span className="font-bold">Rp {(selectedPackage?.basePrice ?? 35000).toLocaleString('id-ID')}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-400">Jumlah cetak</span>
                      <span className="font-bold">{qty} lembar</span>
                    </div>
                    <div className="border-t border-gray-100 pt-2 flex justify-between text-xs">
                      <span className="font-bold text-gray-600">Total</span>
                      <span className="font-black text-[#CD1C33]">Rp {((selectedPackage?.basePrice ?? 35000) * qty).toLocaleString('id-ID')}</span>
                    </div>
                  </div>

                  <div className="w-full bg-[#0E8E5E] text-white px-5 py-2.5 rounded-full font-mono text-base font-bold flex items-center justify-center gap-2 shadow">
                    <Clock size={15} /> Bayar sebelum 10:00
                  </div>

                  <button onClick={() => nextStep('frame')} className="w-full py-2.5 border-2 border-[#0E8E5E] text-[#0E8E5E] rounded-full font-bold text-xs tracking-widest uppercase hover:bg-[#f0faf5] transition-colors">
                    Cek Status Pembayaran
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ─── SCAN TICKET ─────────────────────────────────────────────────── */}
        {step === 'ticket' && (
          <div className="w-full h-full flex flex-col" style={{ background: '#111' }}>
            <Header title="Scan Tiket" sub="Tempelkan tiket ke scanner atau masukkan kode" />
            <div className="flex-1 flex items-center justify-center px-8 gap-10">
              {/* scanner box */}
              <div className="flex flex-col items-center gap-6">
                <div className="relative w-56 h-56 rounded-2xl overflow-hidden bg-black border-2 border-white/20 flex items-center justify-center">
                  {[['top-3 left-3','border-t-4 border-l-4'],['top-3 right-3','border-t-4 border-r-4'],['bottom-3 left-3','border-b-4 border-l-4'],['bottom-3 right-3','border-b-4 border-r-4']].map(([pos,bdr]) => (
                    <div key={pos} className={`absolute ${pos} w-7 h-7 border-[#FFC107] ${bdr}`} />
                  ))}
                  <div className="absolute inset-x-3 h-0.5 bg-[#FFC107]/80 animate-bounce rounded" style={{ top: '48%' }} />
                  <Ticket size={52} strokeWidth={1} className="text-white/10" />
                </div>
                <p className="text-white/40 text-xs tracking-[0.3em] uppercase">Arahkan tiket ke kamera</p>
              </div>

              {/* divider */}
              <div className="flex flex-col items-center gap-3 text-white/20">
                <div className="w-px h-16 bg-white/15" />
                <span className="text-xs tracking-widest">atau</span>
                <div className="w-px h-16 bg-white/15" />
              </div>

              {/* manual input */}
              <div className="flex flex-col gap-4 w-72">
                <p className="text-white/60 text-xs tracking-[0.25em] uppercase font-bold text-center">Masukkan Kode Tiket</p>
                <V3TicketInput onConfirm={() => nextStep('frame')} />
                <button onClick={() => nextStep('payment')} className="text-white/30 text-xs tracking-wider hover:text-white/60 transition-colors text-center mt-1">
                  ← Ganti Metode Pembayaran
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ─── PILIH FRAME ─────────────────────────────────────────────────── */}
        {step === 'frame' && (
          <div className="w-full h-full flex flex-col">
            {/* Header with dynamic title style from uiConfig */}
            <div className="h-[68px] bg-[#CD1C33] flex items-center justify-between px-8 shadow-lg shrink-0 z-20 relative overflow-hidden">
              <div className="absolute inset-0 opacity-[0.06]" style={{ backgroundImage: 'repeating-linear-gradient(90deg, transparent, transparent 20px, #fff 20px, #fff 40px)' }} />
              <div className="relative">
                <h1
                  className="font-bold tracking-[0.15em] leading-none"
                  style={{
                    color:      uiConfig.frameTitleStyle.color,
                    fontFamily: FONT_MAP[uiConfig.frameTitleStyle.font],
                    fontSize:   SIZE_MAP[uiConfig.frameTitleStyle.size],
                  }}
                >
                  Pilih Kategori
                </h1>
                <p className="text-white/50 text-[8px] uppercase tracking-[0.3em] mt-1">10 frame tersedia · Pilih favoritmu</p>
              </div>
              <Stepper />
            </div>

            {/* Category bar */}
            <div className="h-12 bg-[#1a1a1a] flex items-center justify-center gap-2 shrink-0 px-6 overflow-x-auto no-scrollbar">
              <span className="text-white/20 text-[8px] font-bold tracking-widest uppercase mr-2 shrink-0">Kategori:</span>
              {['SEMUA', ...uiConfig.frameCategories].map(cat => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-5 py-1 rounded-full text-[10px] font-bold tracking-[0.15em] transition-all uppercase shrink-0 ${selectedCategory === cat ? 'bg-[#FFC107] text-black shadow-md scale-105' : 'bg-white/10 text-white/50 hover:bg-white/15 hover:text-white'}`}
                >
                  {cat}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto no-scrollbar bg-[#f5f5f5] p-6">
              <div className="grid grid-cols-5 gap-4 max-w-5xl mx-auto pb-2">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(i => (
                  <div
                    key={i}
                    onClick={() => { setSelectedFrame(`frame${i}`); nextStep('session') }}
                    className={`bg-white rounded-2xl overflow-hidden cursor-pointer transition-all flex flex-col border-2 ${selectedFrame === `frame${i}` ? 'border-[#CD1C33] shadow-xl scale-[1.02]' : 'border-transparent shadow-sm hover:shadow-lg hover:border-gray-200'}`}
                  >
                    {/* color band */}
                    <div className="h-1.5 w-full" style={{ background: `hsl(${(i * 37) % 360}, 70%, 60%)` }} />

                    <div className="p-3 flex flex-col gap-2.5">
                      <div className="flex justify-between items-start">
                        <span className={`text-[11px] font-black ${selectedFrame === `frame${i}` ? 'text-[#CD1C33]' : 'text-gray-700'}`}>Vintage {i}</span>
                        <span className="text-[8px] text-gray-300 font-medium bg-gray-50 px-1.5 py-0.5 rounded-full">3 foto</span>
                      </div>

                      <div className="w-full aspect-[9/16] rounded-lg overflow-hidden bg-gray-50 flex flex-col gap-0.5 p-1">
                        {[0,1,2].map(j => (
                          <div key={j} className="flex-1 rounded-md" style={{ background: `hsl(${((i * 37) + j * 40) % 360}, 60%, 75%)` }} />
                        ))}
                      </div>

                      {selectedFrame === `frame${i}` ? (
                        <div className="flex items-center justify-center gap-1 text-[#CD1C33] bg-[#fef2f2] rounded-full py-0.5">
                          <Check size={10} strokeWidth={3} /><span className="text-[9px] font-bold">Dipilih</span>
                        </div>
                      ) : (
                        <div className="text-[9px] text-gray-400 text-center">Tap untuk pilih</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ─── SESI FOTO ───────────────────────────────────────────────────── */}
        {step === 'session' && (
          <div className="w-full h-full flex flex-col">
            <Header title="Sesi Foto" sub={`${photosTaken} dari ${TOTAL} foto sudah diambil`} />

            <div className="flex-1 flex">
              {/* Left strip panel */}
              <div className="w-[34%] h-full bg-[#fdfdfd] flex flex-col items-center justify-center gap-5 p-8 border-r border-gray-100 shadow-[4px_0_16px_rgba(0,0,0,0.05)] z-10">
                <p className="text-[8px] font-bold text-gray-400 uppercase tracking-[0.3em]">✦ Preview Strip ✦</p>

                <div className="relative">
                  <StripPreview scale={1.4} />
                  {/* progress indicator */}
                  {photosTaken > 0 && (
                    <div className="absolute -top-3 -right-3 w-9 h-9 rounded-full bg-[#0E8E5E] border-2 border-white shadow-lg flex items-center justify-center">
                      <span className="text-white text-[10px] font-black">{photosTaken}/{TOTAL}</span>
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  {[1,2,3].map(i => (
                    <div key={i} className={`w-8 h-2 rounded-full transition-all ${i <= photosTaken ? 'bg-[#CD1C33]' : 'bg-gray-200'}`} />
                  ))}
                </div>

                <div className="w-full border border-dashed border-gray-200 rounded-xl p-3">
                  <p className="text-[9px] text-gray-400 text-center">Frame: <span className="font-bold text-gray-600 capitalize">{selectedFrame}</span></p>
                </div>
              </div>

              {/* Right: Camera */}
              <div className="flex-1 bg-green-stripes flex items-center justify-center p-10 relative">
                {/* decorative corners */}
                <div className="absolute top-6 left-6 w-8 h-8 border-t-4 border-l-4 border-white/30 rounded-tl-lg" />
                <div className="absolute top-6 right-6 w-8 h-8 border-t-4 border-r-4 border-white/30 rounded-tr-lg" />
                <div className="absolute bottom-6 left-6 w-8 h-8 border-b-4 border-l-4 border-white/30 rounded-bl-lg" />
                <div className="absolute bottom-6 right-6 w-8 h-8 border-b-4 border-r-4 border-white/30 rounded-br-lg" />

                <div className="w-full max-w-[680px] aspect-[4/3] rounded-2xl overflow-hidden shadow-2xl bg-[#111827] relative flex items-center justify-center border-4 border-[#FFC107]">
                  {/* corner markers */}
                  {['top-2 left-2','top-2 right-2','bottom-2 left-2','bottom-2 right-2'].map(pos => (
                    <div key={pos} className={`absolute ${pos} w-5 h-5 border-2 border-[#FFC107] rounded-sm`} />
                  ))}

                  {countdown !== null ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 z-10">
                      <span className="text-[11rem] font-black text-white leading-none drop-shadow-2xl">{countdown}</span>
                      <span className="text-white/60 text-sm font-bold tracking-widest uppercase">Bersiap!</span>
                    </div>
                  ) : photosTaken >= TOTAL ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 z-10 gap-3">
                      <Sparkles className="text-[#FFC107]" size={40} />
                      <span className="text-4xl font-serif-custom font-bold text-white tracking-widest">Selesai!</span>
                    </div>
                  ) : (
                    <div className="text-white/25 text-xl font-bold uppercase tracking-[0.6em] text-center px-12 leading-loose pointer-events-none select-none">
                      Tap untuk mulai
                    </div>
                  )}
                  {countdown === null && photosTaken < TOTAL && (
                    <button onClick={startCapture} className="absolute inset-0 z-20 cursor-pointer" />
                  )}
                </div>

                {photosTaken >= TOTAL && (
                  <button
                    onClick={() => nextStep('filter')}
                    className="absolute bottom-8 right-8 bg-[#CD1C33] text-white px-8 py-3 rounded-full font-bold shadow-2xl hover:bg-[#A31327] flex items-center gap-2 transition-colors border-2 border-white/20"
                  >
                    Pilih Filter <ChevronRight size={18} strokeWidth={2.5} />
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ─── FILTER ──────────────────────────────────────────────────────── */}
        {step === 'filter' && (
          <div className="w-full h-full flex flex-col">
            <Header title="Pilih Filter & Stiker" sub="Double-klik stiker untuk hapus" />

            <div className="flex-1 flex">
              {/* Left: preview panel with sticker canvas */}
              <div className="w-[42%] h-full bg-green-stripes flex flex-col items-center justify-center gap-5 p-10 relative overflow-hidden z-10">
                <div className="absolute top-4 left-4 text-white/10 text-[80px] font-black font-serif-custom leading-none">✦</div>
                <div className="absolute bottom-4 right-4 text-white/10 text-[80px] font-black font-serif-custom leading-none">★</div>

                <p className="text-white/60 text-[9px] font-bold uppercase tracking-[0.3em] relative z-10">Preview</p>

                <StickerCanvas
                  stickers={stickers}
                  onMove={moveSticker}
                  onRemove={removeSticker}
                  className="relative z-10"
                  containerStyle={{ width: 230, position: 'relative' }}
                >
                  <div className="bg-[#fdfdfd] ticket-both w-[230px] flex items-center justify-center py-10 shadow-2xl">
                    <StripPreview scale={1.5} />
                  </div>
                </StickerCanvas>

                <div className="flex items-center gap-2 bg-black/20 rounded-full px-4 py-1.5 relative z-10">
                  <div className="w-2 h-2 rounded-full bg-[#FFC107]" />
                  <span className="text-white/80 text-[10px] font-bold tracking-widest">{activeFilter}</span>
                </div>
              </div>

              {/* Right: emoji picker + filter selection */}
              <div className="flex-1 bg-[#fdfdfd] flex flex-col px-10 py-8 gap-4 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-24 h-24 rounded-full bg-[#fef2f2] -translate-y-1/2 translate-x-1/2" />

                <EmojiPicker onPick={addSticker} boothId={boothId} />

                <div className="h-px bg-gray-100" />

                <p className="text-[9px] font-bold text-gray-400 uppercase tracking-[0.3em]">Pilih tampilan foto</p>

                <div className="flex flex-col gap-2 flex-1 overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
                  {[
                    { name: 'Original', swatch: 'bg-gradient-to-br from-gray-100 to-gray-200',  desc: 'Warna asli, tanpa edit' },
                    { name: 'B&W',      swatch: 'bg-gradient-to-br from-gray-400 to-gray-700',   desc: 'Hitam putih elegan' },
                    { name: 'Noir',     swatch: 'bg-gradient-to-br from-gray-800 to-black',       desc: 'Gelap dramatis' },
                    { name: 'Vintage',  swatch: 'bg-gradient-to-br from-amber-200 to-orange-300', desc: 'Hangat retro' },
                    { name: 'Vivid',    swatch: 'bg-gradient-to-br from-sky-200 to-blue-400',     desc: 'Cerah mencolok' },
                  ].map(f => (
                    <button
                      key={f.name}
                      onClick={() => setActiveFilter(f.name)}
                      className={`flex items-center gap-4 p-3 rounded-xl border-2 transition-all text-left ${activeFilter === f.name ? 'border-[#CD1C33] bg-[#fff5f5] shadow-md' : 'border-gray-100 bg-white hover:border-gray-200 hover:shadow-sm'}`}
                    >
                      <div className={`w-12 h-8 rounded-lg shrink-0 ${f.swatch}`} />
                      <div className="flex-1 min-w-0">
                        <div className={`font-black text-sm ${activeFilter === f.name ? 'text-[#CD1C33]' : 'text-gray-800'}`}>{f.name}</div>
                        <div className="text-[10px] text-gray-400 truncate">{f.desc}</div>
                      </div>
                      {activeFilter === f.name && (
                        <div className="w-5 h-5 rounded-full bg-[#CD1C33] flex items-center justify-center shrink-0">
                          <Check size={10} className="text-white" strokeWidth={3} />
                        </div>
                      )}
                    </button>
                  ))}
                </div>

                <button
                  onClick={() => nextStep('loading')}
                  className="w-full py-4 bg-[#CD1C33] text-white rounded-xl font-black tracking-widest uppercase hover:bg-[#A31327] transition-colors shadow-lg text-sm flex items-center justify-center gap-2 shrink-0"
                >
                  <Sparkles size={16} /> Proses Foto Sekarang
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ─── LOADING ─────────────────────────────────────────────────────── */}
        {step === 'loading' && (
          <div className="w-full h-full bg-[#1a1a1a] flex flex-col items-center justify-center gap-6 relative overflow-hidden">
            {/* bg decoration */}
            <div className="absolute inset-0 bg-red-stripes opacity-20" />
            <div className="absolute top-8 left-8 text-white/5 text-[200px] font-black font-serif-custom leading-none">✦</div>
            <div className="absolute bottom-8 right-8 text-white/5 text-[200px] font-black font-serif-custom leading-none">★</div>

            <div className="relative z-10 flex flex-col items-center gap-6">
              <div className="w-32 h-32 rounded-full bg-white flex items-center justify-center shadow-[0_0_60px_rgba(205,28,51,0.4)] border-4 border-[#FFC107] relative">
                <div className="animate-spin text-5xl">📸</div>
                {/* orbit rings */}
                <div className="absolute inset-[-12px] rounded-full border-2 border-dashed border-[#CD1C33]/30 animate-spin" style={{ animationDuration: '3s' }} />
                <div className="absolute inset-[-24px] rounded-full border border-dashed border-white/10 animate-spin" style={{ animationDuration: '5s', animationDirection: 'reverse' }} />
              </div>

              <div className="text-center">
                <h1 className="text-6xl font-serif-custom font-bold text-white tracking-widest drop-shadow-xl">Memuat Foto...</h1>
                <p className="text-white/40 text-[11px] font-bold uppercase tracking-[0.4em] mt-3">Mohon tunggu sebentar</p>
              </div>

              <div className="flex gap-3 mt-2">
                {[1,2,3,4,5].map(i => (
                  <div key={i} className="w-2.5 h-2.5 rounded-full animate-pulse"
                    style={{ background: ['#CD1C33','#FFC107','#0E8E5E','#FFC107','#CD1C33'][i-1], animationDelay: `${(i-1) * 0.15}s` }} />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ─── DOWNLOAD ────────────────────────────────────────────────────── */}
        {step === 'download' && (
          <div className="w-full h-full flex">
            {/* Left: result strip */}
            <div className="w-[42%] h-full bg-[#0E8E5E] flex flex-col items-center justify-center gap-5 relative overflow-hidden">
              {/* texture */}
              <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 20px, rgba(255,255,255,0.5) 20px, rgba(255,255,255,0.5) 21px)' }} />

              {/* top film strip */}
              <FilmBar color="rgba(0,0,0,0.2)" />

              <div className="flex-1 flex flex-col items-center justify-center gap-5 relative z-10">
                <p className="text-white/60 text-[9px] font-bold uppercase tracking-[0.3em]">✦ Hasil Foto Kamu ✦</p>
                <div className="relative">
                  <div className="bg-white p-3 shadow-2xl">
                    <StripPreview scale={1.7} />
                  </div>
                  {/* confetti dots */}
                  {['-top-4 -left-4 bg-[#FFC107]','-top-3 right-2 bg-[#CD1C33]','bottom-0 -left-5 bg-white','bottom-4 -right-4 bg-[#FFC107]'].map((cls, i) => (
                    <div key={i} className={`absolute w-4 h-4 rounded-full ${cls}`} />
                  ))}
                </div>
                <div className="flex items-center gap-2 bg-black/20 rounded-full px-4 py-1.5">
                  <span className="text-white/80 text-[10px] font-bold tracking-widest">Filter: {activeFilter}</span>
                </div>
              </div>

              <FilmBar color="rgba(0,0,0,0.2)" />
            </div>

            {/* Right: email + QR */}
            <div className="flex-1 flex flex-col relative overflow-hidden" style={{ background: 'linear-gradient(160deg,#1a0a10 0%,#2d0d1a 60%,#1a1a2e 100%)' }}>
              {/* Decorative watermark */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[180px] font-black text-white/[0.03] leading-none select-none font-serif-custom">✦</div>

              {/* Header badge */}
              <div className="flex items-center justify-between px-8 pt-6 relative z-10">
                <div className="inline-flex items-center gap-2 bg-white/10 text-white/70 text-[9px] font-bold tracking-[0.3em] uppercase px-4 py-1.5 rounded-full">
                  <Sparkles size={9} /> Foto Siap Diunduh!
                </div>
                {dlSent && (
                  <div className="bg-black/40 text-white/60 px-3 py-1.5 rounded-md text-[9px] font-mono flex items-center gap-1.5">
                    <Clock size={10} /> Home dalam {dlTimer}s
                  </div>
                )}
              </div>

              {/* Main content — shifts up when keyboard open */}
              <div
                className="flex-1 flex flex-col items-center justify-center gap-5 px-8 relative z-10 transition-transform duration-300"
                style={{ transform: dlKbOpen ? 'translateY(-80px)' : 'translateY(0)' }}
              >
                <div className="text-center mb-1">
                  <h1 className="text-4xl font-serif-custom font-bold text-white tracking-widest drop-shadow-xl">Scan & Download</h1>
                  <p className="text-white/50 text-xs mt-1">Masukkan email atau scan QR untuk softfile kamu</p>
                </div>

                {/* Email card */}
                <div className="w-full max-w-[340px] rounded-2xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
                  {!dlSent ? (
                    <div className="p-5 flex flex-col gap-3">
                      <p className="text-[9px] font-bold tracking-[0.3em] uppercase text-white/40">Kirim ke Email</p>

                      {/* Tappable email display */}
                      <div
                        onClick={() => setDlKbOpen(true)}
                        className="w-full rounded-xl px-4 py-3 cursor-text flex items-center transition-all"
                        style={{
                          fontFamily: "'Space Mono', monospace",
                          fontSize: 13,
                          fontWeight: 700,
                          background: dlError ? 'rgba(239,68,68,0.15)' : dlKbOpen ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.07)',
                          border: `1.5px solid ${dlError ? 'rgba(239,68,68,0.6)' : dlKbOpen ? '#FFC107' : 'rgba(255,255,255,0.12)'}`,
                          color: dlEmail ? (dlError ? '#fca5a5' : '#fff') : 'rgba(255,255,255,0.25)',
                          minHeight: 46,
                          boxShadow: dlKbOpen ? `0 0 0 3px rgba(255,193,7,0.2)` : 'none',
                        }}
                      >
                        {dlEmail || 'nama@email.com'}
                        {dlKbOpen && <span className="ml-0.5 inline-block w-0.5 h-4 bg-[#FFC107] animate-pulse" />}
                      </div>

                      {dlError && (
                        <p className="text-[10px] text-red-400 font-bold tracking-wide flex items-center gap-1">
                          <svg width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01" strokeLinecap="round"/></svg>
                          Format email tidak valid
                        </p>
                      )}

                      <button
                        onClick={handleDlSend}
                        className="w-full py-3 rounded-xl font-black text-xs tracking-[0.2em] uppercase flex items-center justify-center gap-2 active:scale-95 transition-all"
                        style={{ background: '#FFC107', color: '#000', boxShadow: '0 6px 20px rgba(255,193,7,0.35)' }}
                      >
                        <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        Kirim Email
                      </button>
                      <p className="text-[9px] text-white/20 text-center">Link aktif 30 hari · Tidak ada spam</p>
                    </div>
                  ) : (
                    <div className="p-5 flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-[#FFC107] flex items-center justify-center flex-shrink-0">
                        <svg width="16" height="16" fill="none" stroke="#000" strokeWidth="2.8" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      </div>
                      <div>
                        <p className="font-black text-xs text-white tracking-[0.15em] uppercase">Email Terkirim!</p>
                        <p className="text-[10px] text-white/40 mt-0.5" style={{ fontFamily: "'Space Mono', monospace" }}>{dlEmail}</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* QR card — slides in after send */}
                <div
                  className="w-full max-w-[340px] rounded-2xl flex flex-col items-center overflow-hidden transition-all duration-700"
                  style={{
                    background: '#fff',
                    maxHeight: dlSent ? '260px' : '0px',
                    opacity: dlSent ? 1 : 0,
                    padding: dlSent ? '20px' : '0 20px',
                    boxShadow: dlSent ? '0 20px 60px rgba(0,0,0,0.5)' : 'none',
                  }}
                >
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#FFC107] text-black text-[8px] font-black tracking-widest px-4 py-1 rounded-full uppercase shadow">
                    Gratis Download!
                  </div>
                  <p className="text-[9px] font-black tracking-[0.3em] uppercase text-gray-400 mb-3 mt-1">Scan to Download</p>
                  <div className="p-3 rounded-xl bg-gray-50 border-2 border-[#FFC107]">
                    <QRCodeSVG value={`https://potohub.com/dl/${boothId}-${Date.now().toString(36)}`} size={130} fgColor="#111827" bgColor="#f9fafb" />
                  </div>
                  <p className="text-[9px] text-gray-400 tracking-widest uppercase text-center font-bold mt-3">potohub.com/download</p>
                </div>

                {/* Selesai */}
                <button
                  onClick={() => { nextStep('start'); setPhotosTaken(0); setSelectedPackage(null); setActiveFilter('Original'); setQty(1); setShowQtyModal(false); resetDownload() }}
                  className="bg-white text-[#CD1C33] px-10 py-3 rounded-full font-black shadow-2xl hover:scale-105 active:scale-95 transition-transform text-sm tracking-widest uppercase"
                >
                  {dlSent ? '✦ Selesai' : '✦ Lewati'}
                </button>
              </div>

              {/* On-screen keyboard */}
              <div
                className="absolute bottom-0 left-0 right-0 z-50 transition-transform duration-300"
                style={{ transform: dlKbOpen ? 'translateY(0)' : 'translateY(100%)' }}
              >
                <div
                  className="flex items-center justify-between px-5 py-2 cursor-pointer"
                  style={{ background: 'rgba(10,10,15,0.98)', borderTop: '1px solid rgba(255,255,255,0.1)' }}
                  onClick={() => setDlKbOpen(false)}
                >
                  <span className="text-[9px] font-bold tracking-[0.3em] uppercase text-white/30">Keyboard</span>
                  <span className="text-[9px] font-bold text-white/30">✕ Tutup</span>
                </div>
                <V3Keyboard value={dlEmail} onChange={setDlEmail} onDone={handleDlSend} />
              </div>
            </div>
          </div>
        )}

      </main>
    </div>
  )
}
