import React, { useState } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router'
import { clearClientConfig } from '@/pages/BoothSetup'
import LandingScreen, { type BoothConfig } from '@/imports/pasted_text/landing-screen'
import TutorialScreen from '@/imports/pasted_text/tutorial-ui'
import PaymentMethodScreen from '@/imports/pasted_text/method-selection'
import CategoryFrameScreen from '@/imports/pasted_text/photo-booth-config'
import PrintQuantityScreen from '@/imports/pasted_text/print-quantity-screen'
import QRISPaymentScreen from '@/imports/pasted_text/payment-qr-ui'
import CameraScreen from '@/imports/pasted_text/camera-screen'
import CustomizeScreen from '@/imports/pasted_text/customize-screen'
import { FILTERS } from '@/imports/lib/photobooth'
import CompleteScreen from '@/imports/pasted_text/complete-screen'
import { useBoothTheme, BG_GRADIENTS } from '@/context/BoothThemeContext'

type AppState = 'IDLE' | 'TUTORIAL' | 'METHOD_SELECT' | 'SCAN_TICKET' | 'CATEGORY_FRAME' | 'PRINT_QTY' | 'PAYMENT' | 'CAPTURE' | 'CUSTOMIZE' | 'COMPLETE'

const TIMER_TICKET = 5 * 60

