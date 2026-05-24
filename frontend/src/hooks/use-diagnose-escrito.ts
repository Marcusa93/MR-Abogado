import { useMutation } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

const supabase = createClient()

export interface DiagnosticoEscrito {
  identificacion: {
    tipo_escrito: string
    rama_derecho: string
    fuero_inferido: string | null
    parte_suscribiente: string
  }
  argumentos_sin_norma: Array<{ argumento: string; norma_sugerida: string }>
  hechos_no_acreditados: Array<{ hecho: string; prueba_sugerida: string; tipo: string }>
  citas_jurisprudenciales: Array<{ cita: string; estado: string; doctrina_o_motivo: string }>
  peticiones_sin_fundamento: Array<{ peticion: string; falta: string }>
  contradicciones: Array<{ seccion_a: string; seccion_b: string; resolucion_sugerida: string }>
  normas_verificacion_pendiente: Array<{ norma: string; motivo: string }>
  alertas_plazo_fatal: Array<{ norma: string; plazo: string; fecha_inicio_computo: string | null; vencimiento_estimado: string | null }>
  observaciones_estructurales: string[]
  sintesis: {
    evaluacion: 'presentable_con_correcciones_menores' | 'requiere_reescritura_parcial' | 'requiere_reescritura_estructural'
    marcadores_totales: number
    resumen: string
  }
}

export interface DiagnosticoResponse {
  ok: boolean
  escrito: { id?: string; titulo?: string; tipo?: string; expediente_id?: string }
  area_aplicada: string
  modelo: string
  generated_at: string
  diagnostico: DiagnosticoEscrito
}

export interface DiagnosticoInput {
  escrito_id?: string
  contenido?: string
  titulo?: string
  tipo?: string
  area?: 'civil' | 'laboral' | 'familia' | 'contratos' | 'administrativo' | 'tributario'
}

export function useDiagnoseEscrito() {
  return useMutation<DiagnosticoResponse, Error, DiagnosticoInput>({
    mutationFn: async (input) => {
      const { data, error } = await supabase.functions.invoke<DiagnosticoResponse>('diagnose-escrito', {
        body: input,
      })
      if (error) throw new Error(error.message || 'Error invocando diagnóstico')
      if (!data?.ok) throw new Error((data as any)?.error || 'Respuesta inválida')
      return data
    },
  })
}
