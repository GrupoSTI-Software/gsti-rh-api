import { DateTime } from 'luxon'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import db from '@adonisjs/lucid/services/db'
import TeleworkPhotoNotice from '#models/telework_photo_notice'
import TeleworkPhotoNoticeTemplate from '#models/telework_photo_notice_template'
import type {
  CreateDraftData,
  MarkAsPublishedData,
  TeleworkPhotoNoticeRepository,
  UpdateDraftData,
} from './telework_photo_notice.repository.js'

/**
 * Adaptador MySQL del puerto del aviso de privacidad de la evidencia
 * fotográfica del puesto de trabajo (VLRH-H1791306079310). Misma mecánica que
 * `telework-policy/telework_policy.repository.mysql.ts` (`firstOrFail`,
 * `useTransaction`, `load('publisher', …)`, `$extras` del `max()`,
 * `withTrashed()`), con la desviación obligatoria del §7: **cada consulta
 * filtra `business_unit_id` explícito** además del mixin
 * `withBusinessUnitScope()`. El `business_unit_id` del WHERE es siempre el
 * que resolvió el middleware desde la sesión, nunca uno del body o del path
 * (anti-IDOR); por eso lo de otra empresa responde igual que lo inexistente.
 *
 * Las tres consultas transversales (acuses por versión, acuse puntual y razón
 * social) van por `db.from(...)`, el constructor crudo de Knex: no aplican
 * mixin de empresa y obligan a pasar el `business_unit_id` a mano, que es
 * justo lo que este adaptador quiere dejar escrito.
 */
export default class TeleworkPhotoNoticeRepositoryMysql implements TeleworkPhotoNoticeRepository {
  async findTemplateCurrent(): Promise<TeleworkPhotoNoticeTemplate | null> {
    // La plantilla es de plataforma (sin `business_unit_id` ni mixin): no se
    // filtra por empresa.
    return TeleworkPhotoNoticeTemplate.query()
      .where('telework_photo_notice_template_is_current', true)
      .first()
  }

  async findDraftByBusinessUnit(businessUnitId: number): Promise<TeleworkPhotoNotice | null> {
    return TeleworkPhotoNotice.query()
      .where('business_unit_id', businessUnitId)
      .where('telework_photo_notice_status', 'draft')
      .whereNull('telework_photo_notice_deleted_at')
      .orderBy('telework_photo_notice_version', 'desc')
      .preload('publisher', (userQuery) => userQuery.preload('person'))
      .first()
  }

  async findDraftByBusinessUnitForUpdate(
    businessUnitId: number,
    trx: TransactionClientContract
  ): Promise<TeleworkPhotoNotice | null> {
    return TeleworkPhotoNotice.query({ client: trx })
      .where('business_unit_id', businessUnitId)
      .where('telework_photo_notice_status', 'draft')
      .whereNull('telework_photo_notice_deleted_at')
      .orderBy('telework_photo_notice_version', 'desc')
      .forUpdate()
      .first()
  }

  async findCurrentByBusinessUnit(businessUnitId: number): Promise<TeleworkPhotoNotice | null> {
    return TeleworkPhotoNotice.query()
      .where('business_unit_id', businessUnitId)
      .where('telework_photo_notice_status', 'published')
      .where('telework_photo_notice_is_current', true)
      .preload('publisher', (userQuery) => userQuery.preload('person'))
      .first()
  }

  async findCurrentByBusinessUnitForUpdate(
    businessUnitId: number,
    trx: TransactionClientContract
  ): Promise<TeleworkPhotoNotice | null> {
    return TeleworkPhotoNotice.query({ client: trx })
      .where('business_unit_id', businessUnitId)
      .where('telework_photo_notice_is_current', true)
      .forUpdate()
      .first()
  }

  async clearCurrentFlag(
    teleworkPhotoNoticeId: number,
    businessUnitId: number,
    trx: TransactionClientContract
  ): Promise<void> {
    const record = await TeleworkPhotoNotice.query({ client: trx })
      .where('telework_photo_notice_id', teleworkPhotoNoticeId)
      .where('business_unit_id', businessUnitId)
      .firstOrFail()

    record.teleworkPhotoNoticeIsCurrent = false
    record.useTransaction(trx)
    await record.save()
  }

  async findMaxVersion(businessUnitId: number): Promise<number> {
    // `withTrashed()`: la versión nunca se reutiliza, ni siquiera tras
    // descartar (soft delete) un borrador — mantiene válido el
    // `unique(business_unit_id, telework_photo_notice_version)` de BD, que NO
    // filtra `deleted_at` (CA-10).
    const result = await TeleworkPhotoNotice.query()
      .where('business_unit_id', businessUnitId)
      .withTrashed()
      .max('telework_photo_notice_version as maxVersion')
      .first()

    // Los agregados (`max()`) de un model query builder viajan en `$extras`,
    // no como propiedad directa del modelo.
    const maxVersion = result?.$extras?.maxVersion as number | string | null | undefined
    return maxVersion ? Number(maxVersion) : 0
  }

