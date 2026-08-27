import { useState } from 'react'
import { useNavigate } from 'react-router'
import {
  Monitor, Check, ChevronRight, ChevronLeft,
  Wifi, ExternalLink, RotateCcw, Zap,
} from 'lucide-react'
import { loadClientConfig, saveClientConfig, clearClientConfig, type BoothClientConfig } from './BoothSetup'

// ── Design tokens ─────────────────────────────────────────────────────────────
const BG   = '#ebf0f7'
const NAVY = '#2a2873'

const neu = {
  raised:  '10px 10px 22px #c8d2e0, -10px -10px 22px #ffffff',
  raisedSm:'5px 5px 12px #c8d2e0, -5px -5px 12px #ffffff',
  inset:   'inset 5px 5px 12px #c8d2e0, inset -5px -5px 12px #ffffff',
  insetSm: 'inset 3px 3px 7px #c8d2e0, inset -3px -3px 7px #ffffff',
}

// ── Data ──────────────────────────────────────────────────────────────────────
const BOOTHS = [
  { id: '1', name: 'FOOTO0',       branch: 'Cabang Selatan', city: 'Jakarta'  },
  { id: '2', name: 'Senayan 01',   branch: 'Cabang Pusat',   city: 'Jakarta'  },
  { id: '3', name: 'Kemang Pos',   branch: 'Cabang Selatan', city: 'Jakarta'  },
  { id: '4', name: 'Bandung Dago', branch: 'Cabang Bandung', city: 'Bandung'  },
]

const VERSIONS: { id: 'v1' | 'v2' | 'v3'; label: string; desc: string; accent: string }[] = [
  { id: 'v1', label: 'Classic',   desc: 'Gelap elegan, aksen brand dinamis',    accent: '#7c3aed' },
  { id: 'v2', label: 'Editorial', desc: 'Hitam-putih kontras tinggi, magazine', accent: '#0f172a' },
  { id: 'v3', label: 'Retro',     desc: 'Festive merah-hijau, energi tinggi',   accent: '#CD1C33' },
]

// ── Primitives ────────────────────────────────────────────────────────────────
function Label({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontSize: '0.68rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' as const, letterSpacing: '0.12em', margin: '0 0 14px' }}>
      {children}
    </p>
  )
}

