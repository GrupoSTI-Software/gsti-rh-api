import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import type TeleworkPhotoNotice from '#models/telework_photo_notice'
import type TeleworkPhotoNoticeTemplate from '#models/telework_photo_notice_template'

export interface CreateDraftData {
  businessUnitId: number
  version: number
  title: string
  content: string
  templateId: number | null
  createdByUserId: number
}

export interface UpdateDraftData {
  title: string
  content: string
  updatedByUserId: number
}

export interface MarkAsPublishedData {
  publishedByUserId: number
  renderedContent: string
  contentHash: string
}

/**
 * Puerto de persistencia del aviso de privacidad de la evidencia fotográfica
 * del puesto de trabajo (VLRH-H1791306079310). Molde
 * `telework-policy/telework_policy.repository.ts`, con una desviación
 * obligatoria del §7: **todos** los métodos que reciben `businessUnitId`
 * filtran `business_unit_id = ?` de forma explícita en el adaptador, además
 * del mixin `withBusinessUnitScope()`. Lo de otra empresa responde igual que
 * lo inexistente (CA-12).
 *
 * Semántica que fija el puerto:
 * - Las dos consultas de borrador filtran `telework_photo_notice_status =
 *   'draft'` **y** `telework_photo_notice_deleted_at IS NULL`: un borrador
 *   descartado no vuelve a aparecer.
 * - `findMaxVersion` usa `withTrashed()`: la versión nunca se reutiliza, ni
 *   siquiera tras descartar (CA-10; el UNIQUE de BD no filtra `deleted_at`).
 * - `listPublishedVersions` filtra `status = 'published'` y `deleted_at IS
 *   NULL`, y ordena por versión descendente.
 *
 * Nada se borra (C0129 R3, CA-17): no hay método que elimine ni que edite una
 * fila publicada; el borrador es lo único descartable, y por soft delete.
 */
export interface TeleworkPhotoNoticeRepository {
  /** Plantilla base global vigente (`telework_photo_notice_template_is_current = true`). No depende de la empresa. */
  findTemplateCurrent(): Promise<TeleworkPhotoNoticeTemplate | null>

  /** Borrador vivo de la empresa, a lo sumo uno; con el publicador precargado cuando exista. */
  findDraftByBusinessUnit(businessUnitId: number): Promise<TeleworkPhotoNotice | null>

  /** Igual que `findDraftByBusinessUnit`, con `.forUpdate()` dentro de la transacción de publicar (lock). */
  findDraftByBusinessUnitForUpdate(
    businessUnitId: number,
    trx: TransactionClientContract
  ): Promise<TeleworkPhotoNotice | null>

  /** Versión vigente publicada de la empresa (`is_current = true`), sin lock. */
  findCurrentByBusinessUnit(businessUnitId: number): Promise<TeleworkPhotoNotice | null>

  /** Igual que `findCurrentByBusinessUnit`, con `.forUpdate()` (invariante «una vigente por empresa»). */
  findCurrentByBusinessUnitForUpdate(
    businessUnitId: number,
    trx: TransactionClientContract
  ): Promise<TeleworkPhotoNotice | null>

  /** Apaga `is_current` de la versión que dejó de ser vigente (misma transacción de publicar). */
  clearCurrentFlag(
    teleworkPhotoNoticeId: number,
    businessUnitId: number,
    trx: TransactionClientContract
  ): Promise<void>

  /** Máxima versión ya usada por la empresa, incluyendo filas soft-deleted (nunca se reutiliza número). */
  findMaxVersion(businessUnitId: number): Promise<number>

  /** Razón social de la empresa, única fuente del valor del marcador `razon_social`. `null` si la empresa no existe. */
  findBusinessUnitLegalName(businessUnitId: number): Promise<string | null>

  /** Crea el borrador: `status = 'draft'`, `is_current = false`, sin sello ni fechas de publicación. */
  createDraft(data: CreateDraftData): Promise<TeleworkPhotoNotice>

  /** Actualiza título y contenido de un borrador existente. No valida estado ni alcance (lo hace el servicio). */
  updateDraft(
    teleworkPhotoNoticeId: number,
    businessUnitId: number,
    data: UpdateDraftData
  ): Promise<TeleworkPhotoNotice>

  /** Soft delete del borrador (descartar). Nunca borra la fila (CA-17). */
  softDeleteDraft(teleworkPhotoNoticeId: number, businessUnitId: number): Promise<void>

  /** Sella la versión como publicada y vigente (`status`/`is_current`/contenido resuelto/sello/publicador/fecha). */
  markAsPublished(
    teleworkPhotoNoticeId: number,
    businessUnitId: number,
    data: MarkAsPublishedData,
    trx: TransactionClientContract
  ): Promise<TeleworkPhotoNotice>

  /** Historial de versiones publicadas de la empresa, más reciente primero, con el publicador precargado. */
  listPublishedVersions(businessUnitId: number): Promise<TeleworkPhotoNotice[]>

  /** Acuses por versión de la empresa: `Map<teleworkPhotoNoticeId, total>`. Las versiones sin acuses no aparecen. */
  countAcknowledgementsByNotice(businessUnitId: number): Promise<Map<number, number>>

  /** ¿El colaborador acusó ESA versión del aviso? (acota por empresa, aviso y empleado). */
  hasAcknowledgement(
    businessUnitId: number,
    teleworkPhotoNoticeId: number,
    employeeId: number
  ): Promise<boolean>
}
