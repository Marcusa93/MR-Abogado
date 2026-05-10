# CONTRATO DE DESARROLLO DE SOFTWARE
## Anexo Técnico — Alcance y Entregables del Sistema Alba Guerra CRM v2.0

**Fecha:** _______________
**Cliente:** Estudio Jurídico Alba Guerra
**Proveedor:** _______________
**Producto:** Alba Guerra System — CRM Jurídico-Previsional (web app)

---

## 1. OBJETO DEL CONTRATO

El presente documento describe de manera **detallada y exhaustiva** el sistema **Alba Guerra CRM v2.0** ya desarrollado y entregado, con el fin de:

1. Establecer el **alcance funcional cerrado** correspondiente al entregable actual.
2. Servir como **línea base** para la cotización separada de cualquier funcionalidad, módulo, integración, mejora, optimización, migración o soporte que se solicite **fuera del alcance aquí detallado**.

**Cláusula de alcance:** Todo requerimiento no listado explícitamente en este documento se considera **fuera de alcance** y deberá ser cotizado, presupuestado y contratado de manera separada antes de iniciar su desarrollo.

---

## 2. DESCRIPCIÓN GENERAL DEL PRODUCTO

**Alba Guerra System** es una aplicación web profesional de gestión integral para estudios jurídicos especializados en **trámites previsionales ante ANSES** (jubilaciones, pensiones, invalidez, reajustes, reclamos administrativos, amparos por mora, etc.).

El sistema centraliza el **ciclo de vida completo** de un caso previsional:

> Consulta inicial → Análisis de viabilidad → Recolección de documentación → Inicio de trámite → Gestión ante ANSES → Resolución → Liquidación → Cobro de honorarios → Cierre

### 2.1. Usuarios y Roles del Sistema

El sistema está diseñado para operar con cuatro roles diferenciados, cada uno con permisos específicos controlados mediante **Row Level Security (RLS)**:

| Rol | Funciones principales |
|-----|-----------------------|
| **Admin** | Gestión completa del sistema, alta/baja de usuarios, configuración de catálogos |
| **Abogado** | Análisis de casos, cambios de estado, asignación, control de expedientes |
| **Contador** | Gestión de honorarios, registro de cobros, liquidaciones |
| **Secretaría** | Control semanal ANSES, seguimientos, turnos, tareas administrativas |

---

## 3. STACK TECNOLÓGICO ENTREGADO

### 3.1. Frontend
- **Framework:** React 19 + React Router 7
- **Build tool:** Vite 6 + TypeScript 5.7
- **Estado (UI / client):** Zustand 5
- **Estado (server / cache):** TanStack React Query 5
- **Estilos:** Tailwind CSS 4 + CVA (class-variance-authority)
- **Formularios y validación:** React Hook Form 7 + Zod 3
- **Iconografía:** Lucide React
- **Drag & Drop (Kanban):** @dnd-kit
- **Gráficos:** Recharts
- **Exportación:** XLSX (Excel) + jsPDF (PDF)
- **Utilitarios:** date-fns (fechas es-AR), cmdk (command palette), clsx + tailwind-merge

### 3.2. Backend
- **Plataforma:** Supabase (PostgreSQL 15 + Auth + Storage + Edge Functions)
- **Autenticación:** Supabase Auth (email + contraseña)
- **Seguridad a nivel fila:** RLS habilitado en **todas** las tablas
- **Storage:** Bucket `adjuntos` para archivos
- **Edge Functions (Deno):**
  - `create-user` — alta de usuarios (solo admin)
  - `nico-chat` — proxy a OpenRouter para asistente IA
  - `validate-cuil` — validación de CUIL
- **Extensiones PostgreSQL:** `pg_trgm` (búsqueda fuzzy), `pgcrypto` (encriptación)

### 3.3. Infraestructura y Despliegue
- **Frontend:** Vercel
- **Backend / DB / Storage:** Supabase Cloud
- **Integración IA:** OpenRouter (modelo GPT-4o mini) vía edge function

---

## 4. ALCANCE FUNCIONAL ENTREGADO

### 4.1. Módulo de Autenticación y Acceso

