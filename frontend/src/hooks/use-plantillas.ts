import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { EscritoContenido, EscritoTemplate } from '@/hooks/use-escritos'
import { encabezadoDesdeSae, type DatosPlantilla } from '@/lib/escritos/plantillas'

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = () => createClient() as any

/** Plantillas de trámite del estudio y modelos estructurales, para usar sin IA. */
export function usePlantillas() {
  return useQuery({
    queryKey: ['escrito-plantillas'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await db().from('escrito_templates')
        .select('id, user_id, nombre, tipo, descripcion, categoria, contenido_modelo, compartido, created_at')
        .in('categoria', ['tramite', 'modelo'])
        .eq('is_active', true)
        .not('contenido_modelo', 'is', null)
        .order('nombre', { ascending: true })
      if (error) throw error
      return (data ?? []) as EscritoTemplate[]
    },
  })
}

const limpiar = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim()

/**
 * Datos del expediente para completar la plantilla. El encabezado sale del
 * último escrito del expediente (prefiriendo uno firmado, que ya revisó un abogado);
 * si no hay, se sugiere uno según la oficina del SAE.
 */
export function useDatosPlantilla(expedienteId: string | null | undefined) {
  return useQuery({
    queryKey: ['escrito-plantilla-datos', expedienteId],
    enabled: !!expedienteId,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<DatosPlantilla> => {
      const [{ data: exp }, { data: previos }] = await Promise.all([
        db().from('expedientes')
          .select('numero, numero_sae, caratula, sae_proceeding_entry, cliente:clientes(nombre, apellido, razon_social, tipo_persona)')
          .eq('id', expedienteId).maybeSingle(),
        db().from('escritos').select('estado, contenido').eq('expediente_id', expedienteId)
          .order('updated_at', { ascending: false }).limit(15),
      ])
      const proc = exp?.sae_proceeding_entry?.proceeding ?? null
      const firmados = (previos ?? []).filter((e: { estado: string }) => e.estado !== 'borrador')
      const conEnc = [...firmados, ...(previos ?? [])].find((e: { contenido?: EscritoContenido }) => {
        const enc = limpiar(e.contenido?.encabezado_juez)
        return enc && !/\[|X[ªa]/.test(enc)
      })
      const c = exp?.cliente
      const cliente = c ? (c.tipo_persona === 'juridica' && c.razon_social ? c.razon_social : [c.nombre, c.apellido].filter(Boolean).join(' ')) : ''
      return {
        encabezado: limpiar(conEnc?.contenido?.encabezado_juez) || encabezadoDesdeSae(proc?.jurisdiction_description, proc?.juzgado?.dscr),
        caratula: limpiar(exp?.caratula || proc?.caratula),
        expte: limpiar(exp?.numero_sae || proc?.nro_expediente),
        cliente: /importado\s+sae/i.test(cliente) ? '' : limpiar(cliente).toUpperCase(),
      }
    },
  })
}

export function useCrearDesdePlantilla() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { expediente_id: string | null; titulo: string; tipo: string; contenido: EscritoContenido; template_id: string }) => {
      const { data, error } = await db().rpc('crear_escrito_plantilla', {
        p_expediente_id: input.expediente_id, p_titulo: input.titulo, p_tipo: input.tipo,
        p_contenido: input.contenido, p_template_id: input.template_id,
      })
      if (error) throw error
      return data as string
    },
    onSuccess: (_id, v) => {
      qc.invalidateQueries({ queryKey: ['escritos-all'] })
      if (v.expediente_id) qc.invalidateQueries({ queryKey: ['escritos', v.expediente_id] })
    },
  })
}

export function useGuardarComoPlantilla() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { nombre: string; tipo: string; contenido: EscritoContenido; compartido: boolean }) => {
      const { data: { user } } = await createClient().auth.getUser()
      if (!user) throw new Error('No autenticado')
      const { error } = await db().from('escrito_templates').insert({
        user_id: user.id, nombre: input.nombre, tipo: input.tipo, categoria: 'tramite',
        contenido_modelo: input.contenido, compartido: input.compartido, is_active: true,
      })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['escrito-plantillas'] }),
  })
}

export function useDesactivarPlantilla() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db().from('escrito_templates').update({ is_active: false }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['escrito-plantillas'] }),
  })
}

// ─── Uso de IA ───────────────────────────────────────────────────────────────

export interface UsoIA {
  por_abogado: {
    user_id: string; nombre: string | null; escritos_ia: number; escritos_plantilla: number; firmados: number
    costo_redaccion: number; costo_asistente: number; costo_revision: number; edicion_promedio: number | null
  }[]
  por_tipo: { tipo: string; origen: string; modelo: string | null; n: number; firmados: number; edicion_promedio: number | null; costo_promedio: number | null }[]
  por_mes: { mes: string; costo: number }[]
}

export function useUsoIA(desde: Date, hasta: Date) {
  return useQuery({
    queryKey: ['uso-ia-escritos', desde.toISOString().slice(0, 10), hasta.toISOString().slice(0, 10)],
    queryFn: async () => {
      const { data, error } = await db().rpc('uso_ia_escritos', { p_desde: desde.toISOString(), p_hasta: hasta.toISOString() })
      if (error) throw error
      return data as UsoIA
    },
  })
}

// ─── Ordenar aprendizajes ────────────────────────────────────────────────────

export interface ConsolidacionAprendizajes {
  total: number
  grupos: { regla: string; ambito: string | null; ids: string[]; originales: { id: string; contenido: string; proposed: boolean; observed_in_cases: number }[] }[]
  puntuales: { id: string; contenido: string; proposed: boolean; motivo: string }[]
  contradicciones: { detalle: string; reglas: { id: string; contenido: string }[] }[]
  uso?: { costo_usd: number | null }
}

export function useConsolidarAprendizajes() {
  return useMutation({
    mutationFn: async (ownerId: string | null) => {
      const { data, error } = await createClient().functions.invoke('aprendizajes-consolidar', { body: ownerId ? { owner_id: ownerId } : {} })
      if (error) {
        const ctx = (error as { context?: unknown }).context
        if (ctx instanceof Response) { const b = await ctx.json().catch(() => null); if (b?.error) throw new Error(b.error) }
        throw error
      }
      if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error)
      return data as ConsolidacionAprendizajes
    },
  })
}

export function useFusionarAprendizajes() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { ids: string[]; contenido: string; ambito: string | null; aprobar: boolean }) => {
      const { error } = await db().rpc('aprendizajes_fusionar', {
        p_ids: input.ids, p_contenido: input.contenido, p_ambito: input.ambito, p_aprobar: input.aprobar,
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['aprendizajes'] })
      qc.invalidateQueries({ queryKey: ['aprendizajes-autores'] })
    },
  })
}