function V1TicketScan({ onConfirm, onBack, config }: { onConfirm: () => void; onBack: () => void; config: BoothConfig }) {
  const [code, setCode] = React.useState('')
  const [error, setError] = React.useState(false)
  const [secs, setSecs] = React.useState(TIMER_TICKET)
  const onBackRef = React.useRef(onBack)
  onBackRef.current = onBack

  React.useEffect(() => {
    const t = setInterval(() => setSecs(s => (s > 0 ? s - 1 : 0)), 1000)
    return () => clearInterval(t)
  }, [])
  React.useEffect(() => { if (secs === 0) onBackRef.current() }, [secs])

  const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2,'0')}:${String(s % 60).padStart(2,'0')}`

  function verify() {
    if (code.trim().length >= 4) onConfirm()
    else { setError(true); setTimeout(() => setError(false), 1500) }
  }

  const primary = config.theme.primary

  return (
    <div
      className="w-full h-full overflow-hidden flex flex-col font-['Plus_Jakarta_Sans',sans-serif] text-white relative"
      style={{ background: config.theme.background }}
    >
      {/* Watermark */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[clamp(180px,22vw,380px)] font-black text-white/[0.025] tracking-[-0.04em] whitespace-nowrap pointer-events-none select-none z-0">
        {config.brandName}
      </div>

      {/* Header */}
      <header className="flex justify-between items-center px-12 py-7 shrink-0 relative z-10">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 border border-white/10 text-white/30 px-5 py-[9px] rounded-full bg-transparent cursor-pointer text-sm font-medium transition-colors duration-150 hover:text-white/60 hover:border-white/20"
        >
          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M15.75 19.5L8.25 12l7.5-7.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          Kembali
        </button>

        <div className="text-center flex-1 px-6">
          <h1 className="m-0 mb-1.5 text-[34px] font-bold tracking-[-0.01em] text-white">Scan Tiket</h1>
          <p className="m-0 text-[15px] text-white/35 font-normal">Arahkan kode QR tiket ke kamera, atau masukkan kode manual</p>
        </div>

        <div className="flex items-center gap-2 bg-white/95 text-[#0f0e14] px-[22px] py-[11px] rounded-full font-bold text-base shadow-[0_6px_24px_rgba(0,0,0,0.4)] shrink-0">
          <svg width="15" height="15" fill="none" stroke={primary} strokeWidth="2.5" viewBox="0 0 24 24"><path d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" strokeLinejoin="round" /></svg>
          <span className="tabular-nums">{fmt(secs)}</span>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-grow min-h-0 flex items-center justify-center gap-16 px-16 py-8 relative z-10">

        {/* QR Viewfinder card */}
        <div
          className="flex flex-col items-center gap-6 bg-white/[0.06] backdrop-blur-sm rounded-[28px] p-10"
          style={{ border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 32px 80px rgba(0,0,0,0.45)' }}
        >
          <p className="text-xs tracking-[0.3em] uppercase text-white/30 font-semibold">Scan QR Code</p>

          {/* Viewfinder */}
          <div className="relative w-56 h-56 rounded-2xl overflow-hidden flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.45)', border: '1.5px solid rgba(255,255,255,0.1)' }}>
            {/* Corner markers */}
            {[
              { pos: 'top-3 left-3',    border: 'border-t-[3px] border-l-[3px]' },
              { pos: 'top-3 right-3',   border: 'border-t-[3px] border-r-[3px]' },
              { pos: 'bottom-3 left-3', border: 'border-b-[3px] border-l-[3px]' },
              { pos: 'bottom-3 right-3',border: 'border-b-[3px] border-r-[3px]' },
            ].map(({ pos, border }) => (
              <div key={pos} className={`absolute ${pos} w-8 h-8 rounded-sm`} style={{ borderColor: primary, borderWidth: 0 }}>
                <div className={`w-full h-full border-[3px] rounded-sm ${border}`} style={{ borderColor: primary }} />
              </div>
            ))}
            {/* Scan line */}
            <div
              className="absolute inset-x-4 h-0.5 rounded-full animate-bounce"
              style={{ top: '46%', background: `linear-gradient(90deg, transparent, ${primary}, transparent)`, boxShadow: `0 0 8px ${primary}` }}
            />
            {/* QR ghost icon */}
            <svg width="64" height="64" viewBox="0 0 64 64" fill="none" className="opacity-10">
              <rect x="4" y="4" width="22" height="22" rx="3" stroke="white" strokeWidth="2" fill="none"/>
              <rect x="10" y="10" width="10" height="10" rx="1" fill="white"/>
              <rect x="38" y="4" width="22" height="22" rx="3" stroke="white" strokeWidth="2" fill="none"/>
              <rect x="44" y="10" width="10" height="10" rx="1" fill="white"/>
              <rect x="4" y="38" width="22" height="22" rx="3" stroke="white" strokeWidth="2" fill="none"/>
              <rect x="10" y="44" width="10" height="10" rx="1" fill="white"/>
              <rect x="38" y="38" width="5" height="5" rx="0.5" fill="white"/>
              <rect x="46" y="38" width="5" height="5" rx="0.5" fill="white"/>
              <rect x="54" y="38" width="5" height="5" rx="0.5" fill="white"/>
              <rect x="38" y="46" width="5" height="5" rx="0.5" fill="white"/>
              <rect x="54" y="46" width="5" height="5" rx="0.5" fill="white"/>
              <rect x="46" y="54" width="5" height="5" rx="0.5" fill="white"/>
              <rect x="54" y="54" width="5" height="5" rx="0.5" fill="white"/>
            </svg>
          </div>

          <p className="text-xs text-white/20 text-center max-w-[200px] leading-relaxed">Posisikan kode QR di dalam bingkai untuk scan otomatis</p>
        </div>

        {/* Divider */}
        <div className="flex flex-col items-center gap-4">
          <div className="w-px h-20 bg-white/10 rounded" />
          <span className="text-xs font-bold tracking-[0.25em] text-white/20 uppercase">atau</span>
          <div className="w-px h-20 bg-white/10 rounded" />
        </div>

        {/* Manual code card */}
        <div
          className="flex flex-col gap-6 bg-white/[0.06] backdrop-blur-sm rounded-[28px] p-10 w-[360px]"
          style={{ border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 32px 80px rgba(0,0,0,0.45)' }}
        >
          <div>
            <p className="text-xs tracking-[0.3em] uppercase text-white/30 font-semibold mb-1">Kode Manual</p>
            <p className="text-sm text-white/40">Masukkan kode yang tercetak di tiket kamu</p>
          </div>

          <div className="flex flex-col gap-3">
            <input
              value={code}
              onChange={e => setCode(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === 'Enter' && verify()}
              placeholder="XXXX-XXXX-XXXX"
              className="w-full text-center text-xl font-black tracking-[0.2em] outline-none transition-all duration-200 rounded-2xl px-4 py-4"
              style={{
                fontFamily: "'Courier New', monospace",
                background: error ? 'rgba(239,68,68,0.12)' : 'rgba(255,255,255,0.07)',
                border: error ? '1.5px solid rgba(239,68,68,0.6)' : '1.5px solid rgba(255,255,255,0.12)',
                color: error ? '#fca5a5' : 'white',
                caretColor: primary,
              }}
            />
            {error && (
              <p className="text-xs text-red-400 text-center tracking-wider font-bold flex items-center justify-center gap-1.5">
                <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" strokeLinecap="round" strokeLinejoin="round"/></svg>
                Kode tidak valid — minimal 4 karakter
              </p>
            )}
          </div>

          <button
            onClick={verify}
            className="w-full py-4 rounded-2xl text-base font-bold tracking-[0.08em] transition-all duration-200 active:scale-95 flex items-center justify-center gap-2.5"
            style={{
              background: `linear-gradient(135deg, ${primary}, ${primary}cc)`,
              color: config.theme.onPrimary ?? '#fff',
              boxShadow: `0 8px 28px ${primary}55`,
            }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = `0 14px 36px ${primary}77` }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = `0 8px 28px ${primary}55` }}
          >
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" strokeLinejoin="round"/></svg>
            Verifikasi Tiket
          </button>

          <p className="text-xs text-white/20 text-center leading-relaxed">
            Tiket hanya berlaku sekali pakai. Hubungi operator jika ada kendala.
          </p>
        </div>

      </main>

      {/* Step indicator */}
      <footer className="shrink-0 flex justify-center pb-8 gap-2 relative z-10">
        {['Mulai','Metode','Tiket','Frame','Sesi'].map((label, i) => (
          <div key={label} className="flex items-center gap-2">
            <div className="flex flex-col items-center gap-1">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all"
                style={{
                  background: i === 2 ? primary : i < 2 ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.06)',
                  color: i === 2 ? (config.theme.onPrimary ?? '#fff') : i < 2 ? 'white' : 'rgba(255,255,255,0.25)',
                }}
              >
                {i < 2 ? '✓' : i + 1}
              </div>
              <span className="text-[9px] tracking-wide font-semibold" style={{ color: i === 2 ? primary : i < 2 ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.15)' }}>
                {label}
              </span>
            </div>
            {i < 4 && <div className="w-10 h-px mb-4 rounded" style={{ background: i < 2 ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.06)' }} />}
          </div>
        ))}
      </footer>
    </div>
  )
}

const neu = {
  card: '12px 12px 28px #c8d2e0, -12px -12px 28px #ffffff',
  btn:  '6px 6px 14px #c8d2e0, -6px -6px 14px #ffffff',
}

function Screen({ children }: { children: React.ReactNode }) {
  return <div className="w-screen h-screen overflow-hidden">{children}</div>
}

// ── Booth settings helpers ───────────────────────────────────────────────────
interface BoothCfg {
  pin: string; cameraRotate: string; mirrorOn: boolean; flipVertical: boolean
  paymentPage: boolean; photoFilter: boolean
  filterBW: boolean; filterSepia: boolean; filterVivid: boolean; filterRetro: boolean; filterCool: boolean
  gifBoomerang: boolean; paperThreshold: number; paperCount: number; countdownSecs: number; displaySecs: number
}
const DEFAULT_CFG: BoothCfg = {
  pin: '1234', cameraRotate: '0° (Default)', mirrorOn: true, flipVertical: false,
  paymentPage: true, photoFilter: true,
  filterBW: true, filterSepia: true, filterVivid: false, filterRetro: true, filterCool: false,
  gifBoomerang: false, paperThreshold: 20, paperCount: 100, countdownSecs: 5, displaySecs: 10,
}
function loadCfg(id: string): BoothCfg {
  try { const r = localStorage.getItem(`booth_settings_${id}`); return r ? { ...DEFAULT_CFG, ...JSON.parse(r) } : { ...DEFAULT_CFG } }
  catch { return { ...DEFAULT_CFG } }
}
function saveCfg(id: string, cfg: BoothCfg) {
  localStorage.setItem(`booth_settings_${id}`, JSON.stringify(cfg))
}

// ── In-booth Settings Modal ──────────────────────────────────────────────────
const ROTATIONS = ['0° (Default)', '90°', '180°', '270°']
const STABS = ['general', 'timer', 'filters', 'paper'] as const
type STab = typeof STABS[number]

const S_NEU = { inset: 'inset 4px 4px 9px #c8d2e0, inset -4px -4px 9px #ffffff', btn: '4px 4px 10px #c8d2e0, -4px -4px 10px #ffffff' }

function SToggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!on)} style={{ position: 'relative', width: '48px', height: '26px', borderRadius: '999px', background: '#ebf0f7', boxShadow: on ? 'inset 4px 4px 8px rgba(42,40,115,0.25),inset -2px -2px 6px rgba(255,255,255,0.6)' : S_NEU.inset, border: 'none', cursor: 'pointer', flexShrink: 0, transition: 'box-shadow 0.2s' }}>
      <span style={{ position: 'absolute', top: '3px', left: on ? '25px' : '3px', width: '20px', height: '20px', borderRadius: '50%', background: on ? 'linear-gradient(135deg,#3d3aa0,#2a2873)' : '#ebf0f7', boxShadow: on ? '2px 2px 5px rgba(42,40,115,0.5)' : '2px 2px 6px #c8d2e0,-1px -1px 4px #fff', transition: 'left 0.2s,background 0.2s' }} />
    </button>
  )
}

function SRow({ label, desc, children }: { label: string; desc?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', padding: '12px 0', borderBottom: '1px solid rgba(200,210,224,0.35)' }}>
      <div style={{ flex: 1 }}>
        <p style={{ fontSize: '0.82rem', fontWeight: 600, color: '#334155' }}>{label}</p>
        {desc && <p style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>{desc}</p>}
      </div>
      <div style={{ flexShrink: 0 }}>{children}</div>
    </div>
  )
}

function BoothSettingsModal({ id, onClose, onSaved }: { id: string; onClose: () => void; onSaved?: (cfg: BoothCfg) => void }) {
  const [tab,     setTab]     = useState<STab>('general')
  const [cfg,     setCfg]     = useState<BoothCfg>(() => loadCfg(id))
  const [saved,   setSaved]   = useState(false)
  const [showPin, setShowPin] = useState(false)

  function set<K extends keyof BoothCfg>(k: K, v: BoothCfg[K]) { setCfg(p => ({ ...p, [k]: v })) }

  function save() {
    saveCfg(id, cfg)
    onSaved?.(cfg)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const tabLabels: Record<STab, string> = { general: 'General', timer: 'Timer', filters: 'Filter', paper: 'Kertas' }

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Poppins',sans-serif" }}>
      <div style={{ background: '#ebf0f7', borderRadius: '24px', width: '560px', maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 32px 80px rgba(0,0,0,0.45)', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ padding: '22px 28px 18px', background: 'linear-gradient(135deg,#2a2873 0%,#3d3aad 100%)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '38px', height: '38px', borderRadius: '11px', background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/></svg>
            </div>
            <div>
              <p style={{ color: '#fff', fontWeight: 700, fontSize: '1rem', margin: 0 }}>Settings</p>
              <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: '11px' }}>Konfigurasi booth</p>
            </div>
          </div>
          <button onClick={onClose} style={{ width: '34px', height: '34px', borderRadius: '10px', background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '6px', padding: '14px 28px 0', borderBottom: '1px solid rgba(200,210,224,0.4)' }}>
          {STABS.map(t => (
            <button key={t} onClick={() => setTab(t)} style={{ padding: '7px 16px', borderRadius: '10px 10px 0 0', background: tab === t ? '#ebf0f7' : 'transparent', border: 'none', cursor: 'pointer', fontWeight: tab === t ? 700 : 500, fontSize: '12px', color: tab === t ? '#2a2873' : '#94a3b8', fontFamily: "'Poppins',sans-serif", boxShadow: tab === t ? '4px 4px 10px #c8d2e0,-4px -4px 10px #ffffff' : 'none', transition: 'all 0.15s' }}>
              {tabLabels[t]}
            </button>
          ))}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 28px' }}>
          {tab === 'general' && (
            <>
              <SRow label="PIN Keamanan" desc="PIN untuk membuka settings dari booth">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ background: '#ebf0f7', boxShadow: S_NEU.inset, borderRadius: '8px', padding: '6px 12px', fontFamily: 'monospace', fontSize: '1rem', fontWeight: 700, color: '#2a2873', letterSpacing: '0.2em', minWidth: '70px', textAlign: 'center' }}>
                    {showPin ? cfg.pin : '••••'}
                  </div>
                  <button onClick={() => setShowPin(v => !v)} style={{ background: '#ebf0f7', boxShadow: S_NEU.btn, border: 'none', borderRadius: '8px', width: '32px', height: '32px', cursor: 'pointer', color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{showPin ? <><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></> : <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>}</svg>
                  </button>
                </div>
              </SRow>
              <SRow label="Ganti PIN">
                <div style={{ display: 'flex', gap: '6px' }}>
                  {['Ganti PIN'].map(label => (
                    <div key={label} style={{ display: 'flex', gap: '4px' }}>
                      {['0','1','2','3','4','5','6','7','8','9'].slice(0,4).map((_, i) => (
                        <input key={i} type="password" maxLength={1} value={cfg.pin[i] ?? ''} onChange={e => { const p = cfg.pin.split(''); p[i] = e.target.value; set('pin', p.join('').slice(0,4)) }} style={{ width: '32px', height: '36px', textAlign: 'center', borderRadius: '8px', border: 'none', background: '#ebf0f7', boxShadow: S_NEU.inset, fontSize: '1rem', fontFamily: 'monospace', fontWeight: 700, color: '#2a2873', outline: 'none' }} />
                      ))}
                    </div>
                  ))}
                </div>
              </SRow>
              <SRow label="Rotasi Kamera">
                <div style={{ display: 'flex', gap: '4px' }}>
                  {ROTATIONS.map(r => (
                    <button key={r} onClick={() => set('cameraRotate', r)} style={{ padding: '5px 9px', borderRadius: '7px', border: 'none', cursor: 'pointer', fontFamily: "'Poppins',sans-serif", fontSize: '11px', fontWeight: 600, background: cfg.cameraRotate === r ? 'linear-gradient(135deg,#3d3aa0,#2a2873)' : '#ebf0f7', color: cfg.cameraRotate === r ? '#fff' : '#64748b', boxShadow: cfg.cameraRotate === r ? 'none' : neu.btn }}>
                      {r.split(' ')[0]}
                    </button>
                  ))}
                </div>
              </SRow>
              <SRow label="Mirror Kamera"><SToggle on={cfg.mirrorOn} onChange={v => set('mirrorOn', v)} /></SRow>
              <SRow label="Flip Vertikal"><SToggle on={cfg.flipVertical} onChange={v => set('flipVertical', v)} /></SRow>
              <SRow label="Halaman Pembayaran"><SToggle on={cfg.paymentPage} onChange={v => set('paymentPage', v)} /></SRow>
            </>
          )}

          {tab === 'timer' && (
            <>
              <SRow label="Countdown Foto" desc="Detik sebelum foto diambil">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button onClick={() => set('countdownSecs', Math.max(1, cfg.countdownSecs - 1))} style={{ width: '30px', height: '30px', borderRadius: '8px', background: '#ebf0f7', boxShadow: S_NEU.btn, border: 'none', cursor: 'pointer', fontSize: '1rem', fontWeight: 700, color: '#64748b' }}>−</button>
                  <div style={{ background: '#ebf0f7', boxShadow: S_NEU.inset, borderRadius: '8px', padding: '6px 14px', fontWeight: 800, color: '#2a2873', minWidth: '52px', textAlign: 'center' }}>{cfg.countdownSecs}s</div>
                  <button onClick={() => set('countdownSecs', Math.min(30, cfg.countdownSecs + 1))} style={{ width: '30px', height: '30px', borderRadius: '8px', background: '#ebf0f7', boxShadow: S_NEU.btn, border: 'none', cursor: 'pointer', fontSize: '1rem', fontWeight: 700, color: '#64748b' }}>+</button>
                </div>
              </SRow>
              <SRow label="Tampil Foto" desc="Detik foto ditampilkan setelah diambil">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button onClick={() => set('displaySecs', Math.max(1, cfg.displaySecs - 1))} style={{ width: '30px', height: '30px', borderRadius: '8px', background: '#ebf0f7', boxShadow: S_NEU.btn, border: 'none', cursor: 'pointer', fontSize: '1rem', fontWeight: 700, color: '#64748b' }}>−</button>
                  <div style={{ background: '#ebf0f7', boxShadow: S_NEU.inset, borderRadius: '8px', padding: '6px 14px', fontWeight: 800, color: '#2a2873', minWidth: '52px', textAlign: 'center' }}>{cfg.displaySecs}s</div>
                  <button onClick={() => set('displaySecs', Math.min(60, cfg.displaySecs + 1))} style={{ width: '30px', height: '30px', borderRadius: '8px', background: '#ebf0f7', boxShadow: S_NEU.btn, border: 'none', cursor: 'pointer', fontSize: '1rem', fontWeight: 700, color: '#64748b' }}>+</button>
                </div>
              </SRow>
            </>
          )}

          {tab === 'filters' && (
            <>
              <SRow label="Aktifkan Filter Foto"><SToggle on={cfg.photoFilter} onChange={v => set('photoFilter', v)} /></SRow>
              {[
                { key: 'filterBW' as const,    label: 'Hitam Putih' },
                { key: 'filterSepia' as const,  label: 'Sepia' },
                { key: 'filterVivid' as const,  label: 'Vivid' },
                { key: 'filterRetro' as const,  label: 'Retro' },
                { key: 'filterCool' as const,   label: 'Cool' },
                { key: 'gifBoomerang' as const, label: 'GIF Boomerang' },
              ].map(({ key, label }) => (
                <SRow key={key} label={label}>
                  <SToggle on={cfg[key]} onChange={v => set(key, v)} />
                </SRow>
              ))}
            </>
          )}

          {tab === 'paper' && (
            <>
              <SRow label="Stok Kertas Saat Ini" desc="Update jumlah kertas yang tersedia di printer">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button onClick={() => set('paperCount', Math.max(0, cfg.paperCount - 10))} style={{ width: '30px', height: '30px', borderRadius: '8px', background: '#ebf0f7', boxShadow: S_NEU.btn, border: 'none', cursor: 'pointer', fontSize: '1rem', fontWeight: 700, color: '#64748b' }}>−</button>
                  <div style={{ background: '#ebf0f7', boxShadow: S_NEU.inset, borderRadius: '8px', padding: '6px 14px', fontWeight: 800, color: cfg.paperCount <= cfg.paperThreshold ? '#ef4444' : '#2a2873', minWidth: '68px', textAlign: 'center' }}>{cfg.paperCount} <span style={{ fontSize: '11px', fontWeight: 500, color: '#94a3b8' }}>lbr</span></div>
                  <button onClick={() => set('paperCount', Math.min(999, cfg.paperCount + 10))} style={{ width: '30px', height: '30px', borderRadius: '8px', background: '#ebf0f7', boxShadow: S_NEU.btn, border: 'none', cursor: 'pointer', fontSize: '1rem', fontWeight: 700, color: '#64748b' }}>+</button>
                </div>
              </SRow>
              <SRow label="Batas Minimum Kertas" desc="Tampilkan peringatan saat stok di bawah jumlah ini">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button onClick={() => set('paperThreshold', Math.max(1, cfg.paperThreshold - 5))} style={{ width: '30px', height: '30px', borderRadius: '8px', background: '#ebf0f7', boxShadow: S_NEU.btn, border: 'none', cursor: 'pointer', fontSize: '1rem', fontWeight: 700, color: '#64748b' }}>−</button>
                  <div style={{ background: '#ebf0f7', boxShadow: S_NEU.inset, borderRadius: '8px', padding: '6px 14px', fontWeight: 800, color: '#2a2873', minWidth: '68px', textAlign: 'center' }}>{cfg.paperThreshold} <span style={{ fontSize: '11px', fontWeight: 500, color: '#94a3b8' }}>lbr</span></div>
                  <button onClick={() => set('paperThreshold', Math.min(200, cfg.paperThreshold + 5))} style={{ width: '30px', height: '30px', borderRadius: '8px', background: '#ebf0f7', boxShadow: S_NEU.btn, border: 'none', cursor: 'pointer', fontSize: '1rem', fontWeight: 700, color: '#64748b' }}>+</button>
                </div>
              </SRow>
              {cfg.paperCount <= cfg.paperThreshold && (
                <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 10, background: '#fff1f2', border: '1px solid #fecdd3', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <svg width="16" height="16" fill="none" stroke="#ef4444" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#ef4444' }}>Stok kertas menipis! Segera isi ulang.</span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '16px 28px', borderTop: '1px solid rgba(200,210,224,0.4)', display: 'flex', justifyContent: 'flex-end', gap: '10px', background: 'rgba(255,255,255,0.25)' }}>
          <button onClick={onClose} style={{ padding: '9px 20px', borderRadius: '10px', background: '#ebf0f7', boxShadow: S_NEU.btn, border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 600, color: '#64748b', fontFamily: "'Poppins',sans-serif" }}>Batal</button>
          <button onClick={save} style={{ padding: '9px 24px', borderRadius: '10px', background: saved ? 'linear-gradient(135deg,#22c55e,#16a34a)' : 'linear-gradient(135deg,#3d3aa0,#2a2873)', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 700, color: '#fff', fontFamily: "'Poppins',sans-serif", boxShadow: '4px 4px 12px rgba(42,40,115,0.3)', transition: 'background 0.2s' }}>
            {saved ? '✓ Tersimpan' : 'Simpan'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function BoothClient() {
  const { boothId } = useParams<{ boothId: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const id = boothId ?? 'default'
  const { theme } = useBoothTheme(id)
  const SCREEN_MAP: Record<string, AppState> = { start: 'IDLE', tutorial: 'TUTORIAL', payment: 'METHOD_SELECT', qris: 'PAYMENT', ticket: 'SCAN_TICKET', frame: 'CATEGORY_FRAME' }
  const [screen, setScreen] = useState<AppState>(SCREEN_MAP[searchParams.get('step') ?? ''] ?? 'IDLE')
  const [basePrice,      setBasePrice]      = useState(theme.basePrice)
  const [totalPrice,     setTotalPrice]     = useState(theme.basePrice)
  const [frameConfigId,  setFrameConfigId]  = useState('grid4')
  const [capturedPhotos, setCapturedPhotos] = useState<string[]>([])
  const [filterId,       setFilterId]       = useState('none')
  const activeFilter = FILTERS.find(f => f.id === filterId) ?? FILTERS[0]
  const [cfg,            setCfg]            = useState<BoothCfg>(() => loadCfg(id))

  // Derived: which filter IDs are enabled
  const enabledFilterIds = cfg.photoFilter ? [
    'none',
    cfg.filterBW     ? 'bw'     : null,
    cfg.filterSepia  ? 'sepia'  : null,
    cfg.filterVivid  ? 'vivid'  : null,
    cfg.filterRetro  ? 'retro'  : null,
    cfg.filterCool   ? 'cool'   : null,
  ].filter(Boolean) as string[] : ['none']

  // PIN modal state
  const [pinOpen,       setPinOpen]       = useState(false)
  const [pinInput,      setPinInput]      = useState('')
  const [pinError,      setPinError]      = useState(false)
  const [pinShake,      setPinShake]      = useState(false)
  const [settingsOpen,  setSettingsOpen]  = useState(false)

  function handlePinDigit(d: string) {
    if (pinInput.length >= 4) return
    const next = pinInput + d
    setPinInput(next)
    setPinError(false)
    if (next.length === 4) {
      setTimeout(() => {
        if (next === loadCfg(id).pin) {
          setPinOpen(false)
          setPinInput('')
          setSettingsOpen(true)
        } else {
          setPinError(true)
          setPinShake(true)
          setTimeout(() => { setPinInput(''); setPinShake(false) }, 600)
        }
      }, 200)
    }
  }

  function closePinModal() {
    setPinOpen(false)
    setPinInput('')
    setPinError(false)
  }

  const bgValue = BG_GRADIENTS.find(g => g.id === theme.bgId)?.value || theme.customColor

  const config: BoothConfig = {
    brandName:        theme.brandName,
    tagline:          theme.tagline,
    tutorialDuration: theme.tutorialDuration,
    theme: {
      primary:    theme.primaryColor,
      onPrimary:  '#1a0a00',
      background: bgValue,
    },
    features: {
      enablePayment: theme.enablePayment,
      enableFilters: theme.enableFilters,
    },
    ctaText:    theme.ctaText,
    footerText: theme.footerText,
    showLogo:   theme.showLogo,
    logoPos:    theme.logoPos,
    basePrice:  theme.basePrice,
  }

  const overlayBtn = (onClick: () => void, children: React.ReactNode) => (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: '6px',
        padding: '8px 14px', borderRadius: '10px',
        background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(8px)',
        border: '1px solid rgba(255,255,255,0.18)',
        color: 'rgba(255,255,255,0.9)', cursor: 'pointer',
        fontSize: '12px', fontWeight: 600,
        fontFamily: "'Poppins', sans-serif",
        transition: 'background 0.15s',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.55)' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.35)' }}
    >
      {children}
    </button>
  )

  if (screen === 'IDLE') return (
    <Screen>
      <div style={{ position: 'relative', width: '100%', height: '100%' }}>
        <LandingScreen onStart={() => setScreen('TUTORIAL')} config={config} />

        {/* Low-paper warning banner */}
        {cfg.paperCount <= cfg.paperThreshold && (
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 60, background: 'linear-gradient(90deg,#7f1d1d,#991b1b)', padding: '10px 20px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
            <svg width="16" height="16" fill="none" stroke="#fca5a5" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" strokeLinecap="round" strokeLinejoin="round"/></svg>
            <span style={{ color: '#fecaca', fontSize: 13, fontWeight: 700, fontFamily: "'Poppins',sans-serif" }}>
              Peringatan: Stok kertas menipis ({cfg.paperCount} lembar tersisa) — Segera isi ulang
            </span>
          </div>
        )}

        {/* Top-left overlay buttons */}
        <div style={{ position: 'absolute', top: '16px', left: '16px', display: 'flex', gap: '8px', zIndex: 50 }}>
          {overlayBtn(() => navigate('/booth'), (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
              Kembali
            </>
          ))}
          {overlayBtn(() => setPinOpen(true), (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/>
              </svg>
              Settings
            </>
          ))}
          {overlayBtn(() => { clearClientConfig(); navigate('/booth-setup') }, (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>
              </svg>
              Reset Perangkat
            </>
          ))}
        </div>

        {/* PIN Modal */}
        {pinOpen && (
          <div
            onClick={closePinModal}
            style={{
              position: 'absolute', inset: 0, zIndex: 100,
              background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <div
              onClick={e => e.stopPropagation()}
              style={{
                background: '#ebf0f7',
                borderRadius: '24px',
                padding: '36px 32px',
                width: '320px',
                boxShadow: '0 24px 64px rgba(0,0,0,0.4)',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '24px',
                fontFamily: "'Poppins', sans-serif",
              }}
            >
              {/* Lock icon */}
              <div style={{
                width: '56px', height: '56px', borderRadius: '16px',
                background: '#ebf0f7',
                boxShadow: '6px 6px 14px #c8d2e0, -6px -6px 14px #ffffff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#2a2873" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
              </div>

              <div style={{ textAlign: 'center' }}>
                <p style={{ fontWeight: 700, fontSize: '1rem', color: '#334155', margin: 0 }}>Masukkan PIN</p>
                <p style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>Diperlukan PIN untuk mengakses Settings</p>
              </div>

              {/* PIN dots */}
              <div
                style={{
                  display: 'flex', gap: '12px',
                  animation: pinShake ? 'shake 0.5s ease' : 'none',
                }}
              >
                {[0,1,2,3].map(i => (
                  <div key={i} style={{
                    width: '16px', height: '16px', borderRadius: '50%',
                    background: pinInput.length > i
                      ? (pinError ? '#ef4444' : '#2a2873')
                      : '#d1d9e6',
                    transition: 'background 0.15s',
                    boxShadow: pinInput.length > i ? 'none' : 'inset 2px 2px 4px #c8d2e0, inset -2px -2px 4px #ffffff',
                  }} />
                ))}
              </div>

              {pinError && (
                <p style={{ fontSize: '12px', color: '#ef4444', fontWeight: 600, margin: '-12px 0' }}>PIN salah, coba lagi</p>
              )}

              {/* Numpad */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', width: '100%' }}>
                {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((d) => {
                  if (d === '') return <div key="empty" />
                  return (
                    <button
                      key={d}
                      onClick={() => d === '⌫' ? setPinInput(p => p.slice(0,-1)) : handlePinDigit(d)}
                      style={{
                        height: '52px', borderRadius: '12px',
                        background: '#ebf0f7',
                        boxShadow: '4px 4px 10px #c8d2e0, -4px -4px 10px #ffffff',
                        border: 'none', cursor: 'pointer',
                        fontSize: d === '⌫' ? '1.1rem' : '1.2rem',
                        fontWeight: 700, color: '#334155',
                        fontFamily: "'Poppins', sans-serif",
                        transition: 'box-shadow 0.1s, transform 0.1s',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.transform = 'scale(0.96)' }}
                      onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)' }}
                    >
                      {d}
                    </button>
                  )
                })}
              </div>

              <button
                onClick={closePinModal}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: '12px', color: '#94a3b8', fontFamily: "'Poppins', sans-serif",
                }}
              >
                Batal
              </button>
            </div>
          </div>
        )}

        {/* Settings Modal (after PIN verified) */}
        {settingsOpen && <BoothSettingsModal id={id} onClose={() => setSettingsOpen(false)} onSaved={newCfg => setCfg(newCfg)} />}

        <style>{`
          @keyframes shake {
            0%,100% { transform: translateX(0) }
            20%      { transform: translateX(-8px) }
            40%      { transform: translateX(8px) }
            60%      { transform: translateX(-6px) }
            80%      { transform: translateX(6px) }
          }
        `}</style>
      </div>
    </Screen>
  )
  if (screen === 'TUTORIAL') return (
    <Screen><TutorialScreen onNext={() => setScreen(cfg.paymentPage ? 'METHOD_SELECT' : 'CATEGORY_FRAME')} onBack={() => setScreen('IDLE')} config={config} /></Screen>
  )
  if (screen === 'METHOD_SELECT') return (
    <Screen><PaymentMethodScreen onSelect={(method) => setScreen(method === 'ticket' ? 'SCAN_TICKET' : 'CATEGORY_FRAME')} onBack={() => setScreen('TUTORIAL')} config={config} /></Screen>
  )
  if (screen === 'SCAN_TICKET') return (
    <Screen>
      <V1TicketScan onConfirm={() => setScreen('CATEGORY_FRAME')} onBack={() => setScreen('METHOD_SELECT')} config={config} />
    </Screen>
  )
  if (screen === 'CATEGORY_FRAME') return (
    <Screen><CategoryFrameScreen onNext={(price, fid) => { setBasePrice(price); setFrameConfigId(fid); setScreen('PRINT_QTY') }} onBack={() => setScreen('METHOD_SELECT')} config={config} /></Screen>
  )
  if (screen === 'PRINT_QTY') return (
    <Screen><PrintQuantityScreen basePrice={basePrice} onNext={(qty) => { setTotalPrice(basePrice * qty); setScreen('PAYMENT') }} onBack={() => setScreen('CATEGORY_FRAME')} config={config} /></Screen>
  )
  if (screen === 'PAYMENT') return (
    <Screen><QRISPaymentScreen totalPrice={totalPrice} onSuccess={() => setScreen('CAPTURE')} onBack={() => setScreen('PRINT_QTY')} config={config} /></Screen>
  )
  if (screen === 'CAPTURE') return (
    <Screen><CameraScreen
      frameConfigId={frameConfigId}
      onComplete={(photos) => { setCapturedPhotos(photos); setScreen(cfg.photoFilter ? 'CUSTOMIZE' : 'COMPLETE') }}
      onBack={() => setScreen('PAYMENT')}
      config={config}
      countdownSecs={cfg.countdownSecs}
      mirrorOn={cfg.mirrorOn}
      flipVertical={cfg.flipVertical}
      cameraRotate={cfg.cameraRotate}
    /></Screen>
  )
  if (screen === 'CUSTOMIZE') return (
    <Screen><CustomizeScreen
      photos={capturedPhotos}
      filter={activeFilter}
      filterId={filterId}
      frameConfigId={frameConfigId}
      onFilterChange={setFilterId}
      onNext={() => setScreen('COMPLETE')}
      onBack={() => setScreen('CAPTURE')}
      config={config}
      enabledFilterIds={enabledFilterIds}
      boothId={id}
    /></Screen>
  )

  return (
    <Screen>
      <CompleteScreen
        photos={capturedPhotos}
        config={config}
        onNewSession={() => {
          // Decrement paper count by 1 print per session
          const updated = { ...cfg, paperCount: Math.max(0, cfg.paperCount - 1) }
          saveCfg(id, updated)
          setCfg(updated)
          setScreen('IDLE')
        }}
      />
    </Screen>
  )
}
