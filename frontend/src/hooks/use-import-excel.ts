import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { ImportPreview } from '@/lib/utils/excel-import'

interface ImportResult {
  clientesCreados: number
  clientesActualizados: number
  expedientesCreados: number
  expedientesActualizados: number
  turnosCreados: number
  errores: string[]
}

export function useImportExcel() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const [progress, setProgress] = useState({ step: '', current: 0, total: 0 })

  const mutation = useMutation({
    mutationFn: async (preview: ImportPreview): Promise<ImportResult> => {
      const result: ImportResult = {
        clientesCreados: 0,
        clientesActualizados: 0,
        expedientesCreados: 0,
        expedientesActualizados: 0,
        turnosCreados: 0,
        errores: [],
      }

      // Get current user
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('No autenticado')

      // Get tipos_tramite for mapping
      const { data: tiposTramite } = await supabase
        .from('tipos_tramite')
        .select('id, nombre')
      const tipoMap = new Map<string, string>()
      const tipoNombreToCode: Record<string, string> = {
        'Jubilación Ordinaria': 'jubilacion_ordinaria',
        'Jubilación Anticipada': 'jubilacion_anticipada',
        'Pensión por Fallecimiento': 'pension_fallecimiento',
        'Pensión por Invalidez': 'pension_invalidez',
        'PUAM': 'puam',
        'Moratoria': 'moratorias',
        'Compra de Aportes': 'compra_aportes',
        'Reajuste de Haberes': 'reajuste_haberes',
        'Reclamo de Haberes': 'reclamo_haberes',
        'UCAP': 'ucap',
        'Retiro por Invalidez': 'retiro_por_invalidez',
        'Pensión No Contributiva': 'pension_no_contributiva',
        'Otro': 'otro',
      }
      for (const t of tiposTramite ?? []) {
        // Try codigo first (actual DB column), then fallback to nombre mapping
        const code = tipoNombreToCode[t.nombre] || t.nombre.toLowerCase().replace(/\s+/g, '_')
        tipoMap.set(code, t.id)
      }

      // Get profiles for abogado name → id resolution
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, nombre, apellido')
        .eq('activo', true)

      const resolveAbogadoId = (nombre: string | null): string | null => {
        if (!nombre || !profiles) return null
        const upper = nombre.toUpperCase().trim()
        const found = profiles.find(p => {
          const fullName = `${p.nombre} ${p.apellido}`.toUpperCase().trim()
          const reverseName = `${p.apellido} ${p.nombre}`.toUpperCase().trim()
          return fullName === upper || reverseName === upper ||
            p.apellido?.toUpperCase() === upper || p.nombre?.toUpperCase() === upper
        })
        return found?.id ?? null
      }

      // UDAIs table no longer exists — resolver returns null
      const resolveUdaiId = (_nombre: string | null): string | null => null

      // ── Step 1: Upsert clientes ────────────────────────────────────
      setProgress({ step: 'Importando clientes...', current: 0, total: preview.clientes.length })

      const dniToClienteId = new Map<string, string>()

      // Fetch existing clientes by DNI — batched to avoid large IN clauses
      const dnis = preview.clientes.map(c => c.dni)
      const existingDniMap = new Map<string, string>()
      const BATCH_IN = 100

      for (let i = 0; i < dnis.length; i += BATCH_IN) {
        const batch = dnis.slice(i, i + BATCH_IN)
        const { data: existingClientes } = await supabase
          .from('clientes')
          .select('id, dni')
          .in('dni', batch)
        for (const c of existingClientes ?? []) {
          existingDniMap.set(c.dni, c.id)
        }
      }

      // Process clientes in batches
      const BATCH_SIZE = 20
      for (let i = 0; i < preview.clientes.length; i += BATCH_SIZE) {
        const batch = preview.clientes.slice(i, i + BATCH_SIZE)
        setProgress({ step: 'Importando clientes...', current: i, total: preview.clientes.length })

        for (const cliente of batch) {
          try {
            const existingId = existingDniMap.get(cliente.dni)

            if (existingId) {
              // Update existing — fill in missing fields only
              const updateData: Record<string, unknown> = {
                updated_at: new Date().toISOString(),
              }
              if (cliente.telefono) updateData.telefono = cliente.telefono
              if (cliente.cuil) updateData.cuil = cliente.cuil

              const { error } = await supabase
                .from('clientes')
                .update(updateData)
                .eq('id', existingId)

              if (error) {
                result.errores.push(`Cliente ${cliente.apellido} ${cliente.nombre} (${cliente.dni}): ${error.message}`)
              } else {
                dniToClienteId.set(cliente.dni, existingId)
                result.clientesActualizados++
              }
            } else {
              // Insert new
              const { data, error } = await supabase
                .from('clientes')
                .insert({
                  apellido: cliente.apellido,
                  nombre: cliente.nombre,
                  dni: cliente.dni,
                  cuil: cliente.cuil,
                  telefono: cliente.telefono,
                  created_by: user.id,
                })
                .select('id')
                .single()

              if (error) {
                result.errores.push(`Cliente ${cliente.apellido} ${cliente.nombre} (${cliente.dni}): ${error.message}`)
              } else if (data) {
                dniToClienteId.set(cliente.dni, data.id)
                result.clientesCreados++
              }
            }
          } catch (e) {
            result.errores.push(`Cliente ${cliente.dni}: ${e instanceof Error ? e.message : String(e)}`)
          }
        }
      }

      // ── Step 2: Upsert expedientes ─────────────────────────────────
      setProgress({ step: 'Importando expedientes...', current: 0, total: preview.expedientes.length })

      // Track created expedientes for turno linking
      const clienteDniExpedienteMap = new Map<string, string>() // dni → most recent expediente_id

      for (let i = 0; i < preview.expedientes.length; i++) {
        const exp = preview.expedientes[i]
        setProgress({ step: 'Importando expedientes...', current: i, total: preview.expedientes.length })

        try {
          let clienteId = dniToClienteId.get(exp.cliente_dni)
          if (!clienteId) {
            // Try to find by DNI in DB
            const { data: found } = await supabase
              .from('clientes')
              .select('id')
              .eq('dni', exp.cliente_dni)
              .single()
            if (found) {
              dniToClienteId.set(exp.cliente_dni, found.id)
              clienteId = found.id
            } else {
              result.errores.push(`Expediente sin cliente: DNI ${exp.cliente_dni}`)
              continue
            }
          }

          const tipoTramiteId = tipoMap.get(exp.tramite) ?? tipoMap.get('otro')!
          const abogadoId = resolveAbogadoId(exp.abogado_nombre)

          // Check if expediente already exists for this cliente + tipo + estado
          const { data: existingExp } = await supabase
            .from('expedientes')
            .select('id')
            .eq('cliente_id', clienteId)
            .eq('tipo_tramite_id', tipoTramiteId)
            .eq('estado_interno', exp.estado_interno)
            .limit(1)
            .maybeSingle()

          if (existingExp) {
            // Update with any new data
            const updateData: Record<string, unknown> = {
              updated_at: new Date().toISOString(),
            }
            if (exp.numero_expediente) updateData.numero = exp.numero_expediente
            if (exp.observaciones) updateData.observaciones = exp.observaciones
            if (abogadoId) updateData.abogado_id = abogadoId
            if (exp.fecha_resolucion) updateData.fecha_resolucion = exp.fecha_resolucion

            const { error: updateExpErr } = await supabase.from('expedientes').update(updateData as never).eq('id', existingExp.id)
            if (updateExpErr) {
              result.errores.push(`Error actualizando expediente ${exp.numero_expediente}: ${updateExpErr.message}`)
            } else {
              clienteDniExpedienteMap.set(exp.cliente_dni, existingExp.id)
              result.expedientesActualizados++
            }
          } else {
            // Insert
            const caratula = (() => {
              const c = preview.clientes.find(cl => cl.dni === exp.cliente_dni)
              const tramiteLabel = tiposTramite?.find(t => {
                const code = tipoNombreToCode[t.nombre]
                return code === exp.tramite
              })?.nombre || exp.tramite.toUpperCase()
              return c ? `${c.apellido} ${c.nombre} s/ ${tramiteLabel}` : undefined
            })()

            // Generate a unique numero_expediente
            const timestamp = Date.now().toString(36)
            const rand = Math.random().toString(36).slice(2, 6)
            const nroExp = exp.numero_expediente || `IMP-${timestamp}-${rand}`.toUpperCase()

            const insertData: Record<string, unknown> = {
              cliente_id: clienteId,
              tipo_tramite_id: tipoTramiteId,
              estado_interno: exp.estado_interno,
              fecha_alta: exp.fecha_alta || new Date().toISOString().split('T')[0],
              numero: nroExp,
              observaciones: exp.observaciones,
              caratula: caratula || nroExp,
              created_by: user.id,
            }
            if (exp.numero_expediente) insertData.numero = exp.numero_expediente
            if (abogadoId) insertData.abogado_id = abogadoId
            if (exp.fecha_resolucion) insertData.fecha_resolucion = exp.fecha_resolucion

            const { data: inserted, error } = await supabase
              .from('expedientes')
              .insert(insertData as never)
              .select('id')
              .single()

            if (error) {
              result.errores.push(`Expediente ${exp.cliente_dni}: ${error.message}`)
            } else if (inserted) {
              clienteDniExpedienteMap.set(exp.cliente_dni, inserted.id)
              result.expedientesCreados++
            }
          }
        } catch (e) {
          result.errores.push(`Expediente ${exp.cliente_dni}: ${e instanceof Error ? e.message : String(e)}`)
        }
      }

      // ── Step 3: Import turnos ──────────────────────────────────────
      if (preview.turnos.length > 0) {
        setProgress({ step: 'Importando turnos...', current: 0, total: preview.turnos.length })

        for (let i = 0; i < preview.turnos.length; i++) {
          const turno = preview.turnos[i]
          setProgress({ step: 'Importando turnos...', current: i, total: preview.turnos.length })

          try {
            // Find the client by matching apellido+nombre with multiple strategies
            let clienteId: string | null = null

            // Strategy 1: Exact match by apellido + nombre
            const { data: exactMatch } = await supabase
              .from('clientes')
              .select('id')
              .ilike('apellido', turno.cliente_apellido)
              .ilike('nombre', turno.cliente_nombre || '%')
              .limit(1)

            if (exactMatch && exactMatch.length > 0) {
              clienteId = exactMatch[0].id
            }

            // Strategy 2: Apellido contains match (handles partial names)
            if (!clienteId) {
              const { data: partialMatch } = await supabase
                .from('clientes')
                .select('id')
                .ilike('apellido', `%${turno.cliente_apellido}%`)
                .limit(1)

              if (partialMatch && partialMatch.length > 0) {
                clienteId = partialMatch[0].id
              }
            }

            // Strategy 3: Try matching by first word of apellido (for compound surnames)
            if (!clienteId && turno.cliente_apellido.includes(' ')) {
              const firstWord = turno.cliente_apellido.split(' ')[0]
              const { data: firstWordMatch } = await supabase
                .from('clientes')
                .select('id')
                .ilike('apellido', `${firstWord}%`)
                .limit(1)

              if (firstWordMatch && firstWordMatch.length > 0) {
                clienteId = firstWordMatch[0].id
              }
            }

            if (!clienteId) {
              result.errores.push(`Turno ${turno.fecha}: no se encontró cliente ${turno.cliente_apellido} ${turno.cliente_nombre}`)
              continue
            }

            // Find an active expediente for this client
            const { data: expedientes } = await supabase
              .from('expedientes')
              .select('id')
              .eq('cliente_id', clienteId)
              .is('deleted_at', null)
              .order('created_at', { ascending: false })
              .limit(1)

            if (!expedientes || expedientes.length === 0) {
              result.errores.push(`Turno ${turno.fecha}: cliente ${turno.cliente_apellido} no tiene expedientes activos`)
              continue
            }

            const expedienteId = expedientes[0].id

            // Check if audiencia already exists (same expediente + same date)
            const { data: existingTurno } = await supabase
              .from('audiencias')
              .select('id')
              .eq('expediente_id', expedienteId)
              .eq('fecha', turno.fecha)
              .limit(1)
              .maybeSingle()

            if (existingTurno) continue // Skip duplicate

            const _udaiId = resolveUdaiId(turno.udai) // kept for future use
            const profesionalId = resolveAbogadoId(turno.abogada)

            const { error } = await supabase
              .from('audiencias')
              .insert({
                expediente_id: expedienteId,
                fecha: turno.fecha,
                hora: turno.hora || '09:00',
                estado: 'REALIZADO', // Historical turnos from Excel are already past
                notas: turno.tramite ? `Trámite: ${turno.tramite}` : null,
                created_by: user.id,
              } as never)

            if (error) {
              result.errores.push(`Turno ${turno.fecha} (${turno.cliente_apellido}): ${error.message}`)
            } else {
              result.turnosCreados++
            }
          } catch (e) {
            result.errores.push(`Turno ${turno.fecha}: ${e instanceof Error ? e.message : String(e)}`)
          }
        }
      }

      setProgress({ step: 'Completado', current: 1, total: 1 })
      return result
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expedientes'] })
      queryClient.invalidateQueries({ queryKey: ['clientes'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['turnos'] })
    },
  })

  return {
    importData: mutation.mutateAsync,
    isImporting: mutation.isPending,
    progress,
    result: mutation.data,
    error: mutation.error,
    reset: mutation.reset,
  }
}