- Login con email y contraseña.
- Callback OAuth / magic links (infraestructura lista).
- Flujo obligatorio de **cambio de contraseña en primer login**.
- Logout seguro.
- Registro de sesiones en tabla de auditoría (`log_login`).
- Middleware de protección de rutas (AuthGuard) en todas las páginas internas.
- Redirección automática a `/login` cuando expira la sesión.
- Página 404 personalizada.

### 4.2. Dashboard Principal

Panel de inicio con:
- **KPIs de cabecera:** total de expedientes activos, ingresos del mes, tareas pendientes, alertas activas, turnos próximos.
- **Semáforo de estado del pipeline** (visualización tricolor por categoría).
- **Panel de "Mis tareas"** (tareas asignadas al usuario logueado).
- **Lista de próximos turnos ANSES** (ventana 48 hs).
- **Panel de alertas activas.**
- Indicadores personalizados por rol del usuario logueado.

### 4.3. Módulo de Clientes

#### Campos soportados
- Apellido, nombre, DNI (7-8 dígitos, único), CUIL (formato XX-XXXXXXXX-X, único).
- Teléfono, teléfono alternativo, email.
- Domicilio, localidad, provincia (default Buenos Aires), código postal.
- Fecha de nacimiento, sexo (M/F), obra social.
- Clave ANSES y CVSS **encriptadas** en base de datos.
- Contactos adicionales (familiares, apoderados, referentes).

#### Funcionalidades
- Alta, edición, baja lógica (soft delete) de clientes.
- Validación de DNI único y formato de CUIL.
- **Búsqueda fuzzy cross-field** (apellido, nombre, DNI, CUIL, teléfono) con ranking por similitud (trigram).
- Listado paginado con filtros.
- Vista de detalle con pestañas: datos, expedientes vinculados, contactos adicionales, notas.
- Trazabilidad: creado por, fecha alta, última modificación.

### 4.4. Módulo de Expedientes (núcleo del sistema)

#### Estructura del expediente
- **Número único auto-generado** con formato `EXP-AAAA-XXXX` por año.
- Vinculación a cliente, tipo de trámite, UDAI (oficina ANSES), abogado, contador, secretaria y responsable principal.
- Estado interno (11 valores posibles) + estado ANSES (texto libre).
- Prioridad: baja / media / alta / urgente.
- Fechas clave: alta, inicio ANSES, resolución, primer cobro estimado, cierre.
- Montos: estimado y de resolución.
- Campo de viabilidad (boolean), análisis de viabilidad (texto), observaciones.
- Soft delete con trazabilidad.

#### Pipeline de estados (11 estados)
1. `NUEVA_CONSULTA`
2. `EN_ANALISIS`
3. `A_LA_ESPERA_DE_DOCUMENTACION`
4. `TOMADO_LISTO_PARA_INICIAR`
5. `PRODUCCION_TAREAS_INTERNAS`
6. `INICIADO_EN_ANSES`
7. `EN_TRAMITE_ANSES`
8. `RESUELTO_FAVORABLEMENTE`
9. `FINALIZADO`
10. `NO_VIABLE_RECHAZADO`
11. `PAUSADO_POR_CLIENTE`

**Máquina de estados estricta:** las transiciones permitidas están validadas en base de datos (función RPC `cambiar_estado_expediente`).

#### Efectos automáticos al cambiar estado
- Al pasar a **EN_TRAMITE_ANSES**: se genera tarea "Control semanal ANSES" con vencimiento +7 días y alerta de seguimiento.
- Al pasar a **RESUELTO_FAVORABLEMENTE**: se genera alerta "Registrar liquidación" y tarea asociada.

#### Vistas del módulo
- **Tabla de listado** con sorteo por columnas, paginación, filtros por estado, prioridad, asignado, tipo de trámite, rango de fechas, cliente.
- **Vista Kanban:** 5 columnas pipeline con drag-and-drop para cambiar de estado.
- **Vista de detalle con pestañas** (ver 4.5).
- **Exportación masiva a CSV.**
- Tagging flexible (tags personalizables por expediente).

### 4.5. Pestañas del Detalle de Expediente