function StepBar({ step }: { step: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 32 }}>
      {[1, 2, 3].map((s, i) => {
        const done   = step > s
        const active = step === s
        return (
          <div key={s} style={{ display: 'flex', alignItems: 'center', flex: i < 2 ? 1 : 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <div style={{
                width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                background: BG,
                boxShadow: done ? 'none' : active ? neu.inset : neu.raisedSm,
                border: done ? `2px solid ${NAVY}` : 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.25s',
              }}>
                {done
                  ? <Check size={13} color={NAVY} strokeWidth={3} />
                  : <span style={{ fontSize: '0.72rem', fontWeight: 800, color: active ? NAVY : '#b0bec5' }}>{s}</span>
                }
              </div>
              <span style={{ fontSize: '0.78rem', fontWeight: active ? 700 : 400, color: active ? NAVY : done ? '#64748b' : '#b0bec5', whiteSpace: 'nowrap' as const, transition: 'color 0.2s' }}>
                {s === 1 ? 'Pilih Booth' : s === 2 ? 'Pilih Tampilan' : 'Konfirmasi'}
              </span>
            </div>
            {i < 2 && (
              <div style={{ flex: 1, height: 2, margin: '0 14px', borderRadius: 999, background: BG, boxShadow: neu.insetSm, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: step > s ? '100%' : '0%', background: `linear-gradient(90deg,${NAVY},#6d28d9)`, borderRadius: 999, transition: 'width 0.4s ease' }} />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Connected view ────────────────────────────────────────────────────────────
function ConnectedView({ cfg, onReset, onLaunch }: { cfg: BoothClientConfig; onReset: () => void; onLaunch: () => void }) {
  const vMeta  = VERSIONS.find(v => v.id === cfg.clientVersion)!
  const booth  = BOOTHS.find(b => b.id === cfg.boothId)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>

      {/* Status banner */}
      <div style={{ background: BG, boxShadow: neu.raised, borderRadius: 22, padding: '24px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <div style={{ width: 52, height: 52, borderRadius: 16, background: BG, boxShadow: neu.raisedSm, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Wifi size={22} color="#22c55e" strokeWidth={1.8} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 6px #22c55e' }} />
              <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#22c55e', textTransform: 'uppercase' as const, letterSpacing: '0.12em' }}>Terhubung</span>
            </div>
            <p style={{ fontWeight: 800, fontSize: '1.15rem', color: '#334155', margin: '0 0 2px', fontFamily: 'inherit' }}>{cfg.boothName}</p>
            {booth && <p style={{ fontSize: '0.75rem', color: '#94a3b8', margin: 0 }}>{booth.branch} · {booth.city}</p>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={onReset}
            style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '10px 18px', borderRadius: 12, background: BG, boxShadow: neu.raisedSm, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.8rem', fontWeight: 600, color: '#64748b', transition: 'box-shadow 0.15s, color 0.15s' }}
            onMouseEnter={e => { e.currentTarget.style.boxShadow = neu.inset; e.currentTarget.style.color = '#ef4444' }}
            onMouseLeave={e => { e.currentTarget.style.boxShadow = neu.raisedSm; e.currentTarget.style.color = '#64748b' }}
          >
            <RotateCcw size={13} /> Ganti Booth
          </button>
          <button
            onClick={onLaunch}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 22px', borderRadius: 12, background: `linear-gradient(135deg,#3d3aa0,${NAVY})`, border: 'none', cursor: 'pointer', color: '#fff', fontFamily: 'inherit', fontSize: '0.88rem', fontWeight: 700, boxShadow: '4px 4px 14px rgba(42,40,115,0.3)', transition: 'transform 0.12s' }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)' }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'none' }}
          >
            <ExternalLink size={14} /> Jalankan Booth
          </button>
        </div>
      </div>

      {/* Detail grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Booth info */}
        <div style={{ background: BG, boxShadow: neu.raised, borderRadius: 22, padding: '24px 26px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Label>Informasi Booth</Label>
          {[
            { label: 'Nama',     value: cfg.boothName },
            { label: 'Cabang',   value: booth?.branch ?? '—' },
            { label: 'Kota',     value: booth?.city ?? '—' },
            { label: 'Booth ID', value: `#${cfg.boothId}` },
          ].map(row => (
            <div key={row.label} style={{ padding: '10px 14px', borderRadius: 12, background: BG, boxShadow: neu.inset }}>
              <p style={{ fontSize: '0.62rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' as const, letterSpacing: '0.08em', margin: '0 0 3px' }}>{row.label}</p>
              <p style={{ fontSize: '0.875rem', fontWeight: 600, color: '#334155', margin: 0 }}>{row.value}</p>
            </div>
          ))}
        </div>

        {/* Version + date */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ background: BG, boxShadow: neu.raised, borderRadius: 22, padding: '24px 26px', flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Label>Tampilan Client</Label>
            <div style={{ padding: '14px 16px', borderRadius: 14, background: BG, boxShadow: neu.inset }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: vMeta.accent, display: 'inline-block', boxShadow: `0 0 6px ${vMeta.accent}80` }} />
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: vMeta.accent }}>{cfg.clientVersion.toUpperCase()} · {vMeta.label}</span>
              </div>
              <p style={{ fontSize: '0.78rem', color: '#64748b', margin: 0, lineHeight: 1.5 }}>{vMeta.desc}</p>
            </div>
          </div>
          <div style={{ background: BG, boxShadow: neu.raised, borderRadius: 22, padding: '20px 24px', display: 'flex', gap: 14, alignItems: 'center' }}>
            <div style={{ width: 38, height: 38, borderRadius: 11, background: BG, boxShadow: neu.raisedSm, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span style={{ fontSize: 16 }}>📅</span>
            </div>
            <div>
              <p style={{ fontSize: '0.62rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' as const, letterSpacing: '0.08em', margin: '0 0 3px' }}>Terhubung Sejak</p>
              <p style={{ fontSize: '0.85rem', fontWeight: 600, color: '#334155', margin: 0 }}>
                {new Date(cfg.connectedAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Setup wizard ──────────────────────────────────────────────────────────────
function SetupWizard({ onDone }: { onDone: (cfg: BoothClientConfig) => void }) {
  const [step, setStep]                = useState(1)
  const [selectedBooth, setSelectedBooth] = useState<typeof BOOTHS[number] | null>(null)
  const [selectedVersion, setSelectedVersion] = useState<'v1' | 'v2' | 'v3'>('v1')
  const [launching, setLaunching]      = useState(false)

  function finish() {
    if (!selectedBooth) return
    setLaunching(true)
    const cfg: BoothClientConfig = {
      boothId: selectedBooth.id,
      boothName: selectedBooth.name,
      clientVersion: selectedVersion,
      connectedAt: new Date().toISOString(),
    }
    saveClientConfig(cfg)
    setTimeout(() => onDone(cfg), 1400)
  }

  if (launching) return (
    <div style={{ background: BG, boxShadow: neu.raised, borderRadius: 24, padding: '60px 40px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24, textAlign: 'center' }}>
      <div style={{ width: 60, height: 60, borderRadius: 18, background: BG, boxShadow: neu.inset, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Monitor size={26} color={NAVY} strokeWidth={1.8} />
      </div>
      <div>
        <p style={{ fontWeight: 800, fontSize: '1.1rem', color: '#334155', margin: '0 0 6px' }}>Menyimpan Konfigurasi…</p>
        <p style={{ fontSize: '0.8rem', color: '#94a3b8', margin: 0 }}>{selectedBooth?.name} · {VERSIONS.find(v => v.id === selectedVersion)?.label}</p>
      </div>
      <div style={{ width: 200, height: 5, borderRadius: 999, background: BG, boxShadow: neu.insetSm, overflow: 'hidden' }}>
        <div style={{ height: '100%', borderRadius: 999, background: `linear-gradient(90deg,#3d3aa0,${NAVY})`, animation: 'ph-load 1.4s ease-in-out forwards' }} />
        <style>{`@keyframes ph-load{0%{width:0%}100%{width:100%}}`}</style>
      </div>
    </div>
  )

  return (
    <div style={{ background: BG, boxShadow: neu.raised, borderRadius: 24, padding: '32px 34px' }}>
      <StepBar step={step} />

      {/* Step 1 */}
      {step === 1 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div>
            <h3 style={{ fontWeight: 800, fontSize: '1.1rem', color: '#334155', margin: '0 0 5px' }}>Pilih Unit Booth</h3>
            <p style={{ fontSize: '0.82rem', color: '#94a3b8', margin: 0 }}>Perangkat ini akan dikonfigurasi untuk booth yang dipilih di bawah.</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {BOOTHS.map(b => {
              const sel = selectedBooth?.id === b.id
              return (
                <button
                  key={b.id}
                  onClick={() => setSelectedBooth(b)}
                  style={{ textAlign: 'left', padding: '18px 20px', borderRadius: 18, background: BG, boxShadow: sel ? neu.inset : neu.raisedSm, border: `2px solid ${sel ? NAVY : 'transparent'}`, cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 10, transition: 'all 0.2s', fontFamily: 'inherit' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ width: 36, height: 36, borderRadius: 11, background: sel ? NAVY : BG, boxShadow: sel ? 'none' : neu.raisedSm, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, transition: 'all 0.2s' }}>
                      {sel ? <Check size={15} color="#fff" strokeWidth={3} /> : '📷'}
                    </div>
                    {sel && <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 6px #22c55e' }} />}
                  </div>
                  <div>
                    <p style={{ fontWeight: 800, fontSize: '0.88rem', color: sel ? NAVY : '#334155', margin: '0 0 2px', fontFamily: 'inherit', transition: 'color 0.15s' }}>{b.name}</p>
                    <p style={{ fontSize: '0.7rem', color: '#94a3b8', margin: 0, fontFamily: 'inherit' }}>{b.branch} · {b.city}</p>
                  </div>
                </button>
              )
            })}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={() => setStep(2)}
              disabled={!selectedBooth}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 28px', borderRadius: 14, background: selectedBooth ? `linear-gradient(135deg,#3d3aa0,${NAVY})` : BG, boxShadow: selectedBooth ? '4px 4px 14px rgba(42,40,115,0.3)' : neu.raisedSm, border: 'none', cursor: selectedBooth ? 'pointer' : 'not-allowed', color: selectedBooth ? '#fff' : '#b0bec5', fontFamily: 'inherit', fontSize: '0.9rem', fontWeight: 700, transition: 'all 0.2s', opacity: selectedBooth ? 1 : 0.6 }}
            >
              Lanjut <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Step 2 */}
      {step === 2 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div>
            <h3 style={{ fontWeight: 800, fontSize: '1.1rem', color: '#334155', margin: '0 0 5px' }}>Pilih Tampilan</h3>
            <p style={{ fontSize: '0.82rem', color: '#94a3b8', margin: 0 }}>Gaya antarmuka yang dilihat pengunjung saat sesi foto berlangsung.</p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {VERSIONS.map(v => {
              const sel = selectedVersion === v.id
              return (
                <button
                  key={v.id}
                  onClick={() => setSelectedVersion(v.id)}
                  style={{ textAlign: 'left', padding: '16px 20px', borderRadius: 16, background: BG, boxShadow: sel ? neu.inset : neu.raisedSm, border: `2px solid ${sel ? v.accent : 'transparent'}`, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, transition: 'all 0.2s', fontFamily: 'inherit' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 12, background: BG, boxShadow: sel ? neu.insetSm : neu.raisedSm, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.2s' }}>
                      <Monitor size={17} style={{ color: sel ? v.accent : '#b0bec5' }} strokeWidth={1.8} />
                    </div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                        <p style={{ fontWeight: 800, fontSize: '0.9rem', color: sel ? v.accent : '#334155', margin: 0, fontFamily: 'inherit', transition: 'color 0.15s' }}>{v.label}</p>
                        {v.id === 'v1' && <span style={{ fontSize: '0.58rem', fontWeight: 700, color: v.accent, background: `${v.accent}18`, padding: '2px 8px', borderRadius: 999, letterSpacing: '0.04em' }}>Direkomendasikan</span>}
                      </div>
                      <p style={{ fontSize: '0.73rem', color: '#94a3b8', margin: 0, fontFamily: 'inherit' }}>{v.desc}</p>
                    </div>
                  </div>
                  {sel && <Check size={16} color={v.accent} strokeWidth={3} style={{ flexShrink: 0 }} />}
                </button>
              )
            })}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
            <button
              onClick={() => setStep(1)}
              style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '11px 20px', borderRadius: 13, background: BG, boxShadow: neu.raisedSm, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.85rem', fontWeight: 600, color: '#64748b', transition: 'box-shadow 0.15s, color 0.15s' }}
              onMouseEnter={e => { e.currentTarget.style.boxShadow = neu.inset; e.currentTarget.style.color = '#334155' }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow = neu.raisedSm; e.currentTarget.style.color = '#64748b' }}
            >
              <ChevronLeft size={15} /> Kembali
            </button>
            <button
              onClick={() => setStep(3)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 28px', borderRadius: 14, background: `linear-gradient(135deg,#3d3aa0,${NAVY})`, boxShadow: '4px 4px 14px rgba(42,40,115,0.3)', border: 'none', cursor: 'pointer', color: '#fff', fontFamily: 'inherit', fontSize: '0.9rem', fontWeight: 700 }}
            >
              Lanjut <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Step 3 */}
      {step === 3 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div>
            <h3 style={{ fontWeight: 800, fontSize: '1.1rem', color: '#334155', margin: '0 0 5px' }}>Konfirmasi</h3>
            <p style={{ fontSize: '0.82rem', color: '#94a3b8', margin: 0 }}>Periksa konfigurasi sebelum booth diaktifkan.</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
            {[
              { icon: '📍', label: 'Booth',    value: selectedBooth?.name ?? '—' },
              { icon: '🌆', label: 'Lokasi',   value: `${selectedBooth?.city}` },
              { icon: '🎨', label: 'Tampilan', value: VERSIONS.find(v => v.id === selectedVersion)?.label ?? '—' },
            ].map(r => (
              <div key={r.label} style={{ background: BG, boxShadow: neu.inset, borderRadius: 16, padding: '18px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span style={{ fontSize: 20 }}>{r.icon}</span>
                <div>
                  <p style={{ fontSize: '0.62rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' as const, letterSpacing: '0.1em', margin: '0 0 3px' }}>{r.label}</p>
                  <p style={{ fontWeight: 700, fontSize: '0.88rem', color: '#334155', margin: 0 }}>{r.value}</p>
                </div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
            <button
              onClick={() => setStep(2)}
              style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '11px 20px', borderRadius: 13, background: BG, boxShadow: neu.raisedSm, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.85rem', fontWeight: 600, color: '#64748b', transition: 'box-shadow 0.15s, color 0.15s' }}
              onMouseEnter={e => { e.currentTarget.style.boxShadow = neu.inset; e.currentTarget.style.color = '#334155' }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow = neu.raisedSm; e.currentTarget.style.color = '#64748b' }}
            >
              <ChevronLeft size={15} /> Kembali
            </button>
            <button
              onClick={finish}
              style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '13px 30px', borderRadius: 14, background: `linear-gradient(135deg,#3d3aa0,${NAVY})`, boxShadow: '6px 6px 18px rgba(42,40,115,0.32)', border: 'none', cursor: 'pointer', color: '#fff', fontFamily: 'inherit', fontSize: '0.95rem', fontWeight: 800, letterSpacing: '-0.01em', transition: 'transform 0.12s' }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)' }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'none' }}
            >
              <Zap size={16} strokeWidth={2.5} /> Aktifkan Booth
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Welcome screen ────────────────────────────────────────────────────────────
function WelcomeScreen({ onStart }: { onStart: () => void }) {
  return (
    <div style={{
      width: '100vw', height: '100vh', overflow: 'hidden',
      background: BG,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: "'Poppins', sans-serif", position: 'relative',
    }}>

      {/* Decorative neumorphic circles — background layer */}
      {[
        { size: 340, top: -80,  left: -80,  opacity: 1   },
        { size: 220, top: -40,  right: -60, opacity: 1   },
        { size: 280, bottom:-90,left:'35%', opacity: 1   },
        { size: 180, bottom:-50,right:-40,  opacity: 1   },
        { size: 120, top:'42%', left: 40,   opacity: 0.7 },
        { size: 90,  top:'25%', right: 80,  opacity: 0.6 },
      ].map((c, i) => (
        <div key={i} style={{
          position: 'absolute',
          width: c.size, height: c.size,
          borderRadius: '50%',
          background: BG,
          boxShadow: `${c.size/14}px ${c.size/14}px ${c.size/5}px #c8d2e0, -${c.size/14}px -${c.size/14}px ${c.size/5}px #ffffff`,
          opacity: c.opacity,
          top: c.top, left: (c as any).left, right: (c as any).right, bottom: (c as any).bottom,
          pointerEvents: 'none',
        }} />
      ))}

      {/* Center card — neumorphic raised panel */}
      <div style={{
        position: 'relative', zIndex: 5,
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        padding: '56px 72px 48px',
        borderRadius: 40,
        background: BG,
        boxShadow: '24px 24px 48px #c0cad8, -24px -24px 48px #ffffff',
        gap: 0,
        maxWidth: 680, width: '90%',
      }}>

        {/* Icon badge */}
        <div style={{
          width: 80, height: 80, borderRadius: 24,
          background: BG,
          boxShadow: '8px 8px 18px #c8d2e0, -8px -8px 18px #ffffff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: 36,
        }}>
          <div style={{
            width: 56, height: 56, borderRadius: 16,
            background: `linear-gradient(135deg, #3d3aa0, ${NAVY})`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '4px 4px 10px rgba(42,40,115,0.35)',
          }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
              <circle cx="12" cy="13" r="4"/>
            </svg>
          </div>
        </div>

        {/* Brand name — neumorphic emboss text */}
        <h1 style={{
          margin: '0 0 10px',
          fontSize: 'clamp(52px, 9vw, 96px)',
          fontWeight: 900,
          letterSpacing: '-0.04em',
          lineHeight: 1,
          color: NAVY,
          textShadow: [
            '3px 3px 6px #c0cad8',
            '-2px -2px 5px rgba(255,255,255,0.95)',
            '0 0 40px rgba(42,40,115,0.08)',
          ].join(', '),
          fontFamily: "'Poppins', sans-serif",
          userSelect: 'none',
        }}>
          Potohub
        </h1>

        {/* Tagline with inset pill */}
        <div style={{
          padding: '6px 20px', borderRadius: 999, marginBottom: 44,
          background: BG,
          boxShadow: 'inset 4px 4px 8px #c8d2e0, inset -4px -4px 8px #ffffff',
        }}>
          <p style={{ margin: 0, fontSize: '0.78rem', fontWeight: 600, color: '#7c8faa', letterSpacing: '0.12em', textTransform: 'uppercase' as const }}>
            Abadikan Momenmu · Booth Client
          </p>
        </div>

        {/* Divider */}
        <div style={{ width: '100%', height: 1, background: 'linear-gradient(90deg,transparent,#d0d8e4,transparent)', marginBottom: 40 }} />

        {/* MULAI button */}
        <button
          onClick={onStart}
          style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '18px 56px', borderRadius: 999,
            background: `linear-gradient(135deg, #3d3aa0, ${NAVY})`,
            border: 'none', cursor: 'pointer', color: '#fff',
            fontFamily: "'Poppins', sans-serif",
            fontSize: '1rem', fontWeight: 800,
            letterSpacing: '0.2em', textTransform: 'uppercase' as const,
            boxShadow: '8px 8px 20px #c0cad8, -4px -4px 10px #ffffff, 0 4px 20px rgba(42,40,115,0.3)',
            transition: 'transform 0.15s, box-shadow 0.15s',
            marginBottom: 18,
          }}
          onMouseEnter={e => {
            e.currentTarget.style.transform = 'translateY(-2px)'
            e.currentTarget.style.boxShadow = '12px 12px 26px #bcc6d4, -4px -4px 12px #ffffff, 0 8px 28px rgba(42,40,115,0.4)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.transform = 'none'
            e.currentTarget.style.boxShadow = '8px 8px 20px #c0cad8, -4px -4px 10px #ffffff, 0 4px 20px rgba(42,40,115,0.3)'
          }}
          onMouseDown={e => { e.currentTarget.style.transform = 'translateY(0px)'; e.currentTarget.style.boxShadow = 'inset 4px 4px 10px rgba(0,0,0,0.2), 0 2px 10px rgba(42,40,115,0.2)' }}
          onMouseUp={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '12px 12px 26px #bcc6d4, -4px -4px 12px #ffffff, 0 8px 28px rgba(42,40,115,0.4)' }}
        >
          Mulai
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </button>

        <p style={{ margin: 0, fontSize: '0.65rem', fontWeight: 600, color: '#a8b4c4', letterSpacing: '0.16em', textTransform: 'uppercase' as const, textAlign: 'center' }}>
          Sentuh Layar atau Tekan Tombol untuk Memulai
        </p>
      </div>

    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function Perangkat() {
  const navigate  = useNavigate()
  const [cfg, setCfg]   = useState<BoothClientConfig | null>(() => loadClientConfig())
  const [view, setView] = useState<'welcome' | 'setup'>(() => loadClientConfig() ? 'setup' : 'welcome')

  function handleDone(newCfg: BoothClientConfig) { setCfg(newCfg) }
  function handleReset() { clearClientConfig(); setCfg(null); setView('welcome') }
  function handleLaunch() {
    if (!cfg) return
    const path = cfg.clientVersion === 'v2'
      ? `/booth-client-v2/${cfg.boothId}`
      : cfg.clientVersion === 'v3'
      ? `/booth-client-v3/${cfg.boothId}`
      : `/booth-client/${cfg.boothId}`
    navigate(path)
  }

  const connected = !!cfg

  // ── Welcome splash ──
  if (view === 'welcome') return <WelcomeScreen onStart={() => setView('setup')} />

  // ── Setup / connected ──
  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', background: BG, fontFamily: "'Poppins', sans-serif", display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>

      {/* Ghost watermark */}
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', userSelect: 'none', overflow: 'hidden' }}>
        <span style={{ fontSize: '20vw', fontWeight: 900, color: 'rgba(42,40,115,0.04)', letterSpacing: '-0.04em', whiteSpace: 'nowrap', fontFamily: "'Poppins',sans-serif", lineHeight: 1 }}>
          Potohub
        </span>
      </div>

      {/* Top-left status + back */}
      <div style={{ position: 'absolute', top: 28, left: 36, display: 'flex', alignItems: 'center', gap: 10, zIndex: 10 }}>
        <button
          onClick={() => { setView('welcome') }}
          style={{ width: 38, height: 38, borderRadius: 12, background: BG, boxShadow: neu.raisedSm, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', cursor: 'pointer', transition: 'box-shadow 0.15s' }}
          onMouseEnter={e => { e.currentTarget.style.boxShadow = neu.inset }}
          onMouseLeave={e => { e.currentTarget.style.boxShadow = neu.raisedSm }}
        >
          <Monitor size={16} color={NAVY} strokeWidth={2} />
        </button>
        <div>
          <p style={{ fontSize: '0.62rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' as const, letterSpacing: '0.12em', margin: '0 0 1px' }}>Perangkat</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: connected ? '#22c55e' : '#f59e0b', boxShadow: connected ? '0 0 5px #22c55e' : 'none' }} />
            <span style={{ fontSize: '0.7rem', fontWeight: 600, color: connected ? '#22c55e' : '#f59e0b' }}>{connected ? 'Terhubung' : 'Belum Dikonfigurasi'}</span>
          </div>
        </div>
      </div>

      {/* Top-right brand */}
      <div style={{ position: 'absolute', top: 28, right: 36, zIndex: 10 }}>
        <span style={{ fontSize: '1.1rem', fontWeight: 900, color: NAVY, letterSpacing: '-0.03em', fontFamily: "'Poppins',sans-serif", opacity: 0.5 }}>Potohub</span>
      </div>

      {/* Center content */}
      <div style={{ position: 'relative', zIndex: 5, width: '100%', maxWidth: 780, padding: '0 32px' }}>
        {!connected && (
          <div style={{ textAlign: 'center', marginBottom: 40 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 16px', borderRadius: 999, background: BG, boxShadow: neu.raisedSm, marginBottom: 16 }}>
              <Monitor size={12} color={NAVY} strokeWidth={2.5} />
              <span style={{ fontSize: '0.68rem', fontWeight: 700, color: NAVY, textTransform: 'uppercase' as const, letterSpacing: '0.14em' }}>Setup Booth Client</span>
            </div>
            <h1 style={{ fontSize: 'clamp(2rem,4vw,3rem)', fontWeight: 900, color: '#334155', margin: '0 0 8px', letterSpacing: '-0.03em', lineHeight: 1.1 }}>
              Hubungkan Perangkat
            </h1>
            <p style={{ fontSize: '0.88rem', color: '#94a3b8', margin: 0 }}>
              Ikuti langkah berikut untuk mengonfigurasi perangkat ini ke booth.
            </p>
          </div>
        )}
        {connected
          ? <ConnectedView cfg={cfg!} onReset={handleReset} onLaunch={handleLaunch} />
          : <SetupWizard onDone={handleDone} />
        }
      </div>
    </div>
  )
}