  async findBusinessUnitLegalName(businessUnitId: number): Promise<string | null> {
    const row = (await db
      .from('business_units')
      .where('business_unit_id', businessUnitId)
      .select('business_unit_legal_name')
      .first()) as { business_unit_legal_name: string | null } | null

    return row?.business_unit_legal_name ?? null
  }

  async createDraft(data: CreateDraftData): Promise<TeleworkPhotoNotice> {
    const record = new TeleworkPhotoNotice()
    record.businessUnitId = data.businessUnitId
    record.teleworkPhotoNoticeTemplateId = data.templateId
    record.teleworkPhotoNoticeVersion = data.version
    record.teleworkPhotoNoticeTitle = data.title
    record.teleworkPhotoNoticeContent = data.content
    record.teleworkPhotoNoticeRenderedContent = null
    record.teleworkPhotoNoticeStatus = 'draft'
    record.teleworkPhotoNoticeIsCurrent = false
    record.teleworkPhotoNoticeContentHash = null
    record.createdByUserId = data.createdByUserId
    record.updatedByUserId = data.createdByUserId
    record.publishedByUserId = null
    record.publishedAt = null
    await record.save()

    return record
  }

  async updateDraft(
    teleworkPhotoNoticeId: number,
    businessUnitId: number,
    data: UpdateDraftData
  ): Promise<TeleworkPhotoNotice> {
    const record = await TeleworkPhotoNotice.query()
      .where('telework_photo_notice_id', teleworkPhotoNoticeId)
      .where('business_unit_id', businessUnitId)
      .firstOrFail()

    record.teleworkPhotoNoticeTitle = data.title
    record.teleworkPhotoNoticeContent = data.content
    record.updatedByUserId = data.updatedByUserId
    await record.save()

    return record
  }

  async softDeleteDraft(teleworkPhotoNoticeId: number, businessUnitId: number): Promise<void> {
    // Soft delete explícito (sin borrado físico): descartar el borrador marca
    // `telework_photo_notice_deleted_at` y la fila sigue ahí, porque su
    // versión ya quedó consumida (CA-17, CA-10).
    const record = await TeleworkPhotoNotice.query()
      .where('telework_photo_notice_id', teleworkPhotoNoticeId)
      .where('business_unit_id', businessUnitId)
      .firstOrFail()

    record.deletedAt = DateTime.now()
    await record.save()
  }

  async markAsPublished(
    teleworkPhotoNoticeId: number,
    businessUnitId: number,
    data: MarkAsPublishedData,
    trx: TransactionClientContract
  ): Promise<TeleworkPhotoNotice> {
    const record = await TeleworkPhotoNotice.query({ client: trx })
      .where('telework_photo_notice_id', teleworkPhotoNoticeId)
      .where('business_unit_id', businessUnitId)
      .firstOrFail()

    record.teleworkPhotoNoticeStatus = 'published'
    record.teleworkPhotoNoticeIsCurrent = true
    record.teleworkPhotoNoticeRenderedContent = data.renderedContent
    record.teleworkPhotoNoticeContentHash = data.contentHash
    record.publishedByUserId = data.publishedByUserId
    record.publishedAt = DateTime.now()
    record.useTransaction(trx)
    await record.save()
    await record.load('publisher', (userQuery) => userQuery.preload('person'))

    return record
  }

  async listPublishedVersions(businessUnitId: number): Promise<TeleworkPhotoNotice[]> {
    return TeleworkPhotoNotice.query()
      .where('business_unit_id', businessUnitId)
      .where('telework_photo_notice_status', 'published')
      .whereNull('telework_photo_notice_deleted_at')
      .preload('publisher', (userQuery) => userQuery.preload('person'))
      .orderBy('telework_photo_notice_version', 'desc')
  }

  async countAcknowledgementsByNotice(businessUnitId: number): Promise<Map<number, number>> {
    const rows = (await db
      .from('telework_photo_notice_acknowledgements')
      .where('business_unit_id', businessUnitId)
      .select('telework_photo_notice_id')
      .groupBy('telework_photo_notice_id')
      .count('* as total')) as Array<{
      telework_photo_notice_id: number | string
      total: number | string
    }>

    return new Map(
      rows.map((row) => [Number(row.telework_photo_notice_id), Number(row.total)] as const)
    )
  }

  async hasAcknowledgement(
    businessUnitId: number,
    teleworkPhotoNoticeId: number,
    employeeId: number
  ): Promise<boolean> {
    const row = await db
      .from('telework_photo_notice_acknowledgements')
      .where('business_unit_id', businessUnitId)
      .where('telework_photo_notice_id', teleworkPhotoNoticeId)
      .where('employee_id', employeeId)
      .select('telework_photo_notice_acknowledgement_id')
      .first()

    return Boolean(row)
  }
}