1. **General** — datos del expediente, estado, responsables, prioridad, fechas, montos, análisis de viabilidad.
2. **Turnos ANSES** — creación, listado y gestión de turnos (tipo: inicial / seguimiento / reclamo / retiro de resolución; estado: pendiente / confirmado / completado / cancelado / no asistió).
3. **Seguimientos ANSES** — registro semanal típicamente cargado por secretaría los viernes (canal: web / teléfono / presencial; estado reportado; próxima fecha de control).
4. **Tareas** — tareas internas vinculadas al expediente.
5. **Documentos** — checklist de documentos requeridos (DNI, CUIL, recibo haberes, certificado de servicios, poder, resolución, liquidación, telegrama, constancia, captura, escrito, otros) + gestión de adjuntos.
6. **Honorarios** — pacto de honorarios (tipo: fijo / porcentaje / mixto; monto, porcentaje, tope) e historial de cobros.
7. **Notas** — notas internas **inmutables** (append-only para trazabilidad legal).
8. **Liquidación** — datos de resolución favorable: haber mensual, retroactivo bruto/neto, fecha de primer cobro, obra social.
9. **Historial de estados** — timeline completo de cambios de estado con autor y fecha.

### 4.6. Módulo de Turnos ANSES

- Alta, edición y cambio de estado de turnos.
- Campos: fecha, hora (opcional), UDAI, tipo, estado, profesional asistente, resultado, notas.
- Listado global de próximos turnos (48 hs) en dashboard.
- Vista de agenda de secretaría.
- Alertas automáticas de "turno próximo".

### 4.7. Módulo de Seguimientos ANSES

- Registro de controles periódicos del expediente ante ANSES.
- Campos: fecha de control, estado ANSES reportado, canal (web / teléfono / presencial), observación, próxima fecha de control, bandera "requiere acción" con detalle.
- Alertas automáticas de "seguimiento pendiente" (ausencia de seguimiento en últimos 7 días para expedientes en trámite).

### 4.8. Módulo de Tareas

- Tareas vinculadas a expediente o generales (no vinculadas).
- Campos: título, descripción, tipo (catálogo), asignado a, fecha de vencimiento, prioridad, estado.
- Estados: pendiente / en progreso / completada / cancelada.
- Filtros: asignadas a mí, vencidas, en progreso, por prioridad.
- Trigger en DB que auto-registra fecha y usuario al completar.
- Vista página tareas + panel "Mis tareas" en dashboard.

### 4.9. Módulo de Alertas y Notificaciones

#### Tipos de alertas
- `seguimiento_pendiente` — sin seguimiento en 7 días (expedientes en trámite).
- `turno_proximo` — turno programado en próximas 48 hs.
- `tarea_vencida` — tarea no completada pasada la fecha.
- `edad_jubilatoria` — cliente próximo a edad jubilatoria.
- `sin_responsable` — expediente sin abogado asignado.
- `sin_turno` — expediente que requiere turno y no lo tiene.
- `pronto_despacho` — próximo despacho ANSES.
- `amparo_mora` — demora administrativa excesiva.
- `custom` — alerta manual.
- `mencion` — mención en notas internas.

#### Funcionalidades
- Generación automática mediante funciones RPC programables.
- Marcar como resuelta / posponer / cerrar.
- Dropdown de notificaciones en header con contador.
- Badges en sidebar con contadores de pendientes.
- Toasts de feedback inmediato (éxito / error / info).
- Página dedicada con filtros y acciones masivas.

### 4.10. Módulo de Documentos / Adjuntos

- Upload de archivos a Supabase Storage (bucket `adjuntos`).
- Validación de tipo MIME y tamaño.
- **11 categorías:** DNI, CUIL, recibo de haberes, certificado de servicios, poder, resolución, liquidación, telegrama, constancia, captura, escrito, otro.
- Vinculación a expediente o cliente.
- Descarga segura con control de RLS.
- Soft delete con trazabilidad.
- Checklist de documentos requeridos por expediente.

### 4.11. Módulo de Honorarios

- **Pacto de honorarios** por expediente:
  - Tipo: fijo / porcentaje / mixto.
  - Monto fijo, porcentaje (0-100), monto tope.
  - Fecha de acuerdo, estado (vigente / modificado / cancelado), observaciones.
- **Registro de cobros** contra el pacto:
  - Monto, fecha, medio de pago (efectivo / transferencia / cheque / retención judicial).
  - Comprobante, notas.
