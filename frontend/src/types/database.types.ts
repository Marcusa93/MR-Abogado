export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      adjuntos: {
        Row: {
          categoria: string | null
          cliente_id: string | null
          created_at: string
          deleted_at: string | null
          descripcion: string | null
          expediente_id: string | null
          id: string
          nombre_archivo: string
          storage_path: string
          tamano_bytes: number | null
          tipo_mime: string
          uploaded_by: string
        }
        Insert: {
          categoria?: string | null
          cliente_id?: string | null
          created_at?: string
          deleted_at?: string | null
          descripcion?: string | null
          expediente_id?: string | null
          id?: string
          nombre_archivo: string
          storage_path: string
          tamano_bytes?: number | null
          tipo_mime: string
          uploaded_by: string
        }
        Update: {
          categoria?: string | null
          cliente_id?: string | null
          created_at?: string
          deleted_at?: string | null
          descripcion?: string | null
          expediente_id?: string | null
          id?: string
          nombre_archivo?: string
          storage_path?: string
          tamano_bytes?: number | null
          tipo_mime?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "adjuntos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "adjuntos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes_con_contadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "adjuntos_expediente_id_fkey"
            columns: ["expediente_id"]
            isOneToOne: false
            referencedRelation: "expedientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "adjuntos_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      alertas: {
        Row: {
          created_at: string
          destinatario_id: string | null
          estado: string
          expediente_id: string | null
          fecha_vencimiento: string | null
          id: string
          mensaje: string | null
          origen: string
          payload: Json
          pospuesta_hasta: string | null
          prioridad: string
          resuelta_at: string | null
          resuelta_por: string | null
          snoozed_until: string | null
          tipo: string
          titulo: string
        }
        Insert: {
          created_at?: string
          destinatario_id?: string | null
          estado?: string
          expediente_id?: string | null
          fecha_vencimiento?: string | null
          id?: string
          mensaje?: string | null
          origen?: string
          payload?: Json
          pospuesta_hasta?: string | null
          prioridad?: string
          resuelta_at?: string | null
          resuelta_por?: string | null
          snoozed_until?: string | null
          tipo: string
          titulo: string
        }
        Update: {
          created_at?: string
          destinatario_id?: string | null
          estado?: string
          expediente_id?: string | null
          fecha_vencimiento?: string | null
          id?: string
          mensaje?: string | null
          origen?: string
          payload?: Json
          pospuesta_hasta?: string | null
          prioridad?: string
          resuelta_at?: string | null
          resuelta_por?: string | null
          snoozed_until?: string | null
          tipo?: string
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "alertas_destinatario_id_fkey"
            columns: ["destinatario_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alertas_expediente_id_fkey"
            columns: ["expediente_id"]
            isOneToOne: false
            referencedRelation: "expedientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alertas_resuelta_por_fkey"
            columns: ["resuelta_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      aprendizajes_compartidos: {
        Row: {
          aprendizaje_id: string
          granted_at: string
          granted_by: string | null
          profile_id: string
        }
        Insert: {
          aprendizaje_id: string
          granted_at?: string
          granted_by?: string | null
          profile_id: string
        }
        Update: {
          aprendizaje_id?: string
          granted_at?: string
          granted_by?: string | null
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "aprendizajes_compartidos_aprendizaje_id_fkey"
            columns: ["aprendizaje_id"]
            isOneToOne: false
            referencedRelation: "aprendizajes_rulebook"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aprendizajes_compartidos_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aprendizajes_compartidos_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      aprendizajes_rulebook: {
        Row: {
          confidence: string
          contenido: string
          contenido_estructurado: Json | null
          created_at: string
          created_by: string | null
          etapa_proceso_id: string | null
          id: string
          is_active: boolean
          observed_in_cases: number
          owner_id: string | null
          scope: string
          target_kind: string
          target_organismo_id: string | null
          target_ref_text: string | null
          tipo_proceso_id: string | null
          updated_at: string
        }
        Insert: {
          confidence?: string
          contenido: string
          contenido_estructurado?: Json | null
          created_at?: string
          created_by?: string | null
          etapa_proceso_id?: string | null
          id?: string
          is_active?: boolean
          observed_in_cases?: number
          owner_id?: string | null
          scope?: string
          target_kind: string
          target_organismo_id?: string | null
          target_ref_text?: string | null
          tipo_proceso_id?: string | null
          updated_at?: string
        }
        Update: {
          confidence?: string
          contenido?: string
          contenido_estructurado?: Json | null
          created_at?: string
          created_by?: string | null
          etapa_proceso_id?: string | null
          id?: string
          is_active?: boolean
          observed_in_cases?: number
          owner_id?: string | null
          scope?: string
          target_kind?: string
          target_organismo_id?: string | null
          target_ref_text?: string | null
          tipo_proceso_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "aprendizajes_rulebook_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aprendizajes_rulebook_etapa_proceso_id_fkey"
            columns: ["etapa_proceso_id"]
            isOneToOne: false
            referencedRelation: "etapas_proceso"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aprendizajes_rulebook_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aprendizajes_rulebook_target_organismo_id_fkey"
            columns: ["target_organismo_id"]
            isOneToOne: false
            referencedRelation: "organismos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aprendizajes_rulebook_tipo_proceso_id_fkey"
            columns: ["tipo_proceso_id"]
            isOneToOne: false
            referencedRelation: "tipos_proceso_judicial"
            referencedColumns: ["id"]
          },
        ]
      }
      audiencia_transcripts: {
        Row: {
          ai_analysis: Json | null
          ai_analysis_model: string | null
          ai_analyzed_at: string | null
          audiencia_id: string | null
          audio_duration_seconds: number | null
          audio_filename: string | null
          audio_source: string
          audio_storage_path: string | null
          created_at: string
          created_by: string
          error_message: string | null
          expediente_id: string
          id: string
          movement_id: string | null
          status: string
          transcript: string | null
          transcript_at: string | null
          transcript_model: string | null
          updated_at: string
        }
        Insert: {
          ai_analysis?: Json | null
          ai_analysis_model?: string | null
          ai_analyzed_at?: string | null
          audiencia_id?: string | null
          audio_duration_seconds?: number | null
          audio_filename?: string | null
          audio_source: string
          audio_storage_path?: string | null
          created_at?: string
          created_by: string
          error_message?: string | null
          expediente_id: string
          id?: string
          movement_id?: string | null
          status?: string
          transcript?: string | null
          transcript_at?: string | null
          transcript_model?: string | null
          updated_at?: string
        }
        Update: {
          ai_analysis?: Json | null
          ai_analysis_model?: string | null
          ai_analyzed_at?: string | null
          audiencia_id?: string | null
          audio_duration_seconds?: number | null
          audio_filename?: string | null
          audio_source?: string
          audio_storage_path?: string | null
          created_at?: string
          created_by?: string
          error_message?: string | null
          expediente_id?: string
          id?: string
          movement_id?: string | null
          status?: string
          transcript?: string | null
          transcript_at?: string | null
          transcript_model?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "audiencia_transcripts_audiencia_id_fkey"
            columns: ["audiencia_id"]
            isOneToOne: false
            referencedRelation: "audiencias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audiencia_transcripts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audiencia_transcripts_expediente_id_fkey"
            columns: ["expediente_id"]
            isOneToOne: false
            referencedRelation: "expedientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audiencia_transcripts_movement_id_fkey"
            columns: ["movement_id"]
            isOneToOne: false
            referencedRelation: "sae_movements"
            referencedColumns: ["id"]
          },
        ]
      }
      audiencias: {
        Row: {
          created_at: string
          created_by: string
          estado: string
          expediente_id: string
          fecha: string
          fuente: Database["public"]["Enums"]["audiencia_fuente"]
          hora: string | null
          id: string
          last_reminder_at: string | null
          notas: string | null
          organismo_id: string | null
          profesional_asistente_id: string | null
          resultado: string | null
          sae_movement_id: string | null
          tipo_audiencia_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          estado?: string
          expediente_id: string
          fecha: string
          fuente?: Database["public"]["Enums"]["audiencia_fuente"]
          hora?: string | null
          id?: string
          last_reminder_at?: string | null
          notas?: string | null
          organismo_id?: string | null
          profesional_asistente_id?: string | null
          resultado?: string | null
          sae_movement_id?: string | null
          tipo_audiencia_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          estado?: string
          expediente_id?: string
          fecha?: string
          fuente?: Database["public"]["Enums"]["audiencia_fuente"]
          hora?: string | null
          id?: string
          last_reminder_at?: string | null
          notas?: string | null
          organismo_id?: string | null
          profesional_asistente_id?: string | null
          resultado?: string | null
          sae_movement_id?: string | null
          tipo_audiencia_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "audiencias_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audiencias_expediente_id_fkey"
            columns: ["expediente_id"]
            isOneToOne: false
            referencedRelation: "expedientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audiencias_organismo_id_fkey"
            columns: ["organismo_id"]
            isOneToOne: false
            referencedRelation: "organismos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audiencias_profesional_asistente_id_fkey"
            columns: ["profesional_asistente_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audiencias_sae_movement_id_fkey"
            columns: ["sae_movement_id"]
            isOneToOne: false
            referencedRelation: "sae_movements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audiencias_tipo_audiencia_id_fkey"
            columns: ["tipo_audiencia_id"]
            isOneToOne: false
            referencedRelation: "catalogo_tipos_audiencia"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          accion: string
          created_at: string
          datos_anteriores: Json | null
          datos_nuevos: Json | null
          id: number
          ip_address: string | null
          registro_id: string
          tabla: string
          user_id: string | null
        }
        Insert: {
          accion: string
          created_at?: string
          datos_anteriores?: Json | null
          datos_nuevos?: Json | null
          id?: never
          ip_address?: string | null
          registro_id: string
          tabla: string
          user_id?: string | null
        }
        Update: {
          accion?: string
          created_at?: string
          datos_anteriores?: Json | null
          datos_nuevos?: Json | null
          id?: never
          ip_address?: string | null
          registro_id?: string
          tabla?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      catalogo_tipos_audiencia: {
        Row: {
          activo: boolean
          codigo: string
          descripcion: string | null
          id: string
          nombre: string
          orden: number
        }
        Insert: {
          activo?: boolean
          codigo: string
          descripcion?: string | null
          id?: string
          nombre: string
          orden?: number
        }
        Update: {
          activo?: boolean
          codigo?: string
          descripcion?: string | null
          id?: string
          nombre?: string
          orden?: number
        }
        Relationships: []
      }
      catalogo_tipos_tarea: {
        Row: {
          activo: boolean
          descripcion: string | null
          id: string
          nombre: string
        }
        Insert: {
          activo?: boolean
          descripcion?: string | null
          id?: string
          nombre: string
        }
        Update: {
          activo?: boolean
          descripcion?: string | null
          id?: string
          nombre?: string
        }
        Relationships: []
      }
      clientes: {
        Row: {
          apellido: string
          created_at: string
          created_by: string
          cuil: string | null
          deleted_at: string | null
          dni: string
          domicilio: string | null
          email: string | null
          fecha_nacimiento: string | null
          id: string
          localidad: string | null
          nombre: string
          notas: string | null
          origen: string | null
          provincia: string | null
          sexo: string | null
          telefono: string | null
          telefono_alt: string | null
          updated_at: string
        }
        Insert: {
          apellido: string
          created_at?: string
          created_by: string
          cuil?: string | null
          deleted_at?: string | null
          dni: string
          domicilio?: string | null
          email?: string | null
          fecha_nacimiento?: string | null
          id?: string
          localidad?: string | null
          nombre: string
          notas?: string | null
          origen?: string | null
          provincia?: string | null
          sexo?: string | null
          telefono?: string | null
          telefono_alt?: string | null
          updated_at?: string
        }
        Update: {
          apellido?: string
          created_at?: string
          created_by?: string
          cuil?: string | null
          deleted_at?: string | null
          dni?: string
          domicilio?: string | null
          email?: string | null
          fecha_nacimiento?: string | null
          id?: string
          localidad?: string | null
          nombre?: string
          notas?: string | null
          origen?: string | null
          provincia?: string | null
          sexo?: string | null
          telefono?: string | null
          telefono_alt?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clientes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      escrito_citas: {
        Row: {
          chunk_id: number | null
          cita_texto: string | null
          created_at: string
          documento_id: string | null
          escrito_id: string
          id: number
          metadata: Json
          orden: number
          score: number | null
          was_pinned: boolean
        }
        Insert: {
          chunk_id?: number | null
          cita_texto?: string | null
          created_at?: string
          documento_id?: string | null
          escrito_id: string
          id?: number
          metadata?: Json
          orden: number
          score?: number | null
          was_pinned?: boolean
        }
        Update: {
          chunk_id?: number | null
          cita_texto?: string | null
          created_at?: string
          documento_id?: string | null
          escrito_id?: string
          id?: number
          metadata?: Json
          orden?: number
          score?: number | null
          was_pinned?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "escrito_citas_chunk_id_fkey"
            columns: ["chunk_id"]
            isOneToOne: false
            referencedRelation: "normativa_chunks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escrito_citas_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "normativa_documentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escrito_citas_escrito_id_fkey"
            columns: ["escrito_id"]
            isOneToOne: false
            referencedRelation: "escritos"
            referencedColumns: ["id"]
          },
        ]
      }
      escrito_templates: {
        Row: {
          analysis: Json | null
          analysis_model: string | null
          analyzed_at: string | null
          created_at: string
          descripcion: string | null
          id: string
          is_active: boolean
          nombre: string
          source_file_name: string | null
          source_file_path: string | null
          source_text: string | null
          tipo: string
          updated_at: string
          user_id: string
        }
        Insert: {
          analysis?: Json | null
          analysis_model?: string | null
          analyzed_at?: string | null
          created_at?: string
          descripcion?: string | null
          id?: string
          is_active?: boolean
          nombre: string
          source_file_name?: string | null
          source_file_path?: string | null
          source_text?: string | null
          tipo: string
          updated_at?: string
          user_id: string
        }
        Update: {
          analysis?: Json | null
          analysis_model?: string | null
          analyzed_at?: string | null
          created_at?: string
          descripcion?: string | null
          id?: string
          is_active?: boolean
          nombre?: string
          source_file_name?: string | null
          source_file_path?: string | null
          source_text?: string | null
          tipo?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "escrito_templates_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      escritos: {
        Row: {
          contenido: Json
          contexto_movement_ids: string[] | null
          created_at: string
          estado: string
          expediente_id: string
          firmante_cn: string | null
          id: string
          instrucciones_usuario: string | null
          modelo_ia: string | null
          pdf_firmado_at: string | null
          pdf_firmado_path: string | null
          presentacion_sae: Json | null
          presentado_sae_at: string | null
          registro_tonal: string | null
          template_id: string | null
          tipo: string
          titulo: string
          updated_at: string
          user_id: string
        }
        Insert: {
          contenido: Json
          contexto_movement_ids?: string[] | null
          created_at?: string
          estado?: string
          expediente_id: string
          firmante_cn?: string | null
          id?: string
          instrucciones_usuario?: string | null
          modelo_ia?: string | null
          pdf_firmado_at?: string | null
          pdf_firmado_path?: string | null
          presentacion_sae?: Json | null
          presentado_sae_at?: string | null
          registro_tonal?: string | null
          template_id?: string | null
          tipo: string
          titulo: string
          updated_at?: string
          user_id: string
        }
        Update: {
          contenido?: Json
          contexto_movement_ids?: string[] | null
          created_at?: string
          estado?: string
          expediente_id?: string
          firmante_cn?: string | null
          id?: string
          instrucciones_usuario?: string | null
          modelo_ia?: string | null
          pdf_firmado_at?: string | null
          pdf_firmado_path?: string | null
          presentacion_sae?: Json | null
          presentado_sae_at?: string | null
          registro_tonal?: string | null
          template_id?: string | null
          tipo?: string
          titulo?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "escritos_expediente_id_fkey"
            columns: ["expediente_id"]
            isOneToOne: false
            referencedRelation: "expedientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escritos_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "escrito_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escritos_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      etapas_proceso: {
        Row: {
          codigo: string
          created_at: string
          decisiones_posibles: Json
          descripcion: string | null
          es_terminal: boolean
          escritos_tipicos: Json
          id: string
          nombre: string
          orden: number
          plazo_dias: number | null
          plazo_es_perentorio: boolean
          tipo_proceso_id: string
        }
        Insert: {
          codigo: string
          created_at?: string
          decisiones_posibles?: Json
          descripcion?: string | null
          es_terminal?: boolean
          escritos_tipicos?: Json
          id?: string
          nombre: string
          orden: number
          plazo_dias?: number | null
          plazo_es_perentorio?: boolean
          tipo_proceso_id: string
        }
        Update: {
          codigo?: string
          created_at?: string
          decisiones_posibles?: Json
          descripcion?: string | null
          es_terminal?: boolean
          escritos_tipicos?: Json
          id?: string
          nombre?: string
          orden?: number
          plazo_dias?: number | null
          plazo_es_perentorio?: boolean
          tipo_proceso_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "etapas_proceso_tipo_proceso_id_fkey"
            columns: ["tipo_proceso_id"]
            isOneToOne: false
            referencedRelation: "tipos_proceso_judicial"
            referencedColumns: ["id"]
          },
        ]
      }
      expediente_brief_contradicciones: {
        Row: {
          created_at: string
          descripcion: string
          detectada_por: string
          entry_a_id: string
          entry_b_id: string | null
          estado: string
          expediente_id: string
          external_ref: Json | null
          id: string
          resolucion: string | null
          resuelta_at: string | null
          resuelta_por: string | null
        }
        Insert: {
          created_at?: string
          descripcion: string
          detectada_por: string
          entry_a_id: string
          entry_b_id?: string | null
          estado?: string
          expediente_id: string
          external_ref?: Json | null
          id?: string
          resolucion?: string | null
          resuelta_at?: string | null
          resuelta_por?: string | null
        }
        Update: {
          created_at?: string
          descripcion?: string
          detectada_por?: string
          entry_a_id?: string
          entry_b_id?: string | null
          estado?: string
          expediente_id?: string
          external_ref?: Json | null
          id?: string
          resolucion?: string | null
          resuelta_at?: string | null
          resuelta_por?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expediente_brief_contradicciones_entry_a_id_fkey"
            columns: ["entry_a_id"]
            isOneToOne: false
            referencedRelation: "expediente_brief_actual"
            referencedColumns: ["entry_id"]
          },
          {
            foreignKeyName: "expediente_brief_contradicciones_entry_a_id_fkey"
            columns: ["entry_a_id"]
            isOneToOne: false
            referencedRelation: "expediente_brief_actual"
            referencedColumns: ["expediente_id"]
          },
          {
            foreignKeyName: "expediente_brief_contradicciones_entry_a_id_fkey"
            columns: ["entry_a_id"]
            isOneToOne: false
            referencedRelation: "expediente_brief_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expediente_brief_contradicciones_entry_b_id_fkey"
            columns: ["entry_b_id"]
            isOneToOne: false
            referencedRelation: "expediente_brief_actual"
            referencedColumns: ["entry_id"]
          },
          {
            foreignKeyName: "expediente_brief_contradicciones_entry_b_id_fkey"
            columns: ["entry_b_id"]
            isOneToOne: false
            referencedRelation: "expediente_brief_actual"
            referencedColumns: ["expediente_id"]
          },
          {
            foreignKeyName: "expediente_brief_contradicciones_entry_b_id_fkey"
            columns: ["entry_b_id"]
            isOneToOne: false
            referencedRelation: "expediente_brief_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expediente_brief_contradicciones_expediente_id_fkey"
            columns: ["expediente_id"]
            isOneToOne: false
            referencedRelation: "expedientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expediente_brief_contradicciones_resuelta_por_fkey"
            columns: ["resuelta_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      expediente_brief_entries: {
        Row: {
          chain_id: string
          confidence: string
          contenido: string
          contenido_estructurado: Json | null
          created_at: string
          created_by: string | null
          evidence_refs: Json
          expediente_id: string
          id: string
          is_active: boolean
          seccion: string
          source: string
          superseded_by: string | null
          tipo: string
          version: number
        }
        Insert: {
          chain_id: string
          confidence?: string
          contenido: string
          contenido_estructurado?: Json | null
          created_at?: string
          created_by?: string | null
          evidence_refs?: Json
          expediente_id: string
          id?: string
          is_active?: boolean
          seccion: string
          source: string
          superseded_by?: string | null
          tipo: string
          version?: number
        }
        Update: {
          chain_id?: string
          confidence?: string
          contenido?: string
          contenido_estructurado?: Json | null
          created_at?: string
          created_by?: string | null
          evidence_refs?: Json
          expediente_id?: string
          id?: string
          is_active?: boolean
          seccion?: string
          source?: string
          superseded_by?: string | null
          tipo?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "expediente_brief_entries_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expediente_brief_entries_expediente_id_fkey"
            columns: ["expediente_id"]
            isOneToOne: false
            referencedRelation: "expedientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expediente_brief_entries_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "expediente_brief_actual"
            referencedColumns: ["entry_id"]
          },
          {
            foreignKeyName: "expediente_brief_entries_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "expediente_brief_actual"
            referencedColumns: ["expediente_id"]
          },
          {
            foreignKeyName: "expediente_brief_entries_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "expediente_brief_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      expediente_brief_preguntas: {
        Row: {
          answered_at: string | null
          answered_by: string | null
          contexto: Json
          created_at: string
          created_by: string | null
          estado: string
          expediente_id: string
          id: string
          origen: string
          pregunta: string
          prioridad: string
          respuesta_entry_id: string | null
        }
        Insert: {
          answered_at?: string | null
          answered_by?: string | null
          contexto?: Json
          created_at?: string
          created_by?: string | null
          estado?: string
          expediente_id: string
          id?: string
          origen: string
          pregunta: string
          prioridad?: string
          respuesta_entry_id?: string | null
        }
        Update: {
          answered_at?: string | null
          answered_by?: string | null
          contexto?: Json
          created_at?: string
          created_by?: string | null
          estado?: string
          expediente_id?: string
          id?: string
          origen?: string
          pregunta?: string
          prioridad?: string
          respuesta_entry_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expediente_brief_preguntas_answered_by_fkey"
            columns: ["answered_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expediente_brief_preguntas_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expediente_brief_preguntas_expediente_id_fkey"
            columns: ["expediente_id"]
            isOneToOne: false
            referencedRelation: "expedientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expediente_brief_preguntas_respuesta_entry_id_fkey"
            columns: ["respuesta_entry_id"]
            isOneToOne: false
            referencedRelation: "expediente_brief_actual"
            referencedColumns: ["entry_id"]
          },
          {
            foreignKeyName: "expediente_brief_preguntas_respuesta_entry_id_fkey"
            columns: ["respuesta_entry_id"]
            isOneToOne: false
            referencedRelation: "expediente_brief_actual"
            referencedColumns: ["expediente_id"]
          },
          {
            foreignKeyName: "expediente_brief_preguntas_respuesta_entry_id_fkey"
            columns: ["respuesta_entry_id"]
            isOneToOne: false
            referencedRelation: "expediente_brief_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      expediente_contactos: {
        Row: {
          cliente_id: string
          created_at: string
          email: string | null
          id: string
          nombre: string
          notas: string | null
          relacion: string | null
          telefono: string | null
        }
        Insert: {
          cliente_id: string
          created_at?: string
          email?: string | null
          id?: string
          nombre: string
          notas?: string | null
          relacion?: string | null
          telefono?: string | null
        }
        Update: {
          cliente_id?: string
          created_at?: string
          email?: string | null
          id?: string
          nombre?: string
          notas?: string | null
          relacion?: string | null
          telefono?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expediente_contactos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expediente_contactos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes_con_contadores"
            referencedColumns: ["id"]
          },
        ]
      }
      expediente_document_checklist: {
        Row: {
          adjunto_id: string | null
          created_at: string
          documento: string
          expediente_id: string
          fecha_recibido: string | null
          id: string
          notas: string | null
          recibido: boolean
          requerido: boolean
          updated_at: string
        }
        Insert: {
          adjunto_id?: string | null
          created_at?: string
          documento: string
          expediente_id: string
          fecha_recibido?: string | null
          id?: string
          notas?: string | null
          recibido?: boolean
          requerido?: boolean
          updated_at?: string
        }
        Update: {
          adjunto_id?: string | null
          created_at?: string
          documento?: string
          expediente_id?: string
          fecha_recibido?: string | null
          id?: string
          notas?: string | null
          recibido?: boolean
          requerido?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expediente_document_checklist_adjunto_id_fkey"
            columns: ["adjunto_id"]
            isOneToOne: false
            referencedRelation: "adjuntos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expediente_document_checklist_expediente_id_fkey"
            columns: ["expediente_id"]
            isOneToOne: false
            referencedRelation: "expedientes"
            referencedColumns: ["id"]
          },
        ]
      }
      expediente_jurisprudencia: {
        Row: {
          created_at: string
          documento_id: string
          expediente_id: string
          fijado_por: string
          nota: string | null
        }
        Insert: {
          created_at?: string
          documento_id: string
          expediente_id: string
          fijado_por: string
          nota?: string | null
        }
        Update: {
          created_at?: string
          documento_id?: string
          expediente_id?: string
          fijado_por?: string
          nota?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expediente_jurisprudencia_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "jurisprudencia_documentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expediente_jurisprudencia_expediente_id_fkey"
            columns: ["expediente_id"]
            isOneToOne: false
            referencedRelation: "expedientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expediente_jurisprudencia_fijado_por_fkey"
            columns: ["fijado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      expediente_miembros: {
        Row: {
          activo: boolean
          created_at: string
          expediente_id: string
          id: string
          profile_id: string
          rol: string
        }
        Insert: {
          activo?: boolean
          created_at?: string
          expediente_id: string
          id?: string
          profile_id: string
          rol?: string
        }
        Update: {
          activo?: boolean
          created_at?: string
          expediente_id?: string
          id?: string
          profile_id?: string
          rol?: string
        }
        Relationships: [
          {
            foreignKeyName: "expediente_miembros_expediente_id_fkey"
            columns: ["expediente_id"]
            isOneToOne: false
            referencedRelation: "expedientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expediente_miembros_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      expediente_normativa: {
        Row: {
          created_at: string
          documento_id: string
          expediente_id: string
          fijado_por: string
          nota: string | null
        }
        Insert: {
          created_at?: string
          documento_id: string
          expediente_id: string
          fijado_por: string
          nota?: string | null
        }
        Update: {
          created_at?: string
          documento_id?: string
          expediente_id?: string
          fijado_por?: string
          nota?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expediente_normativa_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "normativa_documentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expediente_normativa_expediente_id_fkey"
            columns: ["expediente_id"]
            isOneToOne: false
            referencedRelation: "expedientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expediente_normativa_fijado_por_fkey"
            columns: ["fijado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      expediente_notas: {
        Row: {
          contenido: string
          created_at: string
          created_by: string
          eliminada: boolean
          eliminada_at: string | null
          es_privada: boolean
          expediente_id: string
          id: string
        }
        Insert: {
          contenido: string
          created_at?: string
          created_by: string
          eliminada?: boolean
          eliminada_at?: string | null
          es_privada?: boolean
          expediente_id: string
          id?: string
        }
        Update: {
          contenido?: string
          created_at?: string
          created_by?: string
          eliminada?: boolean
          eliminada_at?: string | null
          es_privada?: boolean
          expediente_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "expediente_notas_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expediente_notas_expediente_id_fkey"
            columns: ["expediente_id"]
            isOneToOne: false
            referencedRelation: "expedientes"
            referencedColumns: ["id"]
          },
        ]
      }
      expediente_tags: {
        Row: {
          created_at: string
          created_by: string
          expediente_id: string
          id: string
          tag: string
        }
        Insert: {
          created_at?: string
          created_by: string
          expediente_id: string
          id?: string
          tag: string
        }
        Update: {
          created_at?: string
          created_by?: string
          expediente_id?: string
          id?: string
          tag?: string
        }
        Relationships: [
          {
            foreignKeyName: "expediente_tags_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expediente_tags_expediente_id_fkey"
            columns: ["expediente_id"]
            isOneToOne: false
            referencedRelation: "expedientes"
            referencedColumns: ["id"]
          },
        ]
      }
      expedientes: {
        Row: {
          abogado_responsable_id: string | null
          ai_brief: string | null
          ai_brief_generated_at: string | null
          ai_brief_model: string | null
          analisis_viabilidad: string | null
          caratula: string | null
          cliente_id: string | null
          created_at: string
          created_by: string
          deleted_at: string | null
          es_propio: boolean
          estado_interno: string
          estado_organismo: string | null
          estado_previo_pausa: string | null
          estado_sae: string | null
          etapa_actual_desde: string | null
          etapa_actual_id: string | null
          fecha_alta: string
          fecha_cierre: string | null
          fecha_inicio_proceso: string | null
          fecha_resolucion: string | null
          fuero: string | null
          id: string
          numero: string
          numero_sae: string | null
          observaciones: string | null
          organismo_id: string | null
          prioridad: string
          tipo_proceso_id: string | null
          tipo_tramite_id: string
          ultima_sincronizacion_sae: string | null
          updated_at: string
          viable: boolean | null
        }
        Insert: {
          abogado_responsable_id?: string | null
          ai_brief?: string | null
          ai_brief_generated_at?: string | null
          ai_brief_model?: string | null
          analisis_viabilidad?: string | null
          caratula?: string | null
          cliente_id?: string | null
          created_at?: string
          created_by: string
          deleted_at?: string | null
          es_propio?: boolean
          estado_interno?: string
          estado_organismo?: string | null
          estado_previo_pausa?: string | null
          estado_sae?: string | null
          etapa_actual_desde?: string | null
          etapa_actual_id?: string | null
          fecha_alta?: string
          fecha_cierre?: string | null
          fecha_inicio_proceso?: string | null
          fecha_resolucion?: string | null
          fuero?: string | null
          id?: string
          numero: string
          numero_sae?: string | null
          observaciones?: string | null
          organismo_id?: string | null
          prioridad?: string
          tipo_proceso_id?: string | null
          tipo_tramite_id: string
          ultima_sincronizacion_sae?: string | null
          updated_at?: string
          viable?: boolean | null
        }
        Update: {
          abogado_responsable_id?: string | null
          ai_brief?: string | null
          ai_brief_generated_at?: string | null
          ai_brief_model?: string | null
          analisis_viabilidad?: string | null
          caratula?: string | null
          cliente_id?: string | null
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          es_propio?: boolean
          estado_interno?: string
          estado_organismo?: string | null
          estado_previo_pausa?: string | null
          estado_sae?: string | null
          etapa_actual_desde?: string | null
          etapa_actual_id?: string | null
          fecha_alta?: string
          fecha_cierre?: string | null
          fecha_inicio_proceso?: string | null
          fecha_resolucion?: string | null
          fuero?: string | null
          id?: string
          numero?: string
          numero_sae?: string | null
          observaciones?: string | null
          organismo_id?: string | null
          prioridad?: string
          tipo_proceso_id?: string | null
          tipo_tramite_id?: string
          ultima_sincronizacion_sae?: string | null
          updated_at?: string
          viable?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "expedientes_abogado_responsable_id_fkey"
            columns: ["abogado_responsable_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expedientes_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expedientes_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes_con_contadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expedientes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expedientes_etapa_actual_id_fkey"
            columns: ["etapa_actual_id"]
            isOneToOne: false
            referencedRelation: "etapas_proceso"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expedientes_organismo_id_fkey"
            columns: ["organismo_id"]
            isOneToOne: false
            referencedRelation: "organismos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expedientes_tipo_proceso_id_fkey"
            columns: ["tipo_proceso_id"]
            isOneToOne: false
            referencedRelation: "tipos_proceso_judicial"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expedientes_tipo_tramite_id_fkey"
            columns: ["tipo_tramite_id"]
            isOneToOne: false
            referencedRelation: "tipos_tramite"
            referencedColumns: ["id"]
          },
        ]
      }
      historial_estados_expediente: {
        Row: {
          changed_by: string
          created_at: string
          estado_anterior: string | null
          estado_nuevo: string
          expediente_id: string
          id: string
          motivo: string
          observacion: string | null
        }
        Insert: {
          changed_by: string
          created_at?: string
          estado_anterior?: string | null
          estado_nuevo: string
          expediente_id: string
          id?: string
          motivo: string
          observacion?: string | null
        }
        Update: {
          changed_by?: string
          created_at?: string
          estado_anterior?: string | null
          estado_nuevo?: string
          expediente_id?: string
          id?: string
          motivo?: string
          observacion?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "historial_estados_expediente_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historial_estados_expediente_expediente_id_fkey"
            columns: ["expediente_id"]
            isOneToOne: false
            referencedRelation: "expedientes"
            referencedColumns: ["id"]
          },
        ]
      }
      jurisprudencia_chunks: {
        Row: {
          chunk_uid: string
          contenido: string
          created_at: string
          documento_id: string
          embedding: string
          id: number
          metadata: Json
          orden: number
          user_id: string
        }
        Insert: {
          chunk_uid: string
          contenido: string
          created_at?: string
          documento_id: string
          embedding: string
          id?: number
          metadata?: Json
          orden: number
          user_id: string
        }
        Update: {
          chunk_uid?: string
          contenido?: string
          created_at?: string
          documento_id?: string
          embedding?: string
          id?: number
          metadata?: Json
          orden?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "jurisprudencia_chunks_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "jurisprudencia_documentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jurisprudencia_chunks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      jurisprudencia_documentos: {
        Row: {
          caratula: string
          checksum: string | null
          chunk_count: number
          created_at: string
          error_message: string | null
          estado: string
          fecha: string | null
          id: string
          jurisdiccion: string | null
          metadata: Json
          numero: string | null
          source: string
          source_doc_id: string | null
          source_file_name: string | null
          source_file_path: string | null
          source_mime_type: string | null
          source_url: string | null
          sumario: string | null
          tipo: string
          tribunal: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          caratula: string
          checksum?: string | null
          chunk_count?: number
          created_at?: string
          error_message?: string | null
          estado?: string
          fecha?: string | null
          id?: string
          jurisdiccion?: string | null
          metadata?: Json
          numero?: string | null
          source?: string
          source_doc_id?: string | null
          source_file_name?: string | null
          source_file_path?: string | null
          source_mime_type?: string | null
          source_url?: string | null
          sumario?: string | null
          tipo?: string
          tribunal?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          caratula?: string
          checksum?: string | null
          chunk_count?: number
          created_at?: string
          error_message?: string | null
          estado?: string
          fecha?: string | null
          id?: string
          jurisdiccion?: string | null
          metadata?: Json
          numero?: string | null
          source?: string
          source_doc_id?: string | null
          source_file_name?: string | null
          source_file_path?: string | null
          source_mime_type?: string | null
          source_url?: string | null
          sumario?: string | null
          tipo?: string
          tribunal?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "jurisprudencia_documentos_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      legal_cache: {
        Row: {
          cache_key: string
          expires_at: string
          fetched_at: string
          hit_count: number
          payload: Json
          source: string
          tool: string
        }
        Insert: {
          cache_key: string
          expires_at: string
          fetched_at?: string
          hit_count?: number
          payload: Json
          source: string
          tool: string
        }
        Update: {
          cache_key?: string
          expires_at?: string
          fetched_at?: string
          hit_count?: number
          payload?: Json
          source?: string
          tool?: string
        }
        Relationships: []
      }
      legal_lookup_logs: {
        Row: {
          args: Json
          created_at: string
          error_msg: string | null
          http_status: number | null
          id: string
          latency_ms: number | null
          result_count: number | null
          source: string
          status: string
          tool: string
          user_id: string | null
        }
        Insert: {
          args?: Json
          created_at?: string
          error_msg?: string | null
          http_status?: number | null
          id?: string
          latency_ms?: number | null
          result_count?: number | null
          source: string
          status: string
          tool: string
          user_id?: string | null
        }
        Update: {
          args?: Json
          created_at?: string
          error_msg?: string | null
          http_status?: number | null
          id?: string
          latency_ms?: number | null
          result_count?: number | null
          source?: string
          status?: string
          tool?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "legal_lookup_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      normativa_chunks: {
        Row: {
          chunk_uid: string
          contenido: string
          created_at: string
          documento_id: string
          embedding: string
          id: number
          metadata: Json
          orden: number
          user_id: string
        }
        Insert: {
          chunk_uid: string
          contenido: string
          created_at?: string
          documento_id: string
          embedding: string
          id?: number
          metadata?: Json
          orden: number
          user_id: string
        }
        Update: {
          chunk_uid?: string
          contenido?: string
          created_at?: string
          documento_id?: string
          embedding?: string
          id?: number
          metadata?: Json
          orden?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "normativa_chunks_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "normativa_documentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "normativa_chunks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      normativa_documentos: {
        Row: {
          checksum: string | null
          chunk_count: number
          created_at: string
          error_message: string | null
          estado: string
          fecha: string | null
          fuente: string | null
          id: string
          jurisdiccion: string | null
          metadata: Json
          numero: string | null
          source: string
          source_doc_id: string | null
          source_file_name: string | null
          source_file_path: string | null
          source_mime_type: string | null
          source_url: string | null
          tipo: string
          titulo: string
          updated_at: string
          user_id: string
        }
        Insert: {
          checksum?: string | null
          chunk_count?: number
          created_at?: string
          error_message?: string | null
          estado?: string
          fecha?: string | null
          fuente?: string | null
          id?: string
          jurisdiccion?: string | null
          metadata?: Json
          numero?: string | null
          source?: string
          source_doc_id?: string | null
          source_file_name?: string | null
          source_file_path?: string | null
          source_mime_type?: string | null
          source_url?: string | null
          tipo: string
          titulo: string
          updated_at?: string
          user_id: string
        }
        Update: {
          checksum?: string | null
          chunk_count?: number
          created_at?: string
          error_message?: string | null
          estado?: string
          fecha?: string | null
          fuente?: string | null
          id?: string
          jurisdiccion?: string | null
          metadata?: Json
          numero?: string | null
          source?: string
          source_doc_id?: string | null
          source_file_name?: string | null
          source_file_path?: string | null
          source_mime_type?: string | null
          source_url?: string | null
          tipo?: string
          titulo?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "normativa_documentos_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notif_dispatches: {
        Row: {
          alerta_id: string | null
          attempted_at: string
          channel: string
          id: string
          metadata: Json
          reason: string | null
          sae_notif_id: string | null
          status: string
          usuario_id: string
        }
        Insert: {
          alerta_id?: string | null
          attempted_at?: string
          channel: string
          id?: string
          metadata?: Json
          reason?: string | null
          sae_notif_id?: string | null
          status: string
          usuario_id: string
        }
        Update: {
          alerta_id?: string | null
          attempted_at?: string
          channel?: string
          id?: string
          metadata?: Json
          reason?: string | null
          sae_notif_id?: string | null
          status?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notif_dispatches_alerta_id_fkey"
            columns: ["alerta_id"]
            isOneToOne: false
            referencedRelation: "alertas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notif_dispatches_sae_notif_id_fkey"
            columns: ["sae_notif_id"]
            isOneToOne: false
            referencedRelation: "sae_notificaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notif_dispatches_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organismos: {
        Row: {
          activo: boolean
          domicilio: string | null
          id: string
          jurisdiccion: string | null
          localidad: string | null
          nombre: string
          provincia: string | null
          telefono: string | null
          tipo: string
        }
        Insert: {
          activo?: boolean
          domicilio?: string | null
          id?: string
          jurisdiccion?: string | null
          localidad?: string | null
          nombre: string
          provincia?: string | null
          telefono?: string | null
          tipo?: string
        }
        Update: {
          activo?: boolean
          domicilio?: string | null
          id?: string
          jurisdiccion?: string | null
          localidad?: string | null
          nombre?: string
          provincia?: string | null
          telefono?: string | null
          tipo?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          activo: boolean
          apellido: string
          avatar_url: string | null
          casillero_notif: string | null
          created_at: string
          cuit: string | null
          domicilio_legal: string | null
          email: string
          id: string
          matricula: string | null
          matricula_folio: string | null
          matricula_libro: string | null
          must_change_password: boolean
          nombre: string
          nombre_completo: string
          notif_prefs: Json
          notifications_last_seen_at: string
          rol: string
          sae_fueros_seleccionados: string[]
          sae_notif_email: boolean
          sae_notif_email_addresses: string[]
          sae_notif_enabled: boolean
          sae_notif_push: boolean
          sae_notif_push_quiet: boolean
          sae_notif_weekend: boolean
          telefono: string | null
          updated_at: string
        }
        Insert: {
          activo?: boolean
          apellido?: string
          avatar_url?: string | null
          casillero_notif?: string | null
          created_at?: string
          cuit?: string | null
          domicilio_legal?: string | null
          email: string
          id: string
          matricula?: string | null
          matricula_folio?: string | null
          matricula_libro?: string | null
          must_change_password?: boolean
          nombre?: string
          nombre_completo: string
          notif_prefs?: Json
          notifications_last_seen_at?: string
          rol?: string
          sae_fueros_seleccionados?: string[]
          sae_notif_email?: boolean
          sae_notif_email_addresses?: string[]
          sae_notif_enabled?: boolean
          sae_notif_push?: boolean
          sae_notif_push_quiet?: boolean
          sae_notif_weekend?: boolean
          telefono?: string | null
          updated_at?: string
        }
        Update: {
          activo?: boolean
          apellido?: string
          avatar_url?: string | null
          casillero_notif?: string | null
          created_at?: string
          cuit?: string | null
          domicilio_legal?: string | null
          email?: string
          id?: string
          matricula?: string | null
          matricula_folio?: string | null
          matricula_libro?: string | null
          must_change_password?: boolean
          nombre?: string
          nombre_completo?: string
          notif_prefs?: Json
          notifications_last_seen_at?: string
          rol?: string
          sae_fueros_seleccionados?: string[]
          sae_notif_email?: boolean
          sae_notif_email_addresses?: string[]
          sae_notif_enabled?: boolean
          sae_notif_push?: boolean
          sae_notif_push_quiet?: boolean
          sae_notif_weekend?: boolean
          telefono?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth_key: string
          created_at: string
          endpoint: string
          id: string
          last_used_at: string
          p256dh_key: string
          platform: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth_key: string
          created_at?: string
          endpoint: string
          id?: string
          last_used_at?: string
          p256dh_key: string
          platform?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth_key?: string
          created_at?: string
          endpoint?: string
          id?: string
          last_used_at?: string
          p256dh_key?: string
          platform?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      sae_credentials: {
        Row: {
          config: Json | null
          created_at: string
          encrypted_secret: string
          id: string
          last_error: string | null
          last_login_at: string | null
          last_sync_at: string | null
          profile_id: string
          provider: string
          status: string
          updated_at: string
          username: string
        }
        Insert: {
          config?: Json | null
          created_at?: string
          encrypted_secret: string
          id?: string
          last_error?: string | null
          last_login_at?: string | null
          last_sync_at?: string | null
          profile_id: string
          provider?: string
          status?: string
          updated_at?: string
          username: string
        }
        Update: {
          config?: Json | null
          created_at?: string
          encrypted_secret?: string
          id?: string
          last_error?: string | null
          last_login_at?: string | null
          last_sync_at?: string | null
          profile_id?: string
          provider?: string
          status?: string
          updated_at?: string
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "sae_credentials_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sae_movements: {
        Row: {
          ai_analyzed_at: string | null
          ai_error: string | null
          ai_extracted: Json | null
          ai_model: string | null
          ai_suggested_action: Json | null
          ai_summary: string | null
          created_at: string
          cuerpo: string | null
          expediente_id: string
          external_id: string | null
          fecha: string
          fingerprint: string
          id: string
          is_audiencia: boolean | null
          is_key: boolean | null
          raw_payload: Json | null
          sae_case_id: string | null
          synced_at: string
          tiene_documentos: boolean
          tipo_movimiento: Database["public"]["Enums"]["sae_movement_type"]
          titulo: string
        }
        Insert: {
          ai_analyzed_at?: string | null
          ai_error?: string | null
          ai_extracted?: Json | null
          ai_model?: string | null
          ai_suggested_action?: Json | null
          ai_summary?: string | null
          created_at?: string
          cuerpo?: string | null
          expediente_id: string
          external_id?: string | null
          fecha: string
          fingerprint: string
          id?: string
          is_audiencia?: boolean | null
          is_key?: boolean | null
          raw_payload?: Json | null
          sae_case_id?: string | null
          synced_at?: string
          tiene_documentos?: boolean
          tipo_movimiento?: Database["public"]["Enums"]["sae_movement_type"]
          titulo: string
        }
        Update: {
          ai_analyzed_at?: string | null
          ai_error?: string | null
          ai_extracted?: Json | null
          ai_model?: string | null
          ai_suggested_action?: Json | null
          ai_summary?: string | null
          created_at?: string
          cuerpo?: string | null
          expediente_id?: string
          external_id?: string | null
          fecha?: string
          fingerprint?: string
          id?: string
          is_audiencia?: boolean | null
          is_key?: boolean | null
          raw_payload?: Json | null
          sae_case_id?: string | null
          synced_at?: string
          tiene_documentos?: boolean
          tipo_movimiento?: Database["public"]["Enums"]["sae_movement_type"]
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "sae_movements_expediente_id_fkey"
            columns: ["expediente_id"]
            isOneToOne: false
            referencedRelation: "expedientes"
            referencedColumns: ["id"]
          },
        ]
      }
      sae_notif_views: {
        Row: {
          id: string
          ip: string | null
          notif_id: string
          notif_snapshot: Json
          profile_id: string
          timezone: string | null
          user_agent: string | null
          viewed_at: string
        }
        Insert: {
          id?: string
          ip?: string | null
          notif_id: string
          notif_snapshot?: Json
          profile_id: string
          timezone?: string | null
          user_agent?: string | null
          viewed_at?: string
        }
        Update: {
          id?: string
          ip?: string | null
          notif_id?: string
          notif_snapshot?: Json
          profile_id?: string
          timezone?: string | null
          user_agent?: string | null
          viewed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sae_notif_views_notif_id_fkey"
            columns: ["notif_id"]
            isOneToOne: false
            referencedRelation: "sae_notificaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sae_notif_views_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sae_notificaciones: {
        Row: {
          caratula: string | null
          created_at: string
          expediente_id: string | null
          fecha_captura: string
          fecha_emision: string | null
          ia_analyzed_at: string | null
          ia_resumen: string | null
          id: string
          leida: boolean
          leida_at: string | null
          notif_hash: string | null
          notified_email_at: string | null
          notified_push_at: string | null
          numero_expediente: string | null
          oficina: string | null
          plazo_estimado_dias: number | null
          prioridad: string | null
          profile_id: string
          push_diferido_hasta: string | null
          raw_payload: Json
          sae_notif_id: string
          snoozed_until: string | null
          tipo: string | null
          titulo: string | null
        }
        Insert: {
          caratula?: string | null
          created_at?: string
          expediente_id?: string | null
          fecha_captura?: string
          fecha_emision?: string | null
          ia_analyzed_at?: string | null
          ia_resumen?: string | null
          id?: string
          leida?: boolean
          leida_at?: string | null
          notif_hash?: string | null
          notified_email_at?: string | null
          notified_push_at?: string | null
          numero_expediente?: string | null
          oficina?: string | null
          plazo_estimado_dias?: number | null
          prioridad?: string | null
          profile_id: string
          push_diferido_hasta?: string | null
          raw_payload?: Json
          sae_notif_id: string
          snoozed_until?: string | null
          tipo?: string | null
          titulo?: string | null
        }
        Update: {
          caratula?: string | null
          created_at?: string
          expediente_id?: string | null
          fecha_captura?: string
          fecha_emision?: string | null
          ia_analyzed_at?: string | null
          ia_resumen?: string | null
          id?: string
          leida?: boolean
          leida_at?: string | null
          notif_hash?: string | null
          notified_email_at?: string | null
          notified_push_at?: string | null
          numero_expediente?: string | null
          oficina?: string | null
          plazo_estimado_dias?: number | null
          prioridad?: string | null
          profile_id?: string
          push_diferido_hasta?: string | null
          raw_payload?: Json
          sae_notif_id?: string
          snoozed_until?: string | null
          tipo?: string | null
          titulo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sae_notificaciones_expediente_id_fkey"
            columns: ["expediente_id"]
            isOneToOne: false
            referencedRelation: "expedientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sae_notificaciones_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sae_sync_logs: {
        Row: {
          audiencias_sugeridas: number
          created_at: string
          duplicadas: number
          error_code: string | null
          error_message: string | null
          expediente_id: string | null
          finished_at: string | null
          id: string
          nuevas_actuaciones: number
          profile_id: string
          raw_meta: Json | null
          started_at: string
          status: string
        }
        Insert: {
          audiencias_sugeridas?: number
          created_at?: string
          duplicadas?: number
          error_code?: string | null
          error_message?: string | null
          expediente_id?: string | null
          finished_at?: string | null
          id?: string
          nuevas_actuaciones?: number
          profile_id: string
          raw_meta?: Json | null
          started_at?: string
          status?: string
        }
        Update: {
          audiencias_sugeridas?: number
          created_at?: string
          duplicadas?: number
          error_code?: string | null
          error_message?: string | null
          expediente_id?: string | null
          finished_at?: string | null
          id?: string
          nuevas_actuaciones?: number
          profile_id?: string
          raw_meta?: Json | null
          started_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "sae_sync_logs_expediente_id_fkey"
            columns: ["expediente_id"]
            isOneToOne: false
            referencedRelation: "expedientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sae_sync_logs_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      seguimientos: {
        Row: {
          accion_requerida: string | null
          canal: string
          created_at: string
          created_by: string
          estado_organismo_reportado: string
          expediente_id: string
          fecha_control: string
          id: string
          observacion: string | null
          proxima_fecha_control: string | null
          requiere_accion: boolean
        }
        Insert: {
          accion_requerida?: string | null
          canal?: string
          created_at?: string
          created_by: string
          estado_organismo_reportado: string
          expediente_id: string
          fecha_control?: string
          id?: string
          observacion?: string | null
          proxima_fecha_control?: string | null
          requiere_accion?: boolean
        }
        Update: {
          accion_requerida?: string | null
          canal?: string
          created_at?: string
          created_by?: string
          estado_organismo_reportado?: string
          expediente_id?: string
          fecha_control?: string
          id?: string
          observacion?: string | null
          proxima_fecha_control?: string | null
          requiere_accion?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "seguimientos_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seguimientos_expediente_id_fkey"
            columns: ["expediente_id"]
            isOneToOne: false
            referencedRelation: "expedientes"
            referencedColumns: ["id"]
          },
        ]
      }
      tareas: {
        Row: {
          asignado_a: string
          completada_at: string | null
          completada_por: string | null
          created_at: string
          created_by: string
          descripcion: string | null
          estado: string
          expediente_id: string | null
          fecha_vencimiento: string | null
          id: string
          last_reminder_at: string | null
          prioridad: string
          tipo_tarea_id: string | null
          titulo: string
          updated_at: string
        }
        Insert: {
          asignado_a: string
          completada_at?: string | null
          completada_por?: string | null
          created_at?: string
          created_by: string
          descripcion?: string | null
          estado?: string
          expediente_id?: string | null
          fecha_vencimiento?: string | null
          id?: string
          last_reminder_at?: string | null
          prioridad?: string
          tipo_tarea_id?: string | null
          titulo: string
          updated_at?: string
        }
        Update: {
          asignado_a?: string
          completada_at?: string | null
          completada_por?: string | null
          created_at?: string
          created_by?: string
          descripcion?: string | null
          estado?: string
          expediente_id?: string | null
          fecha_vencimiento?: string | null
          id?: string
          last_reminder_at?: string | null
          prioridad?: string
          tipo_tarea_id?: string | null
          titulo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tareas_asignado_a_fkey"
            columns: ["asignado_a"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tareas_completada_por_fkey"
            columns: ["completada_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tareas_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tareas_expediente_id_fkey"
            columns: ["expediente_id"]
            isOneToOne: false
            referencedRelation: "expedientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tareas_tipo_tarea_id_fkey"
            columns: ["tipo_tarea_id"]
            isOneToOne: false
            referencedRelation: "catalogo_tipos_tarea"
            referencedColumns: ["id"]
          },
        ]
      }
      tipos_proceso_judicial: {
        Row: {
          activo: boolean
          codigo: string
          created_at: string
          descripcion: string | null
          fuero: string
          id: string
          jurisdiccion: string
          nombre: string
          norma_base: string | null
          orden: number
          updated_at: string
        }
        Insert: {
          activo?: boolean
          codigo: string
          created_at?: string
          descripcion?: string | null
          fuero: string
          id?: string
          jurisdiccion?: string
          nombre: string
          norma_base?: string | null
          orden?: number
          updated_at?: string
        }
        Update: {
          activo?: boolean
          codigo?: string
          created_at?: string
          descripcion?: string | null
          fuero?: string
          id?: string
          jurisdiccion?: string
          nombre?: string
          norma_base?: string | null
          orden?: number
          updated_at?: string
        }
        Relationships: []
      }
      tipos_proceso_normas: {
        Row: {
          created_at: string
          id: string
          norma_codigo: string
          norma_descripcion: string | null
          normativa_documento_id: string | null
          orden: number
          rol: string
          tipo_proceso_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          norma_codigo: string
          norma_descripcion?: string | null
          normativa_documento_id?: string | null
          orden?: number
          rol: string
          tipo_proceso_id: string
        }
        Update: {
          created_at?: string
          id?: string
          norma_codigo?: string
          norma_descripcion?: string | null
          normativa_documento_id?: string | null
          orden?: number
          rol?: string
          tipo_proceso_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tipos_proceso_normas_normativa_documento_id_fkey"
            columns: ["normativa_documento_id"]
            isOneToOne: false
            referencedRelation: "normativa_documentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tipos_proceso_normas_tipo_proceso_id_fkey"
            columns: ["tipo_proceso_id"]
            isOneToOne: false
            referencedRelation: "tipos_proceso_judicial"
            referencedColumns: ["id"]
          },
        ]
      }
      tipos_tramite: {
        Row: {
          activo: boolean
          codigo: string
          descripcion: string | null
          id: string
          nombre: string
          orden: number
          requiere_turno: boolean
        }
        Insert: {
          activo?: boolean
          codigo: string
          descripcion?: string | null
          id?: string
          nombre: string
          orden?: number
          requiere_turno?: boolean
        }
        Update: {
          activo?: boolean
          codigo?: string
          descripcion?: string | null
          id?: string
          nombre?: string
          orden?: number
          requiere_turno?: boolean
        }
        Relationships: []
      }
      transiciones_proceso: {
        Row: {
          condicion: string
          created_at: string
          descripcion: string | null
          etapa_destino_id: string
          etapa_origen_id: string
          id: string
          plazo_dias: number | null
        }
        Insert: {
          condicion: string
          created_at?: string
          descripcion?: string | null
          etapa_destino_id: string
          etapa_origen_id: string
          id?: string
          plazo_dias?: number | null
        }
        Update: {
          condicion?: string
          created_at?: string
          descripcion?: string | null
          etapa_destino_id?: string
          etapa_origen_id?: string
          id?: string
          plazo_dias?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "transiciones_proceso_etapa_destino_id_fkey"
            columns: ["etapa_destino_id"]
            isOneToOne: false
            referencedRelation: "etapas_proceso"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transiciones_proceso_etapa_origen_id_fkey"
            columns: ["etapa_origen_id"]
            isOneToOne: false
            referencedRelation: "etapas_proceso"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      clientes_con_contadores: {
        Row: {
          apellido: string | null
          created_at: string | null
          created_by: string | null
          cuil: string | null
          deleted_at: string | null
          dni: string | null
          domicilio: string | null
          email: string | null
          es_placeholder_sae: boolean | null
          expedientes_activos_count: number | null
          expedientes_count: number | null
          fecha_nacimiento: string | null
          id: string | null
          localidad: string | null
          nombre: string | null
          notas: string | null
          origen: string | null
          provincia: string | null
          sexo: string | null
          telefono: string | null
          telefono_alt: string | null
          ultimo_movimiento_expediente: string | null
          updated_at: string | null
        }
        Insert: {
          apellido?: string | null
          created_at?: string | null
          created_by?: string | null
          cuil?: string | null
          deleted_at?: string | null
          dni?: string | null
          domicilio?: string | null
          email?: string | null
          es_placeholder_sae?: never
          expedientes_activos_count?: never
          expedientes_count?: never
          fecha_nacimiento?: string | null
          id?: string | null
          localidad?: string | null
          nombre?: string | null
          notas?: string | null
          origen?: string | null
          provincia?: string | null
          sexo?: string | null
          telefono?: string | null
          telefono_alt?: string | null
          ultimo_movimiento_expediente?: never
          updated_at?: string | null
        }
        Update: {
          apellido?: string | null
          created_at?: string | null
          created_by?: string | null
          cuil?: string | null
          deleted_at?: string | null
          dni?: string | null
          domicilio?: string | null
          email?: string | null
          es_placeholder_sae?: never
          expedientes_activos_count?: never
          expedientes_count?: never
          fecha_nacimiento?: string | null
          id?: string | null
          localidad?: string | null
          nombre?: string | null
          notas?: string | null
          origen?: string | null
          provincia?: string | null
          sexo?: string | null
          telefono?: string | null
          telefono_alt?: string | null
          ultimo_movimiento_expediente?: never
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clientes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      expediente_brief_actual: {
        Row: {
          chain_id: string | null
          confidence: string | null
          contenido: string | null
          contenido_estructurado: Json | null
          created_at: string | null
          created_by: string | null
          entry_id: string | null
          evidence_refs: Json | null
          expediente_id: string | null
          seccion: string | null
          source: string | null
          tipo: string | null
          version: number | null
        }
        Insert: {
          chain_id?: string | null
          confidence?: string | null
          contenido?: string | null
          contenido_estructurado?: Json | null
          created_at?: string | null
          created_by?: string | null
          entry_id?: string | null
          evidence_refs?: Json | null
          expediente_id?: string | null
          seccion?: string | null
          source?: string | null
          tipo?: string | null
          version?: number | null
        }
        Update: {
          chain_id?: string | null
          confidence?: string | null
          contenido?: string | null
          contenido_estructurado?: Json | null
          created_at?: string | null
          created_by?: string | null
          entry_id?: string | null
          evidence_refs?: Json | null
          expediente_id?: string | null
          seccion?: string | null
          source?: string | null
          tipo?: string | null
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "expediente_brief_entries_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      _audit_skip_token: { Args: never; Returns: string }
      add_expediente_miembro: {
        Args: {
          p_expediente_id: string
          p_motivo?: string
          p_profile_id: string
          p_rol?: string
        }
        Returns: Json
      }
      aprendizajes_aplicables: {
        Args: {
          p_juez?: string
          p_organismo_id?: string
          p_tipo_proceso_id?: string
        }
        Returns: {
          confidence: string
          contenido: string
          contenido_estructurado: Json | null
          created_at: string
          created_by: string | null
          etapa_proceso_id: string | null
          id: string
          is_active: boolean
          observed_in_cases: number
          owner_id: string | null
          scope: string
          target_kind: string
          target_organismo_id: string | null
          target_ref_text: string | null
          tipo_proceso_id: string | null
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "aprendizajes_rulebook"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      auto_alertas_audiencias_proximas: { Args: never; Returns: Json }
      auto_alertas_seguimiento_pendiente: { Args: never; Returns: Json }
      auto_alertas_sin_responsable: { Args: never; Returns: Json }
      bulk_insert_seguimientos: {
        Args: { p_seguimientos: Json }
        Returns: Json
      }
      buscar_clientes_por_termino: {
        Args: { p_limit?: number; p_termino: string }
        Returns: {
          apellido: string
          cuil: string
          dni: string
          es_placeholder: boolean
          expedientes_count: number
          id: string
          nombre: string
        }[]
      }
      cambiar_estado_expediente: {
        Args: {
          p_expediente_id: string
          p_motivo: string
          p_nuevo_estado: string
          p_observacion?: string
        }
        Returns: Json
      }
      can_view_expediente: {
        Args: { p_expediente_id: string }
        Returns: boolean
      }
      clientes_placeholder_pendientes: {
        Args: never
        Returns: {
          apellido: string
          caratulas: string[]
          created_at: string
          dni: string
          expedientes_count: number
          id: string
          nombre: string
        }[]
      }
      create_expediente: {
        Args: {
          p_cliente_id: string
          p_es_propio?: boolean
          p_fuero?: string
          p_miembros?: Json
          p_observaciones?: string
          p_organismo_id?: string
          p_prioridad?: string
          p_tipo_tramite_id: string
        }
        Returns: Json
      }
      create_expediente_sae: {
        Args: {
          p_caratula: string
          p_cliente_id?: string
          p_numero_sae: string
          p_tipo_tramite_id?: string
        }
        Returns: Json
      }
      current_user_role: { Args: never; Returns: string }
      delete_sae_credential: {
        Args: { p_provider?: string }
        Returns: undefined
      }
      expediente_brief_versionar: {
        Args: {
          p_entry_padre_id: string
          p_nueva_confidence?: string
          p_nueva_source?: string
          p_nuevo_contenido: string
          p_nuevo_estructurado?: Json
          p_nuevos_evidence?: Json
        }
        Returns: {
          chain_id: string
          confidence: string
          contenido: string
          contenido_estructurado: Json | null
          created_at: string
          created_by: string | null
          evidence_refs: Json
          expediente_id: string
          id: string
          is_active: boolean
          seccion: string
          source: string
          superseded_by: string | null
          tipo: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "expediente_brief_entries"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_dashboard_metrics: {
        Args: { p_fecha_desde?: string; p_fecha_hasta?: string }
        Returns: Json
      }
      get_sae_notif_constancia: {
        Args: { p_notif_id: string }
        Returns: {
          ip: string
          notif_snapshot: Json
          timezone: string
          total_views: number
          user_agent: string
          view_id: string
          viewed_at: string
        }[]
      }
      get_sae_password: { Args: { p_user_id: string }; Returns: string }
      is_abogado: { Args: never; Returns: boolean }
      is_admin: { Args: never; Returns: boolean }
      is_director: { Args: never; Returns: boolean }
      last_notif_dispatch: {
        Args: { p_channel: string }
        Returns: {
          attempted_at: string
          reason: string
          status: string
        }[]
      }
      legal_cache_gc: { Args: never; Returns: number }
      legal_lookup_recent_count: {
        Args: { p_user_id: string }
        Returns: number
      }
      log_login: { Args: never; Returns: undefined }
      match_jurisprudencia_chunks: {
        Args: {
          exclude_documento_ids?: string[]
          filter_user_id: string
          match_count?: number
          query_embedding: string
        }
        Returns: {
          chunk_id: number
          contenido: string
          documento_id: string
          metadata: Json
          score: number
        }[]
      }
      match_normativa_chunks: {
        Args: {
          exclude_documento_ids?: string[]
          filter_user_id: string
          match_count?: number
          query_embedding: string
        }
        Returns: {
          chunk_id: number
          contenido: string
          documento_id: string
          metadata: Json
          score: number
        }[]
      }
      merge_clientes: {
        Args: { p_from_cliente_id: string; p_to_cliente_id: string }
        Returns: Json
      }
      posponer_alerta: {
        Args: { p_alerta_id: string; p_hasta: string }
        Returns: Json
      }
      posponer_alerta_ts: {
        Args: { p_alerta_id: string; p_hasta: string }
        Returns: Json
      }
      remove_expediente_miembro: {
        Args: {
          p_expediente_id: string
          p_motivo?: string
          p_profile_id: string
        }
        Returns: Json
      }
      resolver_alerta: {
        Args: { p_alerta_id: string; p_observacion?: string }
        Returns: Json
      }
      run_all_automations: { Args: never; Returns: Json }
      set_sae_movement_audiencia: {
        Args: { p_is_audiencia: boolean; p_movement_id: string }
        Returns: undefined
      }
      set_sae_movement_key: {
        Args: { p_is_key: boolean; p_movement_id: string }
        Returns: undefined
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      snooze_sae_notif: {
        Args: { p_notif_id: string; p_until: string }
        Returns: Json
      }
      soft_delete_cliente: { Args: { p_cliente_id: string }; Returns: Json }
      store_sae_credential: {
        Args: { p_password: string; p_provider?: string; p_username: string }
        Returns: Json
      }
      sync_sae: {
        Args: {
          p_estado_sae?: string
          p_expediente_id: string
          p_numero_sae: string
        }
        Returns: Json
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

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      audiencia_fuente: ["manual", "sae"],
      sae_movement_type: [
        "sentencia",
        "traslado",
        "audiencia",
        "prueba",
        "embargo",
        "cedula",
        "oficio",
        "intimacion",
        "planilla",
        "informe",
        "decreto",
        "escrito_parte",
        "otro",
      ],
    },
  },
} as const
