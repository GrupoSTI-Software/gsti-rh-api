import type { TeleworkPolicyComponent } from '#models/telework_policy_template'
import type { TeleworkPolicyStatus } from '#models/telework_policy'
import type { TeleworkPolicyAcknowledgementStatus } from '#constants/telework_policy'

export type { TeleworkPolicyComponent }

/**
 * Forma administrativa del borrador/versión de la política (editor del BO).
 * `contentHash`/`publishedAt`/`publishedByName` van `null` en borradores; se
 * completan al publicar (USRH1783547655377, regla de negocio 2).
 * `publishedByName` es el nombre resuelto server-side — nunca el userId
 * crudo del publicador (mandato de seguridad).
 */
export interface TeleworkPolicyDto {
  id: number
  businessUnitId: number
  version: number
  title: string
  components: TeleworkPolicyComponent[]
  status: TeleworkPolicyStatus
  isCurrent: boolean
  /** Componentes con `body` vacío tras sanear — guía, no bloqueo (regla de negocio 6). */
  missingComponentKeys: string[]
  contentHash: string | null
  publishedAt: string | null
  publishedByName: string | null
  createdAt: string
  updatedAt: string
  createdByUserId: number
  updatedByUserId: number
}

/** Resumen de la versión vigente publicada — para el chip "Vigente vN" sin encadenar requests. */
export interface TeleworkPolicyCurrentSummaryDto {
  id: number
  version: number
  publishedAt: string
  publishedByName: string | null
  contentHash: string
}

/**
 * `{ exists: false }` dispara el selector cero/plantilla en el BO;
 * `exists: true` abre el editor. `current` (NUEVO, aditivo): la publicada
 * vigente, distinta de `policy` cuando conviven borrador + vigente tras
 * publicar y volver a iniciar un borrador (regla de negocio 12).
 */
export interface TeleworkPolicyStateDto {
  exists: boolean
  policy: TeleworkPolicyDto | null
  current: TeleworkPolicyCurrentSummaryDto | null
}

/** Forma pública de la plantilla base global (para previsualizar / partir de plantilla). */
export interface TeleworkPolicyTemplateDto {
  version: string
  components: TeleworkPolicyComponent[]
  isCurrent: boolean
}

/** Fila ligera del historial de versiones (sin `components`; el detalle vive en el GET principal). */
export interface TeleworkPolicyVersionDto {
  id: number
  version: number
  status: TeleworkPolicyStatus
  isCurrent: boolean
  publishedAt: string | null
  publishedByName: string | null
  contentHash: string | null
  createdAt: string
}

/** Resumen de un lote de envíos (difusión al publicar o recordatorio). Mismo shape en publish y remind-pending. */
export interface TeleworkPolicyDiffusionSummaryDto {
  total: number
  sent: number
  failed: number
  skipped: number
}

/** Resultado de publicar: la versión recién publicada + el resumen de su difusión automática. */
export interface TeleworkPolicyPublishResultDto {
  policy: TeleworkPolicyDto
  diffusion: TeleworkPolicyDiffusionSummaryDto
}

/** Fila del seguimiento de acuses: un teletrabajador del conjunto 5.1 contra la vigente. */
export interface TeleworkPolicyAcknowledgementRowDto {
  employeeId: number
  employeeCode: number | string
  fullName: string
  position: string
  status: TeleworkPolicyAcknowledgementStatus
  acknowledgedVersion: number | null
  acknowledgedAt: string | null
  /** Visibilidad de a quién NO le llegará ningún correo (regla de negocio 5); la dirección nunca viaja al BO. */
  hasEmail: boolean
}

/** Seguimiento completo (conjunto 5.1 vs acuses, calculado al vuelo — regla de negocio 6). */
export interface TeleworkPolicyAcknowledgementTrackingDto {
  hasCurrentVersion: boolean
  currentVersion: number | null
  publishedAt: string | null
  summary: {
    total: number
    acknowledged: number
    outdated: number
    pending: number
    withoutEmail: number
  }
  workers: TeleworkPolicyAcknowledgementRowDto[]
}

/** Resultado de "Recordar a pendientes" (masivo o selectivo). */
export interface TeleworkPolicyRemindResultDto extends TeleworkPolicyDiffusionSummaryDto {
  pendingTotal: number
}