- Cálculo automático de saldo pendiente.
- Vista en pestaña de expediente + módulo finanzas.

### 4.12. Módulo de Liquidaciones

- Registro de datos de resolución favorable: número de beneficio, haber mensual, retroactivo bruto/neto, fecha de primer cobro, obra social.
- Marca de cliente notificado + fecha de notificación.
- Creación automática al cambiar estado a `RESUELTO_FAVORABLEMENTE`.

### 4.13. Módulo de Finanzas

- Registro manual de movimientos (ingresos / egresos).
- Categorías de ingreso: cobro cliente, resolución favorable, otro.
- Categorías de egreso: gasto operativo, impuesto, honorario pagado, otro.
- Campos: tipo, categoría, monto, fecha, descripción, método de pago, comprobante.
- Eliminación con confirmación.
- Estadísticas por período (ingresos / egresos / saldo acumulado mensual).
- Listado filtrable y paginado.

### 4.14. Módulo de Actividad / Auditoría

- Registro inmutable de eventos sensibles: creaciones, cambios de estado, modificaciones, logins, accesos a datos sensibles.
- Página de visualización con filtros.
- Trazabilidad a nivel de usuario y timestamp.

### 4.15. Módulo de Informes

- **Reportes visuales** con gráficos (donut, barras):
  - Expedientes por estado.
  - Expedientes por mes (alta).
  - Expedientes por tipo de trámite.
  - Resumen financiero.
- **Exportación a PDF** con gráficos embebidos.
- **Exportación a CSV** de expedientes.
- Generación de constancias y documentos PDF por trámite.

### 4.16. Módulo de Importación desde Excel

- Carga de archivos `.xlsx`.
- **Preview de datos antes de sincronizar.**
- Validaciones: DNI único, formato CUIL, fechas.
- Sincronización masiva de clientes y expedientes.
- Indicador visual de progreso.
- Reporte de filas importadas / rechazadas.

### 4.17. Módulo de Configuración

- **Gestión de usuarios:** alta (vía edge function `create-user`), cambio de rol, desactivación.
- **Gestión de catálogos:**
  - Tipos de trámite (código, nombre, requiere turno, activo).
  - UDAIs (oficinas ANSES con dirección, localidad, provincia, teléfono).
  - Tipos de tarea.
- **Preferencias de UI:**
  - Modo claro / oscuro / sistema (Zustand + localStorage).
  - Vista de expedientes (grid / list).

### 4.18. Asistente IA "Nico"

- Chat integrado con modelo GPT-4o mini vía OpenRouter.
- Proxy seguro mediante edge function (`nico-chat`) con JWT.
- Interfaz conversacional dentro de la app.

### 4.19. Agenda de Secretaría

- Vista dedicada para el rol de secretaría con turnos próximos y tareas de control semanal ANSES.
- Creación rápida de seguimientos desde la agenda.

### 4.20. Búsqueda Global y Command Palette

- Command palette (Cmd+K / Ctrl+K) para navegación rápida entre secciones.
- Atajos de teclado configurados.
- Búsqueda en tiempo real en listados.

---

## 5. RUTAS / PÁGINAS ENTREGADAS

### Rutas públicas
- `/login`
- `/auth/callback`
- `/cambiar-contrasena` (forzado en primer login)
- Página 404

### Rutas protegidas
- `/dashboard`
- `/clientes`, `/clientes/nuevo`, `/clientes/:id`
- `/expedientes`, `/expedientes/nuevo`, `/expedientes/:id`
- `/kanban`
- `/agenda-secretaria`
- `/tareas`
- `/alertas`
- `/informes`
- `/finanzas`
- `/actividad`
- `/importar`
- `/configuracion`

---

## 6. BASE DE DATOS ENTREGADA

### 6.1. Tablas principales (21)

