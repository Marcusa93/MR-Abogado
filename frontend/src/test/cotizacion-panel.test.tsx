import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CotizacionPanel } from '@/components/consultas/cotizacion-panel'

// Supabase falso: devuelve procesos y registra lo que se guarda.
const datos: Record<string, unknown> = {}
const guardados: { tabla: string; fila: Record<string, unknown> }[] = []

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: (tabla: string) => {
      const q: Record<string, unknown> = {}
      Object.assign(q, {
        select: () => q, eq: () => q, order: () => q, limit: () => q,
        maybeSingle: async () => ({ data: datos[tabla] ?? null, error: null }),
        then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: datos[tabla] ?? [], error: null }).then(ok),
        upsert: async (fila: Record<string, unknown>) => { guardados.push({ tabla, fila }); return { error: null } },
        insert: async (fila: Record<string, unknown>) => { guardados.push({ tabla, fila }); return { error: null } },
        update: (fila: Record<string, unknown>) => ({ eq: async () => { guardados.push({ tabla, fila }); return { error: null } } }),
        delete: () => ({ eq: async () => ({ error: null }) }),
      })
      return q
    },
  }),
}))

const base = { consulta_id: 'c1', expediente_id: null, descripcion_ia: null, estado: 'borrador', notas: null, created_by: '', created_at: '', updated_at: '', honorarios_calculados: 0, detalle: null, monto_fijo: null, multiplicador: 1, incluido: true }

function montar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <CotizacionPanel consultaId="c1" areasConsulta={['laboral_trabajador']} prefill={null} onPrefillConsumed={() => {}}
        modulos={[
          { area: 'laboral_trabajador', fuero: '', pretension: '', chances_estimadas: 'alta', observaciones: '', acciones_recomendadas: ['Demanda por despido'], riesgos: [], tipo_honorario_sugerido: 'cuota_litis', descripcion_honorarios: '' },
          { area: 'penal', fuero: '', pretension: '', chances_estimadas: 'media', observaciones: '', acciones_recomendadas: ['Denuncia por amenazas'], riesgos: [], tipo_honorario_sugerido: 'honorario_fijo', descripcion_honorarios: '' },
        ]} />
    </QueryClientProvider>,
  )
}

describe('CotizacionPanel', () => {
  beforeEach(() => {
    guardados.length = 0
    datos.cotizaciones = null
    datos.presupuestos = [
      { ...base, id: 'p1', area: 'laboral_trabajador', proceso: 'Telegrama laboral', tipo_actuacion: 'extrajudicial', tipo_honorario: 'honorario_fijo', monto_base: 250000, orden: 1 },
      { ...base, id: 'p2', area: 'laboral_trabajador', proceso: 'Demanda por despido', tipo_actuacion: 'judicial', tipo_honorario: 'mixto', monto_fijo: 400000, multiplicador: 15, monto_base: null, orden: 2 },
    ]
  })

  it('agrupa por área, suma por separado y sugiere cotizar las áreas que faltan', async () => {
    montar()
    expect(await screen.findByText('Telegrama laboral')).toBeInTheDocument()
    expect(screen.getByText('Laboral (trabajador)')).toBeInTheDocument()
    expect(screen.getByText(/15\s% de lo que se obtenga/)).toBeInTheDocument()
    expect(screen.getByText('Si contrata todo')).toBeInTheDocument()
    expect(screen.getByText(/650\.000/)).toBeInTheDocument()
    // Penal está en el diagnóstico y todavía no tiene honorarios
    expect(screen.getByText('Penal')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '+ Denuncia por amenazas' })).toBeInTheDocument()
  })

  it('todo junto con precio de paquete y financiación se guardan solos', async () => {
    montar()
    await screen.findByText('Telegrama laboral')
    fireEvent.click(screen.getByRole('button', { name: /Todo junto/ }))
    const precio = screen.getByPlaceholderText(/Vacío = /)
    fireEvent.change(precio, { target: { value: '500.000' } })
    expect(await screen.findByText(/bonificación 23/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '+ Anticipo 30 % + 3 cuotas' }))
    expect(screen.getByText(/Anticipo de .*150\.000 y 3 cuotas mensuales de .*116\.667/)).toBeInTheDocument()
    await waitFor(() => expect(guardados.some((g) => g.tabla === 'cotizaciones')).toBe(true), { timeout: 2000 })
    const ultimo = [...guardados].reverse().find((g) => g.tabla === 'cotizaciones')!.fila
    expect(ultimo).toMatchObject({ consulta_id: 'c1', modo: 'conjunto', precio_conjunto: 500000 })
    expect((ultimo.financiacion as unknown[]).length).toBe(1)
  })

  it('agrega un proceso desde una sugerencia del diagnóstico', async () => {
    montar()
    await screen.findByText('Telegrama laboral')
    fireEvent.click(screen.getByRole('button', { name: '+ Denuncia por amenazas' }))
    expect(screen.getByDisplayValue('Denuncia por amenazas')).toBeInTheDocument()
    fireEvent.change(screen.getByPlaceholderText('Ej.: 800.000'), { target: { value: '600.000' } })
    fireEvent.click(screen.getByRole('button', { name: /Agregar$/ }))
    await waitFor(() => expect(guardados.some((g) => g.tabla === 'presupuestos')).toBe(true))
    expect(guardados.find((g) => g.tabla === 'presupuestos')!.fila).toMatchObject({
      area: 'penal', proceso: 'Denuncia por amenazas', tipo_honorario: 'honorario_fijo', monto_base: 600000, honorarios_calculados: 600000, incluido: true,
    })
  })
})
