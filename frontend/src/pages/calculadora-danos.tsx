import { useMemo, useState } from 'react'
import {
  Calculator, AlertTriangle, Info, BookOpen, Save, Loader2, ShieldCheck, Pencil, X,
} from 'lucide-react'
import { useValoresReferencia, useUpsertValorReferencia, type IndicadorReferencia } from '@/hooks/use-valores-referencia'
import { useCreateDano } from '@/hooks/use-danos'
import { useAuthStore } from '@/stores/auth-store'
import { calcularDanos } from '@/lib/danos/escenarios'
import { RUBROS, PRESETS_FORMULA, ESCALA_PUNITIVO, METODO_PUNITIVO_LABEL, MATRIZ_GRAVEDAD } from '@/lib/danos/constantes'
import type {
  CalculoDanosInput, Escenario, GravedadNivel, MetodoPunitivo, PresetFormula,
  PunitivoNivel, Vulnerabilidad, FuenteIngreso, Alerta,
} from '@/lib/danos/types'
import { toast } from '@/stores/toast-store'
import { cn } from '@/lib/utils'

function formatPesos(n: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency', currency: 'ARS', maximumFractionDigits: 0,
  }).format(Math.round(n))
}

function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const ESCENARIO_META: Record<Escenario, { label: string; accent: string; ring: string }> = {
  conservador: { label: 'Conservador', accent: 'text-zinc-600 dark:text-zinc-300', ring: 'border-zinc-200 dark:border-white/10' },
  razonable:   { label: 'Razonable',   accent: 'text-amber-700 dark:text-amber-300', ring: 'border-amber-500/40' },
  expansivo:   { label: 'Expansivo',   accent: 'text-emerald-700 dark:text-emerald-300', ring: 'border-emerald-500/30' },
}

const ALERTA_STYLE: Record<Alerta['severidad'], string> = {
  error: 'bg-rose-500/10 border-rose-500/25 text-rose-700 dark:text-rose-300',
  warning: 'bg-amber-500/10 border-amber-500/25 text-amber-700 dark:text-amber-300',
  info: 'bg-zinc-500/10 border-zinc-500/20 text-zinc-600 dark:text-zinc-300',
}

// ── Form state ────────────────────────────────────────────────────────────────
interface FormState {
  fechaValuacion: string
  fechaHecho: string
  relacionConsumo: boolean
  rubros: Set<string>
  // incapacidad
  edad: number
  porcentaje: number
  ingresoMensual: number
  fuenteIngreso: FuenteIngreso
  preset: PresetFormula
  // patrimonial simple
  lucroCesantePasado: number
  medicosPasados: number
  medicosFuturos: number
  // no patrimonial
  npAuto: boolean
  npNivel: GravedadNivel
  npDuracion: number
  npVulnerabilidad: Vulnerabilidad
  npAfectacionSalud: boolean
  npReiteracion: boolean
  npBase: number
  // punitivo
  procTratoIndigno: boolean
  procRiesgoSalud: boolean
  procReiteracion: boolean
  procGrave: boolean
  procVulnerabilidad: boolean
  procObstructiva: boolean
  punMetodo: MetodoPunitivo
  punNivel: PunitivoNivel
  punCanastasManual: number | null
  punCompensatorio: number
  punPc: number
  punPd: number
  punBeneficio: number
  punProbSancion: number
}

function initialState(cbt: number): FormState {
  return {
    fechaValuacion: todayISO(), fechaHecho: '', relacionConsumo: false,
    rubros: new Set(['incapacidad']),
    edad: 40, porcentaje: 30, ingresoMensual: 0, fuenteIngreso: 'no_acreditado', preset: 'vuoto_mendez',
    lucroCesantePasado: 0, medicosPasados: 0, medicosFuturos: 0,
    npAuto: true, npNivel: 'medio', npDuracion: 6, npVulnerabilidad: 'ninguna',
    npAfectacionSalud: false, npReiteracion: false, npBase: cbt || 1_000_000,
    procTratoIndigno: false, procRiesgoSalud: false, procReiteracion: false,
    procGrave: false, procVulnerabilidad: false, procObstructiva: false,
    punMetodo: 'canastas', punNivel: 'media', punCanastasManual: null,
    punCompensatorio: 0, punPc: 0.5, punPd: 0.5, punBeneficio: 0, punProbSancion: 0.1,
  }
}