| Tabla | Descripción |
|-------|-------------|
| `profiles` | Usuarios internos (vinculados a `auth.users`) |
| `clientes` | Personas físicas (clientes del estudio) |
| `tipos_tramite` | Catálogo de trámites ANSES |
| `udais` | Catálogo de oficinas ANSES |
| `catalogo_tipos_tarea` | Catálogo de tipos de tarea |
| `expedientes` | Casos / legajos (tabla central) |
| `historial_estados_expediente` | Trazabilidad inmutable de cambios de estado |
| `turnos_anses` | Turnos programados con ANSES |
| `seguimientos_anses` | Control periódico de expedientes |
| `tareas` | Tareas internas |
| `acuerdos_honorarios` | Pactos de honorarios |
| `cobros_honorarios` | Registros de cobro |
| `alertas` | Alertas automáticas y manuales |
| `adjuntos` | Archivos subidos |
| `expediente_document_checklist` | Checklist de documentos por expediente |
| `expediente_notas` | Notas internas inmutables |
| `liquidaciones` | Datos de resolución favorable |
| `citaciones_cierre` | Citaciones finales de cliente |
| `expediente_tags` | Tags flexibles |
| `expediente_contactos` | Contactos adicionales del cliente |
| `audit_log` | Log general de auditoría |

### 6.2. Funciones RPC (lógica de negocio en DB)

- `create_expediente` — alta con número autogenerado e historial inicial.
- `cambiar_estado_expediente` — máquina de estados con validación y efectos colaterales.
- `asignar_responsable` — asignación con registro en historial.
- `search_clientes` — búsqueda fuzzy con ranking trigram.
- `get_kanban_data` — datos precalculados del board.
- `log_login` — registro de sesión.
- `auto_alertas_seguimiento_pendiente` — generación automática.
- `auto_alertas_turnos_proximos` — generación automática.
- `auto_alertas_sin_responsable` — generación automática.

### 6.3. Seguridad

- **RLS habilitado en el 100% de las tablas**, con policies diferenciadas por rol.
- **Encriptación** de claves sensibles (`clave_anses`, `cvss`) mediante `pgcrypto`.
- **Soft delete** en entidades principales.
- **Audit log** con trazabilidad de acciones críticas.

### 6.4. Índices y optimización

- Índices trigram en búsquedas de clientes.
- Índices en FK y columnas filtradas (estado, prioridad, deleted_at, fechas).

---

## 7. CARACTERÍSTICAS TRANSVERSALES

- **Modo claro / oscuro / sistema** con persistencia.
- **Diseño responsive** (mobile, tablet, desktop).
- **Idioma:** español Argentina (es-AR); formato de fecha y moneda localizados.
- **Command palette** (Cmd/Ctrl+K).
- **Toasts de notificación** (éxito / error / info).
- **Confirm dialogs** en acciones destructivas.
- **Loading skeletons** y estados vacíos.
- **Paginación y scroll infinito** en listados grandes.
- **Botón WhatsApp** integrado en UI.
- **Máscara progresiva** en inputs de DNI / CUIL.

---

## 8. ENTREGABLES ASOCIADOS AL SISTEMA ACTUAL

Se consideran entregados y dentro del precio acordado:

1. Código fuente del frontend (React + TypeScript).
2. Migraciones SQL de base de datos y funciones RPC.
3. Edge Functions (Deno).
4. Configuración de despliegue en Vercel.
5. Configuración de proyecto Supabase (schema + RLS + storage).
6. Documento presente de alcance.
7. Acceso inicial de usuarios administradores.

---

## 9. EXCLUSIONES EXPLÍCITAS — SE COTIZAN APARTE

Todo lo siguiente **NO está incluido** en el alcance actual y deberá ser cotizado, presupuestado y contratado como un adicional. Este listado es enunciativo, no taxativo:

### 9.1. Integraciones externas no implementadas
- Integración con **API oficial de ANSES** (scraping o integración directa con sistemas ANSES).
- Integración con **AFIP** (constancia de inscripción, padrón, etc.).
- Integración con pasarelas de pago (MercadoPago, Stripe, etc.).
- Integración con sistemas contables externos (Tango, Bejerman, Xubio, Contabilium, etc.).
- Integración con WhatsApp Business API (envío automatizado de mensajes).
- Integración con servicios de firma digital.
- Conexión con bancos / homebanking.
- Integración con Google Calendar, Outlook u otros calendarios externos.

### 9.2. Canales de notificación adicionales
- Notificaciones por **email** automáticas.
- Notificaciones por **SMS**.
- Notificaciones **push** (web / mobile).
- Recordatorios automáticos a clientes por cualquier canal.

