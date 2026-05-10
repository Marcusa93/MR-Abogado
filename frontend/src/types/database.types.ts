export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      adjuntos: {
        Row: {
          id: string
          expediente_id: string | null
          cliente_id: string | null
          nombre_archivo: string
          tipo_mime: string
          tamano_bytes: number | null
          storage_path: string
          categoria: string | null
          descripcion: string | null
          uploaded_by: string
          created_at: string
          deleted_at: string | null
        }
        Insert: {
          id?: string
          expediente_id?: string | null
          cliente_id?: string | null
          nombre_archivo: string
          tipo_mime: string
          tamano_bytes?: number | null
          storage_path: string
          categoria?: string | null
          descripcion?: string | null
          uploaded_by: string
          created_at?: string
          deleted_at?: string | null
        }
        Update: {
          id?: string
          expediente_id?: string | null
          cliente_id?: string | null
          nombre_archivo?: string
          tipo_mime?: string
          tamano_bytes?: number | null
          storage_path?: string
          categoria?: string | null
          descripcion?: string | null
          uploaded_by?: string
          created_at?: string
          deleted_at?: string | null
        }
        Relationships: [
          { foreignKeyName: "adjuntos_expediente_id_fkey"; columns: ["expediente_id"]; referencedRelation: "expedientes"; referencedColumns: ["id"] },
          { foreignKeyName: "adjuntos_cliente_id_fkey"; columns: ["cliente_id"]; referencedRelation: "clientes"; referencedColumns: ["id"] },
          { foreignKeyName: "adjuntos_uploaded_by_fkey"; columns: ["uploaded_by"]; referencedRelation: "profiles"; referencedColumns: ["id"] }
        ]
      }
      alertas: {
        Row: {
          id: string
          expediente_id: string | null
          tipo: string
          titulo: string
          mensaje: string | null
          destinatario_id: string | null
          prioridad: string
          estado: string
          fecha_vencimiento: string | null
          pospuesta_hasta: string | null
          resuelta_at: string | null
          resuelta_por: string | null
          origen: string
          created_at: string
        }
        Insert: {
          id?: string
          expediente_id?: string | null
          tipo: string
          titulo: string
          mensaje?: string | null
          destinatario_id?: string | null
          prioridad?: string
          estado?: string
          fecha_vencimiento?: string | null
          pospuesta_hasta?: string | null
          resuelta_at?: string | null
          resuelta_por?: string | null
          origen?: string
          created_at?: string
        }
        Update: {
          id?: string
          expediente_id?: string | null
          tipo?: string
          titulo?: string
          mensaje?: string | null
          destinatario_id?: string | null
          prioridad?: string
          estado?: string
          fecha_vencimiento?: string | null
          pospuesta_hasta?: string | null
          resuelta_at?: string | null
          resuelta_por?: string | null
          origen?: string
          created_at?: string
        }
        Relationships: [
          { foreignKeyName: "alertas_expediente_id_fkey"; columns: ["expediente_id"]; referencedRelation: "expedientes"; referencedColumns: ["id"] },
          { foreignKeyName: "alertas_destinatario_id_fkey"; columns: ["destinatario_id"]; referencedRelation: "profiles"; referencedColumns: ["id"] },
          { foreignKeyName: "alertas_resuelta_por_fkey"; columns: ["resuelta_por"]; referencedRelation: "profiles"; referencedColumns: ["id"] }
        ]
      }
      audiencias: {
        Row: {
          id: string
          expediente_id: string
          tipo_audiencia_id: string | null
          organismo_id: string | null
          profesional_asistente_id: string | null
          fecha: string
          hora: string | null
          estado: string
          resultado: string | null
          notas: string | null
          fuente: Database["public"]["Enums"]["audiencia_fuente"]
          sae_movement_id: string | null
          created_by: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          expediente_id: string
          tipo_audiencia_id?: string | null
          organismo_id?: string | null
          profesional_asistente_id?: string | null
          fecha: string
          hora?: string | null
          estado?: string
          resultado?: string | null
          notas?: string | null
          fuente?: Database["public"]["Enums"]["audiencia_fuente"]
          sae_movement_id?: string | null
          created_by: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          expediente_id?: string
          tipo_audiencia_id?: string | null
          organismo_id?: string | null
          profesional_asistente_id?: string | null
          fecha?: string
          hora?: string | null
          estado?: string
          resultado?: string | null
          notas?: string | null
          fuente?: Database["public"]["Enums"]["audiencia_fuente"]
          sae_movement_id?: string | null
          created_by?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          { foreignKeyName: "audiencias_expediente_id_fkey"; columns: ["expediente_id"]; referencedRelation: "expedientes"; referencedColumns: ["id"] },
          { foreignKeyName: "audiencias_tipo_audiencia_id_fkey"; columns: ["tipo_audiencia_id"]; referencedRelation: "catalogo_tipos_audiencia"; referencedColumns: ["id"] },
          { foreignKeyName: "audiencias_organismo_id_fkey"; columns: ["organismo_id"]; referencedRelation: "organismos"; referencedColumns: ["id"] },
          { foreignKeyName: "audiencias_profesional_asistente_id_fkey"; columns: ["profesional_asistente_id"]; referencedRelation: "profiles"; referencedColumns: ["id"] },
          { foreignKeyName: "audiencias_sae_movement_id_fkey"; columns: ["sae_movement_id"]; referencedRelation: "sae_movements"; referencedColumns: ["id"] }
        ]
      }
      audit_log: {
        Row: {
          id: number
          tabla: string
          registro_id: string
          accion: string
          datos_anteriores: Json | null
          datos_nuevos: Json | null
          user_id: string | null
          ip_address: string | null
          created_at: string
        }
        Insert: {
          tabla: string
          registro_id: string
          accion: string
          datos_anteriores?: Json | null
          datos_nuevos?: Json | null
          user_id?: string | null
          ip_address?: string | null
          created_at?: string
        }
        Update: {
          tabla?: string
          registro_id?: string
          accion?: string
          datos_anteriores?: Json | null
          datos_nuevos?: Json | null
          user_id?: string | null
          ip_address?: string | null
          created_at?: string
        }
        Relationships: []
      }
      catalogo_tipos_audiencia: {
        Row: {
          id: string
          codigo: string
          nombre: string
          descripcion: string | null
          activo: boolean
          orden: number
        }
        Insert: {
          id?: string
          codigo: string
          nombre: string
          descripcion?: string | null
          activo?: boolean
          orden?: number
        }
        Update: {
          id?: string
          codigo?: string
          nombre?: string
          descripcion?: string | null
          activo?: boolean
          orden?: number
        }
        Relationships: []
      }
      catalogo_tipos_tarea: {
        Row: {
          id: string
          nombre: string
          descripcion: string | null
          activo: boolean
        }
        Insert: {
          id?: string
          nombre: string
          descripcion?: string | null
          activo?: boolean
        }
        Update: {
          id?: string
          nombre?: string
          descripcion?: string | null
          activo?: boolean
        }
        Relationships: []
      }
      clientes: {
        Row: {
          id: string
          apellido: string
          nombre: string
          dni: string
          cuil: string | null
          telefono: string | null
          telefono_alt: string | null
          email: string | null
          domicilio: string | null
          localidad: string | null
          provincia: string | null
          fecha_nacimiento: string | null
          sexo: string | null
          notas: string | null
          origen: string | null
          created_by: string
          created_at: string
          updated_at: string
          deleted_at: string | null
        }
        Insert: {
          id?: string
          apellido: string
          nombre: string
          dni: string
          cuil?: string | null
          telefono?: string | null
          telefono_alt?: string | null
          email?: string | null
          domicilio?: string | null
          localidad?: string | null
          provincia?: string | null
          fecha_nacimiento?: string | null
          sexo?: string | null
          notas?: string | null
          origen?: string | null
          created_by: string
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Update: {
          id?: string
          apellido?: string
          nombre?: string
          dni?: string
          cuil?: string | null
          telefono?: string | null
          telefono_alt?: string | null
          email?: string | null
          domicilio?: string | null
          localidad?: string | null
          provincia?: string | null
          fecha_nacimiento?: string | null
          sexo?: string | null
          notas?: string | null
          origen?: string | null
          created_by?: string
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Relationships: [
          { foreignKeyName: "clientes_created_by_fkey"; columns: ["created_by"]; referencedRelation: "profiles"; referencedColumns: ["id"] }
        ]
      }
      expediente_contactos: {
        Row: {
          id: string
          cliente_id: string
          nombre: string
          relacion: string | null
          telefono: string | null
          email: string | null
          notas: string | null
          created_at: string
        }
        Insert: {
          id?: string
          cliente_id: string
          nombre: string
          relacion?: string | null
          telefono?: string | null
          email?: string | null
          notas?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          cliente_id?: string
          nombre?: string
          relacion?: string | null
          telefono?: string | null
          email?: string | null
          notas?: string | null
          created_at?: string
        }
        Relationships: [
          { foreignKeyName: "expediente_contactos_cliente_id_fkey"; columns: ["cliente_id"]; referencedRelation: "clientes"; referencedColumns: ["id"] }
        ]
      }
      expediente_document_checklist: {
        Row: {
          id: string
          expediente_id: string
          documento: string
          requerido: boolean
          recibido: boolean
          fecha_recibido: string | null
          adjunto_id: string | null
          notas: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          expediente_id: string
          documento: string
          requerido?: boolean
          recibido?: boolean
          fecha_recibido?: string | null
          adjunto_id?: string | null
          notas?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          expediente_id?: string
          documento?: string
          requerido?: boolean
          recibido?: boolean
          fecha_recibido?: string | null
          adjunto_id?: string | null
          notas?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          { foreignKeyName: "expediente_document_checklist_expediente_id_fkey"; columns: ["expediente_id"]; referencedRelation: "expedientes"; referencedColumns: ["id"] },
          { foreignKeyName: "expediente_document_checklist_adjunto_id_fkey"; columns: ["adjunto_id"]; referencedRelation: "adjuntos"; referencedColumns: ["id"] }
        ]
      }
      expediente_miembros: {
        Row: {
          id: string
          expediente_id: string
          profile_id: string
          rol: string
          activo: boolean
          created_at: string
        }
        Insert: {
          id?: string
          expediente_id: string
          profile_id: string
          rol?: string
          activo?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          expediente_id?: string
          profile_id?: string
          rol?: string
          activo?: boolean
          created_at?: string
        }
        Relationships: [
          { foreignKeyName: "expediente_miembros_expediente_id_fkey"; columns: ["expediente_id"]; referencedRelation: "expedientes"; referencedColumns: ["id"] },
          { foreignKeyName: "expediente_miembros_profile_id_fkey"; columns: ["profile_id"]; referencedRelation: "profiles"; referencedColumns: ["id"] }
        ]
      }
      expediente_notas: {
        Row: {
          id: string
          expediente_id: string
          contenido: string
          es_privada: boolean
          eliminada: boolean
          eliminada_at: string | null
          created_by: string
          created_at: string
        }
        Insert: {
          id?: string
          expediente_id: string
          contenido: string
          es_privada?: boolean
          eliminada?: boolean
          eliminada_at?: string | null
          created_by: string
          created_at?: string
        }
        Update: {
          id?: string
          expediente_id?: string
          contenido?: string
          es_privada?: boolean
          eliminada?: boolean
          eliminada_at?: string | null
          created_by?: string
          created_at?: string
        }
        Relationships: [
          { foreignKeyName: "expediente_notas_expediente_id_fkey"; columns: ["expediente_id"]; referencedRelation: "expedientes"; referencedColumns: ["id"] },
          { foreignKeyName: "expediente_notas_created_by_fkey"; columns: ["created_by"]; referencedRelation: "profiles"; referencedColumns: ["id"] }
        ]
      }
      expediente_tags: {
        Row: {
          id: string
          expediente_id: string
          tag: string
          created_by: string
          created_at: string
        }
        Insert: {
          id?: string
          expediente_id: string
          tag: string
          created_by: string
          created_at?: string
        }
        Update: {
          id?: string
          expediente_id?: string
          tag?: string
          created_by?: string
          created_at?: string
        }
        Relationships: [
          { foreignKeyName: "expediente_tags_expediente_id_fkey"; columns: ["expediente_id"]; referencedRelation: "expedientes"; referencedColumns: ["id"] },
          { foreignKeyName: "expediente_tags_created_by_fkey"; columns: ["created_by"]; referencedRelation: "profiles"; referencedColumns: ["id"] }
        ]
      }
      expedientes: {
        Row: {
          id: string
          numero: string
          caratula: string | null
          cliente_id: string
          tipo_tramite_id: string
          organismo_id: string | null
          fuero: string | null
          estado_interno: string
          estado_organismo: string | null
          estado_previo_pausa: string | null
          numero_sae: string | null
          estado_sae: string | null
          ultima_sincronizacion_sae: string | null
          prioridad: string
          es_propio: boolean
          fecha_alta: string
          fecha_inicio_proceso: string | null
          fecha_resolucion: string | null
          fecha_cierre: string | null
          observaciones: string | null
          analisis_viabilidad: string | null
          viable: boolean | null
          created_by: string
          created_at: string
          updated_at: string
          deleted_at: string | null
        }
        Insert: {
          id?: string
          numero: string
          caratula?: string | null
          cliente_id: string
          tipo_tramite_id: string
          organismo_id?: string | null
          fuero?: string | null
          estado_interno?: string
          estado_organismo?: string | null
          estado_previo_pausa?: string | null
          numero_sae?: string | null
          estado_sae?: string | null
          ultima_sincronizacion_sae?: string | null
          prioridad?: string
          es_propio?: boolean
          fecha_alta?: string
          fecha_inicio_proceso?: string | null
          fecha_resolucion?: string | null
          fecha_cierre?: string | null
          observaciones?: string | null
          analisis_viabilidad?: string | null
          viable?: boolean | null
          created_by: string
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Update: {
          id?: string
          numero?: string
          caratula?: string | null
          cliente_id?: string
          tipo_tramite_id?: string
          organismo_id?: string | null
          fuero?: string | null
          estado_interno?: string
          estado_organismo?: string | null
          estado_previo_pausa?: string | null
          numero_sae?: string | null
          estado_sae?: string | null
          ultima_sincronizacion_sae?: string | null
          prioridad?: string
          es_propio?: boolean
          fecha_alta?: string
          fecha_inicio_proceso?: string | null
          fecha_resolucion?: string | null
          fecha_cierre?: string | null
          observaciones?: string | null
          analisis_viabilidad?: string | null
          viable?: boolean | null
          created_by?: string
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Relationships: [
          { foreignKeyName: "expedientes_cliente_id_fkey"; columns: ["cliente_id"]; referencedRelation: "clientes"; referencedColumns: ["id"] },
          { foreignKeyName: "expedientes_tipo_tramite_id_fkey"; columns: ["tipo_tramite_id"]; referencedRelation: "tipos_tramite"; referencedColumns: ["id"] },
          { foreignKeyName: "expedientes_organismo_id_fkey"; columns: ["organismo_id"]; referencedRelation: "organismos"; referencedColumns: ["id"] },
          { foreignKeyName: "expedientes_created_by_fkey"; columns: ["created_by"]; referencedRelation: "profiles"; referencedColumns: ["id"] }
        ]
      }
      historial_estados_expediente: {
        Row: {
          id: string
          expediente_id: string
          estado_anterior: string | null
          estado_nuevo: string
          motivo: string
          observacion: string | null
          changed_by: string
          created_at: string
        }
        Insert: {
          id?: string
          expediente_id: string
          estado_anterior?: string | null
          estado_nuevo: string
          motivo: string
          observacion?: string | null
          changed_by: string
          created_at?: string
        }
        Update: {
          id?: string
          expediente_id?: string
          estado_anterior?: string | null
          estado_nuevo?: string
          motivo?: string
          observacion?: string | null
          changed_by?: string
          created_at?: string
        }
        Relationships: [
          { foreignKeyName: "historial_estados_expediente_expediente_id_fkey"; columns: ["expediente_id"]; referencedRelation: "expedientes"; referencedColumns: ["id"] },
          { foreignKeyName: "historial_estados_expediente_changed_by_fkey"; columns: ["changed_by"]; referencedRelation: "profiles"; referencedColumns: ["id"] }
        ]
      }
      organismos: {
        Row: {
          id: string
          nombre: string
          tipo: string
          jurisdiccion: string | null
          domicilio: string | null
          localidad: string | null
          provincia: string | null
          telefono: string | null
          activo: boolean
        }
        Insert: {
          id?: string
          nombre: string
          tipo?: string
          jurisdiccion?: string | null
          domicilio?: string | null
          localidad?: string | null
          provincia?: string | null
          telefono?: string | null
          activo?: boolean
        }
        Update: {
          id?: string
          nombre?: string
          tipo?: string
          jurisdiccion?: string | null
          domicilio?: string | null
          localidad?: string | null
          provincia?: string | null
          telefono?: string | null
          activo?: boolean
        }
        Relationships: []
      }
      profiles: {
        Row: {
          id: string
          email: string
          nombre_completo: string
          nombre: string
          apellido: string
          rol: string
          telefono: string | null
          avatar_url: string | null
          activo: boolean
          must_change_password: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          nombre_completo: string
          nombre?: string
          apellido?: string
          rol?: string
          telefono?: string | null
          avatar_url?: string | null
          activo?: boolean
          must_change_password?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          nombre_completo?: string
          nombre?: string
          apellido?: string
          rol?: string
          telefono?: string | null
          avatar_url?: string | null
          activo?: boolean
          must_change_password?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          id: string
          user_id: string
          endpoint: string
          p256dh_key: string
          auth_key: string
          user_agent: string | null
          platform: string | null
          created_at: string
          last_used_at: string
        }
        Insert: {
          id?: string
          user_id: string
          endpoint: string
          p256dh_key: string
          auth_key: string
          user_agent?: string | null
          platform?: string | null
          created_at?: string
          last_used_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          endpoint?: string
          p256dh_key?: string
          auth_key?: string
          user_agent?: string | null
          platform?: string | null
          created_at?: string
          last_used_at?: string
        }
        Relationships: []
      }
      sae_credentials: {
        Row: {
          id: string
          profile_id: string
          username: string
          encrypted_secret: string
          provider: string
          status: string
          last_login_at: string | null
          last_sync_at: string | null
          last_error: string | null
          config: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          profile_id: string
          username: string
          encrypted_secret: string
          provider?: string
          status?: string
          last_login_at?: string | null
          last_sync_at?: string | null
          last_error?: string | null
          config?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          profile_id?: string
          username?: string
          encrypted_secret?: string
          provider?: string
          status?: string
          last_login_at?: string | null
          last_sync_at?: string | null
          last_error?: string | null
          config?: Json
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          { foreignKeyName: "sae_credentials_profile_id_fkey"; columns: ["profile_id"]; referencedRelation: "profiles"; referencedColumns: ["id"] }
        ]
      }
      sae_movements: {
        Row: {
          id: string
          expediente_id: string
          external_id: string | null
          sae_case_id: string | null
          fecha: string
          titulo: string
          cuerpo: string | null
          tipo_movimiento: Database["public"]["Enums"]["sae_movement_type"]
          fingerprint: string
          tiene_documentos: boolean
          raw_payload: Json
          synced_at: string
          created_at: string
        }
        Insert: {
          id?: string
          expediente_id: string
          external_id?: string | null
          sae_case_id?: string | null
          fecha: string
          titulo: string
          cuerpo?: string | null
          tipo_movimiento?: Database["public"]["Enums"]["sae_movement_type"]
          fingerprint: string
          tiene_documentos?: boolean
          raw_payload?: Json
          synced_at?: string
          created_at?: string
        }
        Update: {
          id?: string
          expediente_id?: string
          external_id?: string | null
          sae_case_id?: string | null
          fecha?: string
          titulo?: string
          cuerpo?: string | null
          tipo_movimiento?: Database["public"]["Enums"]["sae_movement_type"]
          fingerprint?: string
          tiene_documentos?: boolean
          raw_payload?: Json
          synced_at?: string
          created_at?: string
        }
        Relationships: [
          { foreignKeyName: "sae_movements_expediente_id_fkey"; columns: ["expediente_id"]; referencedRelation: "expedientes"; referencedColumns: ["id"] }
        ]
      }
      sae_sync_logs: {
        Row: {
          id: string
          expediente_id: string | null
          profile_id: string
          status: string
          nuevas_actuaciones: number
          duplicadas: number
          audiencias_sugeridas: number
          started_at: string
          finished_at: string | null
          duration_ms: number | null
          error_code: string | null
          error_message: string | null
          raw_meta: Json
          created_at: string
        }
        Insert: {
          id?: string
          expediente_id?: string | null
          profile_id: string
          status?: string
          nuevas_actuaciones?: number
          duplicadas?: number
          audiencias_sugeridas?: number
          started_at?: string
          finished_at?: string | null
          error_code?: string | null
          error_message?: string | null
          raw_meta?: Json
          created_at?: string
        }
        Update: {
          id?: string
          expediente_id?: string | null
          profile_id?: string
          status?: string
          nuevas_actuaciones?: number
          duplicadas?: number
          audiencias_sugeridas?: number
          started_at?: string
          finished_at?: string | null
          error_code?: string | null
          error_message?: string | null
          raw_meta?: Json
          created_at?: string
        }
        Relationships: [
          { foreignKeyName: "sae_sync_logs_expediente_id_fkey"; columns: ["expediente_id"]; referencedRelation: "expedientes"; referencedColumns: ["id"] },
          { foreignKeyName: "sae_sync_logs_profile_id_fkey"; columns: ["profile_id"]; referencedRelation: "profiles"; referencedColumns: ["id"] }
        ]
      }
      seguimientos: {
        Row: {
          id: string
          expediente_id: string
          fecha_control: string
          estado_organismo_reportado: string
          canal: string
          observacion: string | null
          proxima_fecha_control: string | null
          requiere_accion: boolean
          accion_requerida: string | null
          created_by: string
          created_at: string
        }
        Insert: {
          id?: string
          expediente_id: string
          fecha_control?: string
          estado_organismo_reportado: string
          canal?: string
          observacion?: string | null
          proxima_fecha_control?: string | null
          requiere_accion?: boolean
          accion_requerida?: string | null
          created_by: string
          created_at?: string
        }
        Update: {
          id?: string
          expediente_id?: string
          fecha_control?: string
          estado_organismo_reportado?: string
          canal?: string
          observacion?: string | null
          proxima_fecha_control?: string | null
          requiere_accion?: boolean
          accion_requerida?: string | null
          created_by?: string
          created_at?: string
        }
        Relationships: [
          { foreignKeyName: "seguimientos_expediente_id_fkey"; columns: ["expediente_id"]; referencedRelation: "expedientes"; referencedColumns: ["id"] },
          { foreignKeyName: "seguimientos_created_by_fkey"; columns: ["created_by"]; referencedRelation: "profiles"; referencedColumns: ["id"] }
        ]
      }
      tareas: {
        Row: {
          id: string
          expediente_id: string | null
          tipo_tarea_id: string | null
          titulo: string
          descripcion: string | null
          asignado_a: string
          fecha_vencimiento: string | null
          prioridad: string
          estado: string
          completada_at: string | null
          completada_por: string | null
          created_by: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          expediente_id?: string | null
          tipo_tarea_id?: string | null
          titulo: string
          descripcion?: string | null
          asignado_a: string
          fecha_vencimiento?: string | null
          prioridad?: string
          estado?: string
          completada_at?: string | null
          completada_por?: string | null
          created_by: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          expediente_id?: string | null
          tipo_tarea_id?: string | null
          titulo?: string
          descripcion?: string | null
          asignado_a?: string
          fecha_vencimiento?: string | null
          prioridad?: string
          estado?: string
          completada_at?: string | null
          completada_por?: string | null
          created_by?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          { foreignKeyName: "tareas_expediente_id_fkey"; columns: ["expediente_id"]; referencedRelation: "expedientes"; referencedColumns: ["id"] },
          { foreignKeyName: "tareas_asignado_a_fkey"; columns: ["asignado_a"]; referencedRelation: "profiles"; referencedColumns: ["id"] },
          { foreignKeyName: "tareas_created_by_fkey"; columns: ["created_by"]; referencedRelation: "profiles"; referencedColumns: ["id"] }
        ]
      }
      tipos_tramite: {
        Row: {
          id: string
          codigo: string
          nombre: string
          descripcion: string | null
          requiere_turno: boolean
          activo: boolean
          orden: number
        }
        Insert: {
          id?: string
          codigo: string
          nombre: string
          descripcion?: string | null
          requiere_turno?: boolean
          activo?: boolean
          orden?: number
        }
        Update: {
          id?: string
          codigo?: string
          nombre?: string
          descripcion?: string | null
          requiere_turno?: boolean
          activo?: boolean
          orden?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      search_clientes: {
        Args: { query: string }
        Returns: {
          id: string
          nombre: string
          apellido: string
          dni: string
          cuil: string | null
          telefono: string | null
          email: string | null
        }[]
      }
      resolver_alerta: {
        Args: { alerta_id: string }
        Returns: void
      }
      soft_delete_cliente: {
        Args: { cliente_id: string }
        Returns: void
      }
      get_dashboard_metrics: {
        Args: Record<string, never>
        Returns: Json
      }
      create_expediente: {
        Args: {
          p_cliente_id: string
          p_tipo_tramite_id: string
          p_organismo_id?: string
          p_fuero?: string
          p_prioridad?: string
          p_es_propio?: boolean
          p_observaciones?: string
          p_miembros?: Json
        }
        Returns: Json
      }
      cambiar_estado_expediente: {
        Args: {
          p_expediente_id: string
          p_nuevo_estado: string
          p_motivo?: string
          p_observacion?: string
        }
        Returns: void
      }
      log_login: {
        Args: Record<string, never>
        Returns: void
      }
    }
    Enums: {
      audiencia_fuente: "manual" | "sae"
      sae_movement_type:
        | "sentencia"
        | "traslado"
        | "audiencia"
        | "prueba"
        | "embargo"
        | "cedula"
        | "oficio"
        | "intimacion"
        | "planilla"
        | "informe"
        | "decreto"
        | "escrito_parte"
        | "otro"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

// Helpers
export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"]
export type TablesInsert<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"]
export type TablesUpdate<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"]
export type Enums<T extends keyof Database["public"]["Enums"]> =
  Database["public"]["Enums"][T]