// ── Componentes de layout reutilizables ──────────────────────────────────────
function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-1.5">{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">{hint}</p>}
    </div>
  )
}

const inputCls = 'w-full rounded-lg border border-zinc-200 dark:border-white/10 bg-transparent px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-500/50'
const selectCls = 'w-full rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-500/50'

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" onClick={() => onChange(!on)}
      className={cn('flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors',
        on ? 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300'
           : 'border-zinc-200 dark:border-white/10 text-zinc-500 dark:text-zinc-400')}>
      <span className={cn('h-4 w-4 rounded border flex items-center justify-center',
        on ? 'bg-amber-500 border-amber-500' : 'border-zinc-300 dark:border-white/20')}>
        {on && <span className="h-2 w-2 rounded-sm bg-white" />}
      </span>
      {label}
    </button>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5">
      <div className="px-5 py-3 border-b border-zinc-100 dark:border-white/5">
        <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">{title}</h2>
      </div>
      <div className="px-5 py-4 space-y-4">{children}</div>
    </div>
  )
}

// ── Editor de valores de referencia (CBT / SMVM) ─────────────────────────────
function ValoresEditor({ cbt, smvm, vigencia }: { cbt: number; smvm?: number; vigencia?: string }) {
  const rol = useAuthStore(s => s.profile?.rol)
  const puedeEditar = rol === 'ADMIN' || rol === 'ABOGADO' || rol === 'DIRECTOR'
  const upsert = useUpsertValorReferencia()
  const [editando, setEditando] = useState<IndicadorReferencia | null>(null)
  const [valor, setValor] = useState(0)
  const [vigDesde, setVigDesde] = useState(todayISO())

  function abrir(ind: IndicadorReferencia, actual: number) {
    setEditando(ind); setValor(actual); setVigDesde(todayISO())
  }
  async function guardar() {
    if (!editando || valor <= 0) { toast.error('Ingresá un valor válido'); return }
    try {
      await upsert.mutateAsync({ indicador: editando, valor, vigenciaDesde: vigDesde, fuente: 'Actualización manual' })
      toast.success('Valor de referencia actualizado')
      setEditando(null)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo guardar')
    }
  }

  const filas: Array<{ ind: IndicadorReferencia; label: string; val: number }> = [
    { ind: 'CBT_HOGAR3', label: 'CBT Hogar 3', val: cbt },
    { ind: 'SMVM', label: 'SMVM (mensual)', val: smvm ?? 0 },
  ]

  return (
    <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5">
      <div className="px-5 py-3 border-b border-zinc-100 dark:border-white/5 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">Valores de referencia</h2>
        {vigencia && <span className="text-xs text-zinc-400">CBT vigente {vigencia}</span>}
      </div>
      <div className="divide-y divide-zinc-100 dark:divide-white/5">
        {filas.map(f => (
          <div key={f.ind} className="px-5 py-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-zinc-600 dark:text-zinc-300">{f.label}</span>
              <div className="flex items-center gap-3">
                <span className="font-medium text-zinc-900 dark:text-zinc-100">{f.val > 0 ? formatPesos(f.val) : '— sin cargar'}</span>
                {puedeEditar && editando !== f.ind && (
                  <button type="button" onClick={() => abrir(f.ind, f.val)}
                    className="flex items-center gap-1 rounded-lg border border-zinc-200 dark:border-white/10 px-2 py-1 text-[11px] text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-white/5">
                    <Pencil className="h-3 w-3" /> Editar
                  </button>
                )}
              </div>
            </div>
            {editando === f.ind && (
              <div className="mt-3 flex items-end gap-3 flex-wrap">
                <div>
                  <label className="block text-[11px] uppercase tracking-wider text-zinc-500 mb-1">Nuevo valor</label>
                  <input type="number" min={0} value={valor} onChange={e => setValor(Number(e.target.value))} className={cn(inputCls, 'w-40')} />
                </div>
                <div>
                  <label className="block text-[11px] uppercase tracking-wider text-zinc-500 mb-1">Vigente desde</label>
                  <input type="date" value={vigDesde} onChange={e => setVigDesde(e.target.value)} className={cn(inputCls, 'w-44')} />
                </div>
                <button type="button" onClick={guardar} disabled={upsert.isPending}
                  className="flex items-center gap-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">
                  {upsert.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Guardar
                </button>
                <button type="button" onClick={() => setEditando(null)}
                  className="flex items-center gap-1 rounded-lg border border-zinc-200 dark:border-white/10 px-2 py-2 text-sm text-zinc-500">
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Página ────────────────────────────────────────────────────────────────────
export default function CalculadoraDanos() {
  const { data: valores, isLoading: valoresLoading } = useValoresReferencia()
  const cbt = valores?.cbtHogar3 ?? 0
  const createDano = useCreateDano()

  const [f, setF] = useState<FormState>(() => initialState(0))
  const [titulo, setTitulo] = useState('')
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF(prev => ({ ...prev, [k]: v }))
  const toggleRubro = (k: string) => setF(prev => {
    const r = new Set(prev.rubros)
    r.has(k) ? r.delete(k) : r.add(k)
    return { ...prev, rubros: r }
  })

  const input: CalculoDanosInput = useMemo(() => ({
    fechaValuacion: f.fechaValuacion,
    fechaHecho: f.fechaHecho || undefined,
    relacionConsumo: f.relacionConsumo,
    rubros: [...f.rubros],
    incapacidad: f.rubros.has('incapacidad') ? {
      edad: f.edad, porcentaje: f.porcentaje, preset: f.preset,
      ingreso: {
        montoMensual: f.fuenteIngreso === 'acreditado' ? f.ingresoMensual : null,
        fuente: f.fuenteIngreso,
        parametroSupletorio: f.fuenteIngreso !== 'acreditado' ? 'SMVM' : undefined,
      },
    } : undefined,
    lucroCesantePasado: f.rubros.has('lucro_cesante') ? f.lucroCesantePasado : undefined,
    gastos: f.rubros.has('gastos_medicos') ? { medicosPasados: f.medicosPasados, medicosFuturos: f.medicosFuturos } : undefined,
    noPatrimonial: f.rubros.has('no_patrimonial') ? {
      baseComparable: f.npBase, baseEstimada: true,
      nivelManual: f.npAuto ? undefined : f.npNivel,
      duracionMeses: f.npDuracion, vulnerabilidad: f.npVulnerabilidad,
      afectacionSalud: f.npAfectacionSalud, reiteracion: f.npReiteracion,
    } : undefined,
    procedencia: f.rubros.has('punitivo') ? {
      tratoIndigno: f.procTratoIndigno, riesgoSalud: f.procRiesgoSalud,
      reiteracion: f.procReiteracion, incumplimientoGraveConDano: f.procGrave,
      vulnerabilidad: f.procVulnerabilidad, conductaProcesalObstructiva: f.procObstructiva,
    } : undefined,
    punitivo: f.rubros.has('punitivo') ? {
      metodo: f.punMetodo, nivel: f.punNivel,
      canastasManual: f.punCanastasManual ?? undefined,
      compensatorio: f.punCompensatorio, probCondenaCompensatoria: f.punPc, probCondenaPunitiva: f.punPd,
      beneficioIlicito: f.punBeneficio, probSancion: f.punProbSancion,
    } : undefined,
  }), [f])

  const resultado = useMemo(
    () => (valores ? calcularDanos(input, valores) : null),
    [input, valores],
  )

  async function handleGuardar() {
    if (!resultado) return
    if (!titulo.trim()) { toast.error('Poné un título para guardar el cálculo'); return }
    try {
      await createDano.mutateAsync({
        titulo: titulo.trim(),
        tipoCaso: f.relacionConsumo ? 'consumo' : 'civil',
        input, resultado,
      })
      toast.success('Cálculo guardado')
      setTitulo('')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo guardar')
    }
  }

  const usaPunitivo = f.rubros.has('punitivo')

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/15 dark:bg-amber-500/10">
          <Calculator className="h-5 w-5 text-amber-600 dark:text-amber-400" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Estimador de daños</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Cálculo auditable — CCyC + LDC, criterios de Tucumán
            {valores?.vigenciaDesde && ` · CBT vigente ${valores.vigenciaDesde}`}
          </p>
        </div>
      </div>

      {/* Valores de referencia (editables) */}
      <ValoresEditor cbt={cbt} smvm={valores?.smvm} vigencia={valores?.vigenciaDesde} />

      {/* Datos del caso */}
      <Card title="Datos del caso">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Fecha de valuación">
            <input type="date" value={f.fechaValuacion} onChange={e => set('fechaValuacion', e.target.value)} className={inputCls} />
          </Field>
          <Field label="Fecha del hecho" hint="Opcional — habilita intereses">
            <input type="date" value={f.fechaHecho} onChange={e => set('fechaHecho', e.target.value)} className={inputCls} />
          </Field>
        </div>
        <Toggle on={f.relacionConsumo} onChange={v => set('relacionConsumo', v)} label="Relación de consumo (habilita daño punitivo)" />
      </Card>

      {/* Rubros */}
      <Card title="Rubros a estimar">
        <div className="flex flex-wrap gap-2">
          {RUBROS.map(r => (
            <button key={r.key} type="button" onClick={() => toggleRubro(r.key)}
              className={cn('rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                f.rubros.has(r.key)
                  ? 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                  : 'border-zinc-200 dark:border-white/10 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-white/5')}>
              {r.label}
            </button>
          ))}
        </div>
      </Card>

      {/* Incapacidad */}
      {f.rubros.has('incapacidad') && (
        <Card title="Incapacidad sobreviniente (art. 1746)">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Edad"><input type="number" min={0} max={100} value={f.edad} onChange={e => set('edad', Number(e.target.value))} className={inputCls} /></Field>
            <Field label="% incapacidad"><input type="number" min={0} max={100} value={f.porcentaje} onChange={e => set('porcentaje', Number(e.target.value))} className={inputCls} /></Field>
          </div>
          <Field label="Fórmula">
            <select value={f.preset} onChange={e => set('preset', e.target.value as PresetFormula)} className={selectCls}>
              {(Object.keys(PRESETS_FORMULA) as PresetFormula[]).map(p => (
                <option key={p} value={p}>{PRESETS_FORMULA[p].label} — {PRESETS_FORMULA[p].descripcion}</option>
              ))}
            </select>
          </Field>
          <Field label="Ingreso">
            <select value={f.fuenteIngreso} onChange={e => set('fuenteIngreso', e.target.value as FuenteIngreso)} className={selectCls}>
              <option value="acreditado">Acreditado (monto conocido)</option>
              <option value="no_acreditado">No acreditado — usar SMVM subsidiario</option>
            </select>
          </Field>
          {f.fuenteIngreso === 'acreditado' && (
            <Field label="Ingreso mensual" hint="En pesos">
              <input type="number" min={0} value={f.ingresoMensual} onChange={e => set('ingresoMensual', Number(e.target.value))} className={inputCls} />
            </Field>
          )}
          {f.fuenteIngreso !== 'acreditado' && !valores?.smvm && (
            <p className="text-xs text-amber-600 dark:text-amber-400">No hay SMVM cargado en valores de referencia; cargalo para el cálculo subsidiario.</p>
          )}
        </Card>
      )}

      {/* Lucro cesante y gastos */}
      {(f.rubros.has('lucro_cesante') || f.rubros.has('gastos_medicos')) && (
        <Card title="Otros rubros patrimoniales">
          {f.rubros.has('lucro_cesante') && (
            <Field label="Lucro cesante pasado" hint="Ingresos efectivamente perdidos, ya devengados">
              <input type="number" min={0} value={f.lucroCesantePasado} onChange={e => set('lucroCesantePasado', Number(e.target.value))} className={inputCls} />
            </Field>
          )}
          {f.rubros.has('gastos_medicos') && (
            <div className="grid grid-cols-2 gap-4">
              <Field label="Gastos médicos pasados"><input type="number" min={0} value={f.medicosPasados} onChange={e => set('medicosPasados', Number(e.target.value))} className={inputCls} /></Field>
              <Field label="Gastos médicos futuros"><input type="number" min={0} value={f.medicosFuturos} onChange={e => set('medicosFuturos', Number(e.target.value))} className={inputCls} /></Field>
            </div>
          )}
        </Card>
      )}

      {/* No patrimonial */}
      {f.rubros.has('no_patrimonial') && (
        <Card title="Consecuencias no patrimoniales (art. 1741)">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Matriz de gravedad — nunca un % del daño material. El resultado es un rango que ordena la deliberación.
          </p>
          <Toggle on={f.npAuto} onChange={v => set('npAuto', v)} label="Inferir gravedad automáticamente" />
          {f.npAuto ? (
            <div className="grid grid-cols-2 gap-4">
              <Field label="Duración (meses)"><input type="number" min={0} value={f.npDuracion} onChange={e => set('npDuracion', Number(e.target.value))} className={inputCls} /></Field>
              <Field label="Vulnerabilidad">
                <select value={f.npVulnerabilidad} onChange={e => set('npVulnerabilidad', e.target.value as Vulnerabilidad)} className={selectCls}>
                  <option value="ninguna">Ninguna</option><option value="media">Media</option>
                  <option value="alta">Alta</option><option value="hipervulnerable">Hipervulnerable</option>
                </select>
              </Field>
            </div>
          ) : (
            <Field label="Nivel de gravedad">
              <select value={f.npNivel} onChange={e => set('npNivel', e.target.value as GravedadNivel)} className={selectCls}>
                {(Object.keys(MATRIZ_GRAVEDAD) as GravedadNivel[]).map(n => (
                  <option key={n} value={n}>{MATRIZ_GRAVEDAD[n].label} ({MATRIZ_GRAVEDAD[n].min}–{MATRIZ_GRAVEDAD[n].max}×)</option>
                ))}
              </select>
            </Field>
          )}
          {f.npAuto && (
            <div className="flex gap-2">
              <Toggle on={f.npAfectacionSalud} onChange={v => set('npAfectacionSalud', v)} label="Afectación de salud" />
              <Toggle on={f.npReiteracion} onChange={v => set('npReiteracion', v)} label="Reiteración" />
            </div>
          )}
          <Field label="Base comparable" hint="Monto por 1× de la matriz (estimado). Ajustar con precedentes.">
            <input type="number" min={0} value={f.npBase} onChange={e => set('npBase', Number(e.target.value))} className={inputCls} />
          </Field>
        </Card>
      )}

      {/* Punitivo */}
      {usaPunitivo && (
        <Card title="Daño punitivo (art. 52 bis LDC)">
          {!f.relacionConsumo && (
            <div className={cn('flex items-start gap-2 rounded-lg border px-3 py-2.5', ALERTA_STYLE.error)}>
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <p className="text-xs">Requiere relación de consumo. Activala en "Datos del caso".</p>
            </div>
          )}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-2">Procedencia</p>
            <div className="flex flex-wrap gap-2">
              <Toggle on={f.procGrave} onChange={v => set('procGrave', v)} label="Incumpl. grave con daño" />
              <Toggle on={f.procReiteracion} onChange={v => set('procReiteracion', v)} label="Reiteración" />
              <Toggle on={f.procTratoIndigno} onChange={v => set('procTratoIndigno', v)} label="Trato indigno" />
              <Toggle on={f.procRiesgoSalud} onChange={v => set('procRiesgoSalud', v)} label="Riesgo salud" />
              <Toggle on={f.procVulnerabilidad} onChange={v => set('procVulnerabilidad', v)} label="Vulnerabilidad" />
              <Toggle on={f.procObstructiva} onChange={v => set('procObstructiva', v)} label="Conducta obstructiva" />
            </div>
          </div>
          <Field label="Método de cuantificación">
            <select value={f.punMetodo} onChange={e => set('punMetodo', e.target.value as MetodoPunitivo)} className={selectCls}>
              {(Object.keys(METODO_PUNITIVO_LABEL) as MetodoPunitivo[]).map(m => (
                <option key={m} value={m}>{METODO_PUNITIVO_LABEL[m]}</option>
              ))}
            </select>
          </Field>
          {(f.punMetodo === 'canastas' || f.punMetodo === 'prudencial') && (
            <Field label="Nivel (escala en canastas)">
              <select value={f.punNivel} onChange={e => set('punNivel', e.target.value as PunitivoNivel)} className={selectCls}>
                {(Object.keys(ESCALA_PUNITIVO) as PunitivoNivel[]).map(n => (
                  <option key={n} value={n}>{ESCALA_PUNITIVO[n].label} ({ESCALA_PUNITIVO[n].min}–{ESCALA_PUNITIVO[n].max} CBT)</option>
                ))}
              </select>
            </Field>
          )}
          {f.punMetodo === 'irigoyen_testa' && (
            <div className="grid grid-cols-3 gap-4">
              <Field label="Compensatorio (C)"><input type="number" min={0} value={f.punCompensatorio} onChange={e => set('punCompensatorio', Number(e.target.value))} className={inputCls} /></Field>
              <Field label="Pc (0-1)"><input type="number" min={0} max={1} step={0.05} value={f.punPc} onChange={e => set('punPc', Number(e.target.value))} className={inputCls} /></Field>
              <Field label="Pd (0-1)"><input type="number" min={0} max={1} step={0.05} value={f.punPd} onChange={e => set('punPd', Number(e.target.value))} className={inputCls} /></Field>
            </div>
          )}
          {f.punMetodo === 'beneficio_ilicito' && (
            <div className="grid grid-cols-2 gap-4">
              <Field label="Beneficio ilícito"><input type="number" min={0} value={f.punBeneficio} onChange={e => set('punBeneficio', Number(e.target.value))} className={inputCls} /></Field>
              <Field label="Prob. de sanción (0-1)"><input type="number" min={0} max={1} step={0.05} value={f.punProbSancion} onChange={e => set('punProbSancion', Number(e.target.value))} className={inputCls} /></Field>
            </div>
          )}
        </Card>
      )}

      {/* Resultado */}
      {valoresLoading && (
        <div className="rounded-xl border border-zinc-200 dark:border-white/10 px-5 py-6 text-center text-sm text-zinc-500">Cargando valores de referencia…</div>
      )}
      {resultado && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            {(['conservador', 'razonable', 'expansivo'] as Escenario[]).map(esc => {
              const e = resultado.escenarios[esc]
              const meta = ESCENARIO_META[esc]
              return (
                <div key={esc} className={cn('rounded-xl border bg-white dark:bg-white/5 px-4 py-4', meta.ring)}>
                  <p className={cn('text-xs font-semibold uppercase tracking-wider mb-1', meta.accent)}>{meta.label}</p>
                  <p className="text-lg font-bold text-zinc-900 dark:text-zinc-100 leading-tight">{formatPesos(e.total)}</p>
                </div>
              )
            })}
          </div>

          {/* Desglose del razonable */}
          <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 overflow-hidden">
            <div className="px-5 py-3 border-b border-zinc-100 dark:border-white/5">
              <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">Desglose (escenario razonable)</h2>
            </div>
            <div className="divide-y divide-zinc-100 dark:divide-white/5">
              {resultado.escenarios.razonable.rubros.map(r => (
                <div key={r.key} className="flex items-center justify-between px-5 py-2.5 text-sm">
                  <span className="text-zinc-600 dark:text-zinc-300">{r.label}</span>
                  <span className="font-medium text-zinc-900 dark:text-zinc-100">{formatPesos(r.monto)}</span>
                </div>
              ))}
              {resultado.escenarios.razonable.rubros.length === 0 && (
                <div className="px-5 py-4 text-sm text-zinc-400 text-center">Seleccioná rubros y cargá datos para ver el cálculo.</div>
              )}
            </div>
          </div>

          {/* Alertas */}
          {resultado.auditoria.alertas.length > 0 && (
            <div className="space-y-2">
              {resultado.auditoria.alertas.map((a, i) => (
                <div key={i} className={cn('flex items-start gap-2 rounded-lg border px-3 py-2.5', ALERTA_STYLE[a.severidad])}>
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  <p className="text-xs">{a.mensaje}</p>
                </div>
              ))}
            </div>
          )}

          {/* Auditoría */}
          <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-white/5 px-5 py-4 space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              <ShieldCheck className="h-4 w-4" /> Auditoría
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-zinc-500 dark:text-zinc-400">Nivel de confianza:</span>
              <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium',
                resultado.auditoria.nivelConfianza === 'alto' ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                : resultado.auditoria.nivelConfianza === 'medio' ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                : 'bg-rose-500/15 text-rose-700 dark:text-rose-300')}>
                {resultado.auditoria.nivelConfianza}
              </span>
            </div>
            {resultado.auditoria.variablesEstimadas.length > 0 && (
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                <span className="font-medium">Variables estimadas:</span> {resultado.auditoria.variablesEstimadas.join(' · ')}
              </p>
            )}
            <p className="text-xs text-zinc-400 dark:text-zinc-500">
              CBT Hogar 3 usada: {formatPesos(cbt)}{valores?.smvm ? ` · SMVM: ${formatPesos(valores.smvm)}` : ''}
            </p>
          </div>

          {/* Guardar */}
          <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 px-5 py-4 flex items-center gap-3">
            <input type="text" placeholder="Título del cálculo (ej. Romero c/ Prepaga)"
              value={titulo} onChange={e => setTitulo(e.target.value)} className={cn(inputCls, 'flex-1')} />
            <button type="button" onClick={handleGuardar} disabled={createDano.isPending}
              className="flex items-center gap-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 px-4 py-2 text-sm font-medium text-white transition-colors disabled:opacity-50">
              {createDano.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Guardar
            </button>
          </div>
        </div>
      )}

      {/* Nota */}
      <div className="flex items-start gap-2 rounded-lg bg-zinc-50 dark:bg-white/5 border border-zinc-200 dark:border-white/10 px-4 py-3">
        <div className="flex gap-2">
          <BookOpen className="h-4 w-4 text-zinc-400 mt-0.5 shrink-0" />
        </div>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Estimador auditable, no un dictamen. Las fórmulas (art. 1746, Irigoyen Testa, canastas) son una base objetiva
          controlable; la cuantificación final exige juicio profesional. Las consecuencias no patrimoniales y la
          procedencia del daño punitivo requieren revisión humana.
        </p>
      </div>

      <div className="flex items-start gap-2 px-1">
        <Info className="h-3.5 w-3.5 text-zinc-400 mt-0.5 shrink-0" />
        <p className="text-[11px] text-zinc-400">Los valores de referencia (CBT/SMVM) se actualizan desde la tabla valores_referencia.</p>
      </div>
    </div>
  )
}
