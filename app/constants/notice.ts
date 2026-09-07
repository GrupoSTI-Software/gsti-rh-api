/**
 * Catálogos cerrados del módulo de avisos.
 *
 * Los tres estados no se guardan: se derivan de `notice_sent_at` y
 * `notice_scheduled_at` (ver `Notice.noticeStatus`). Solo el público y el tipo
 * de contenido son columnas.
 */
export const NOTICE_STATUS = {
  SENT: 'sent',
  SCHEDULED: 'scheduled',
  DRAFT: 'draft',
} as const

export type NoticeStatusValue = (typeof NOTICE_STATUS)[keyof typeof NOTICE_STATUS]

export const NOTICE_STATUS_VALUES = [
  NOTICE_STATUS.SENT,
  NOTICE_STATUS.SCHEDULED,
  NOTICE_STATUS.DRAFT,
] as const

/**
 * Cómo se armó la lista de destinatarios. Es una etiqueta para filtrar y leer
 * el aviso; los destinatarios siempre se persisten uno por uno en
 * `notice_recipients`, sea cual sea el público.
 */
export const NOTICE_AUDIENCE = {
  COMPANY: 'company',
  DEPARTMENT: 'department',
  MANUAL: 'manual',
} as const

export type NoticeAudienceValue = (typeof NOTICE_AUDIENCE)[keyof typeof NOTICE_AUDIENCE]

export const NOTICE_AUDIENCE_VALUES = [
  NOTICE_AUDIENCE.COMPANY,
  NOTICE_AUDIENCE.DEPARTMENT,
  NOTICE_AUDIENCE.MANUAL,
] as const

export const NOTICE_TYPE = {
  TEXT: 'text',
  IMAGE: 'image',
  PDF: 'pdf',
} as const

export type NoticeTypeValue = (typeof NOTICE_TYPE)[keyof typeof NOTICE_TYPE]

export const NOTICE_TYPE_VALUES = [NOTICE_TYPE.TEXT, NOTICE_TYPE.IMAGE, NOTICE_TYPE.PDF] as const

/** Guard del catálogo de tipos: la columna del modelo es `string`. */
export function isNoticeTypeValue(value: unknown): value is NoticeTypeValue {
  return typeof value === 'string' && (NOTICE_TYPE_VALUES as readonly string[]).includes(value)
}

/**
 * Qué hace el guardado con el aviso: enviarlo de inmediato, dejarlo en
 * borrador o agendarlo para que lo envíe el comando programado.
 */
export const NOTICE_SEND_MODE = {
  NOW: 'now',
  DRAFT: 'draft',
  SCHEDULED: 'scheduled',
  /**
   * Guardar cambios sin reenviar. Junto con `now` es el único modo válido
   * sobre un aviso ya enviado; sobre uno que aún no sale se guarda como
   * borrador.
   */
  UPDATE: 'update',
} as const

export type NoticeSendModeValue = (typeof NOTICE_SEND_MODE)[keyof typeof NOTICE_SEND_MODE]

export const NOTICE_SEND_MODE_VALUES = [
  NOTICE_SEND_MODE.NOW,
  NOTICE_SEND_MODE.DRAFT,
  NOTICE_SEND_MODE.SCHEDULED,
  NOTICE_SEND_MODE.UPDATE,
] as const

/**
 * Slug del módulo en `system_modules` (fila 32, `0017_system_module_seeder`).
 * Único lugar canónico para las declaraciones del gate de permisos.
 */
export const NOTICE_PERMISSION_MODULE_SLUG = 'avisos-y-noticias'

/**
 * Tope del mensaje de un aviso de texto, medido sobre el texto plano (sin
 * etiquetas HTML). Es el límite que muestra el contador del backoffice.
 */
export const NOTICE_MESSAGE_MAX_LENGTH = 1200

/** Tope del asunto. Coincide con `notice_subject varchar(500)`. */
export const NOTICE_SUBJECT_MAX_LENGTH = 500

/** Perfil de entrada de archivos que usan el cuerpo (imagen o PDF) y los adjuntos. */
export const NOTICE_FILE_INTAKE_PROFILE = 'evidence-document' as const

/** Carpeta lógica del bucket donde viven los archivos de avisos. */
export const NOTICE_FILE_FOLDER = 'notices'

/** Sufijo que recibe el asunto de un aviso duplicado. */
export const NOTICE_DUPLICATE_SUBJECT_SUFFIX = ' (copia)'

/**
 * Slug del comando ace que envía los avisos programados cuya hora ya llegó.
 * Único lugar canónico para referenciarlo desde el scheduler.
 */
export const NOTICE_SEND_SCHEDULED_COMMAND = 'notices:send-scheduled'

/** Motivo auditado con el que el comando programado omite el filtro de tenant. */
export const NOTICE_SEND_SCHEDULED_UNSCOPED_REASON =
  'envío de avisos programados: barrido de todas las empresas fuera de una request'
