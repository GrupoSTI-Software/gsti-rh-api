import { DateTime } from 'luxon'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import TeleworkPolicy from '#models/telework_policy'
import TeleworkPolicyTemplate from '#models/telework_policy_template'
import type {
  CreateTeleworkPolicyData,
  MarkAsPublishedData,
  TeleworkPolicyRepository,
  UpdateTeleworkPolicyData,
} from './telework_policy.repository.js'

export default class TeleworkPolicyRepositoryMysql implements TeleworkPolicyRepository {
  async findTemplateCurrent(): Promise<TeleworkPolicyTemplate | null> {
    return TeleworkPolicyTemplate.query()
      .where('telework_policy_template_is_current', true)
      .first()
  }

  /**
   * `businessUnitId` sigue siendo el parámetro con el que el caller pide "la
   * política de ESTA empresa" (regla de negocio: a lo sumo un borrador
   * activo por empresa). El `where('business_unit_id', businessUnitId)`
   * manual se retiró (USRH1784259058567): `TeleworkPolicy` ya compone
   * `withBusinessUnitScope()`, y `businessUnitId` aquí siempre es
   * exactamente la única unidad activa en `TenantContext`
   * (`business_unit_scope_middleware.ts` resuelve `TenantContext.run([requestedId], ...)`
   * — un solo elemento, jamás una lista de varias empresas) — el mixin
   * produce el mismo resultado sin el filtro manual.
   */
  async findActiveByBusinessUnit(_businessUnitId: number): Promise<TeleworkPolicy | null> {
    return TeleworkPolicy.query()
      .whereNull('telework_policy_deleted_at')
      .orderBy('telework_policy_version', 'desc')
      .preload('publisher', (userQuery) => userQuery.preload('person'))
      .first()
  }

  async findActiveByBusinessUnitForUpdate(
    _businessUnitId: number,
    trx: TransactionClientContract
  ): Promise<TeleworkPolicy | null> {
    return TeleworkPolicy.query({ client: trx })
      .whereNull('telework_policy_deleted_at')
      .orderBy('telework_policy_version', 'desc')
      .forUpdate()
      .first()
  }

  async findCurrentByBusinessUnit(_businessUnitId: number): Promise<TeleworkPolicy | null> {
    return TeleworkPolicy.query()
      .where('telework_policy_is_current', true)
      .preload('publisher', (userQuery) => userQuery.preload('person'))
      .first()
  }

  async findCurrentByBusinessUnitForUpdate(
    _businessUnitId: number,
    trx: TransactionClientContract
  ): Promise<TeleworkPolicy | null> {
    return TeleworkPolicy.query({ client: trx })
      .where('telework_policy_is_current', true)
      .forUpdate()
      .first()
  }

  async clearCurrentFlag(teleworkPolicyId: number, trx: TransactionClientContract): Promise<void> {
    const record = await TeleworkPolicy.query({ client: trx })
      .where('telework_policy_id', teleworkPolicyId)
      .firstOrFail()

    record.teleworkPolicyIsCurrent = false
    record.useTransaction(trx)
    await record.save()
  }

  async findMaxVersion(_businessUnitId: number): Promise<number> {
    // `withTrashed()`: la versión nunca se reutiliza, ni siquiera tras
    // descartar (soft delete) un borrador — mantiene válido el
    // `unique(business_unit_id, telework_policy_version)` de BD.
    const result = await TeleworkPolicy.query()
      .withTrashed()
      .max('telework_policy_version as maxVersion')
      .first()

    // Los agregados (`max()`) de un model query builder viajan en `$extras`,
    // no como propiedad directa del modelo.
    const maxVersion = result?.$extras?.maxVersion as number | string | null | undefined
    return maxVersion ? Number(maxVersion) : 0
  }

  async createDraft(data: CreateTeleworkPolicyData): Promise<TeleworkPolicy> {
    const record = new TeleworkPolicy()
    record.businessUnitId = data.businessUnitId
    record.teleworkPolicyVersion = data.version
    record.teleworkPolicyTitle = data.title
    record.teleworkPolicyComponents = data.components
    record.teleworkPolicyStatus = 'draft'
    record.teleworkPolicyIsCurrent = false
    record.teleworkPolicyContentHash = null
    record.createdByUserId = data.createdByUserId
    record.updatedByUserId = data.createdByUserId
    record.publishedByUserId = null
    record.publishedAt = null
    await record.save()

    return record
  }

  async updateDraft(
    teleworkPolicyId: number,
    data: UpdateTeleworkPolicyData
  ): Promise<TeleworkPolicy> {
    const record = await TeleworkPolicy.query()
      .where('telework_policy_id', teleworkPolicyId)
      .firstOrFail()

    record.teleworkPolicyTitle = data.title
    record.teleworkPolicyComponents = data.components
    record.updatedByUserId = data.updatedByUserId
    await record.save()

    return record
  }

  async softDeleteDraft(teleworkPolicyId: number): Promise<void> {
    const record = await TeleworkPolicy.query()
      .where('telework_policy_id', teleworkPolicyId)
      .firstOrFail()

    await record.delete()
  }

  async markAsPublished(
    teleworkPolicyId: number,
    data: MarkAsPublishedData,
    trx: TransactionClientContract
  ): Promise<TeleworkPolicy> {
    const record = await TeleworkPolicy.query({ client: trx })
      .where('telework_policy_id', teleworkPolicyId)
      .firstOrFail()

    record.teleworkPolicyStatus = 'published'
    record.teleworkPolicyIsCurrent = true
    record.teleworkPolicyContentHash = data.contentHash
    record.publishedByUserId = data.publishedByUserId
    record.publishedAt = DateTime.now()
    record.useTransaction(trx)
    await record.save()
    await record.load('publisher', (userQuery) => userQuery.preload('person'))

    return record
  }

  async listVersions(_businessUnitId: number): Promise<TeleworkPolicy[]> {
    return TeleworkPolicy.query()
      .whereNull('telework_policy_deleted_at')
      .preload('publisher', (userQuery) => userQuery.preload('person'))
      .orderBy('telework_policy_version', 'desc')
  }
}