### 9.3. Módulos funcionales adicionales
- **App móvil nativa** (iOS / Android).
- **Portal externo para clientes** (acceso al estado de su trámite).
- Sistema de **firmas digitales** de documentos.
- **Workflow builder visual** (automatizaciones configurables por el usuario).
- **Multi-tenant / white label** (varios estudios en la misma instancia).
- **Facturación electrónica**.
- **Sistema de turnos online para clientes**.
- Motor de **plantillas de escritos** dinámicas.
- Generación automatizada de cédulas, oficios, escritos.
- **OCR** sobre documentos subidos.
- Análisis predictivo / IA sobre viabilidad de casos.
- **Chat interno** entre usuarios del sistema.
- Módulo de **tickets / mesa de ayuda interna**.
- **Calendario visual completo** (vista mes / semana tipo Google Calendar).
- **Videollamadas integradas** con clientes.

### 9.4. Seguridad avanzada
- **Autenticación de dos factores (2FA)**.
- **SSO** (Google, Microsoft, etc.).
- Auditoría forense avanzada / SIEM.
- Cifrado end-to-end de mensajes internos.
- Certificaciones de compliance (ISO, SOC2, etc.).

### 9.5. Reportes e inteligencia
- **Dashboard configurable** por el usuario (drag-and-drop de widgets).
- Reportes personalizados por el usuario (query builder).
- Exportación a formatos adicionales (Excel nativo con formato, Word).
- Business Intelligence / cubos OLAP.
- Alertas predictivas basadas en ML.

### 9.6. Internacionalización
- Soporte **multi-idioma** (i18n dinámico).
- Soporte **multi-moneda**.

### 9.7. Operaciones y soporte
- **Mantenimiento mensual** post-entrega (correctivo y evolutivo).
- **Soporte técnico** a usuarios finales (mesa de ayuda).
- **Capacitación de usuarios** (fuera de la entrega inicial).
- **Migración de datos** desde sistemas preexistentes no documentados en este contrato.
- **Backups gestionados** y planes de recuperación ante desastres fuera del estándar Supabase.
- **Monitoreo activo 24/7** (APM, uptime, alertas).
- Adaptación del sistema a **cambios normativos** futuros (ej. modificaciones en leyes previsionales, cambios en procedimientos ANSES).

### 9.8. Modificaciones sobre features existentes
Cualquier ajuste de alcance sobre funcionalidades entregadas que implique:
- Rediseño de UI / UX.
- Cambio en la lógica de negocio (ej. agregar nuevos estados al pipeline, nuevos roles, nuevos tipos de trámite con lógica diferente).
- Nuevas validaciones o reglas de negocio.
- Cambios estructurales en el modelo de datos.

...se consideran **mejora evolutiva** y se cotizan aparte.

---

## 10. MODELO DE COTIZACIÓN DE NUEVAS FUNCIONALIDADES

Para cualquier feature no incluida en este alcance, el proveedor entregará un presupuesto escrito que especifique:

1. Descripción funcional del requerimiento.
2. Alcance técnico (frontend / backend / DB / integraciones).
3. Estimación de horas o precio cerrado.
4. Plazo de entrega estimado.
5. Condiciones de pago.
6. Criterios de aceptación.

Ningún desarrollo fuera de este alcance se iniciará sin aprobación escrita previa del cliente sobre el presupuesto correspondiente.

---

## 11. GARANTÍA SOBRE EL ALCANCE ENTREGADO

El proveedor garantiza la corrección de **bugs** (defectos) sobre funcionalidades descritas en este documento por un plazo de **_____ días** a partir de la fecha de entrega formal.

Un **bug** se define como un comportamiento del sistema distinto al descrito en este documento. **No se consideran bugs**:

- Pedidos de nuevas funcionalidades.
- Cambios de diseño o preferencia.
- Adaptaciones a nuevos requerimientos del negocio.
- Problemas derivados de cambios en servicios externos (Supabase, Vercel, OpenRouter, ANSES, etc.).
- Problemas de performance atribuibles a volumen de datos fuera del rango razonable estimado.

---

## 12. FIRMAS

**Por el Cliente:**
Nombre: _______________
DNI: _______________
Fecha: _______________
Firma: _______________

**Por el Proveedor:**
Nombre: _______________
DNI / CUIT: _______________
Fecha: _______________
Firma: _______________
