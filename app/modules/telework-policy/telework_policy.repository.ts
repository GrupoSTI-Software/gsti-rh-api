import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import type TeleworkPolicy from '#models/telework_policy'
import type TeleworkPolicyTemplate from '#models/telework_policy_template'
import type { TeleworkPolicyComponent } from '#models/telework_policy_template'

export interface CreateTeleworkPolicyData {
  businessUnitId: number
  version: number
  title: string
  components: TeleworkPolicyComponent[]
  createdByUserId: number
}

export interface UpdateTeleworkPolicyData {
  title: string
  components: TeleworkPolicyComponent[]
  updatedByUserId: number
}

export interface MarkAsPublishedData {
  publishedByUserId: number
  contentHash: string
}

export interface TeleworkPolicyRepository {
  /** Plantilla base global vigente (`is_current = true`). */
  findTemplateCurrent(): Promise<TeleworkPolicyTemplate | null>

  /** Fila activa (no eliminada) de la empresa — a lo sumo una en esta HU (solo draft). */
  findActiveByBusinessUnit(businessUnitId: number): Promise<TeleworkPolicy | null>

  /** Igual que `findActiveByBusinessUnit`, con `.forUpdate()` dentro de la transacción de publicar (lock). */
  findActiveByBusinessUnitForUpdate(
    businessUnitId: number,
    trx: TransactionClientContract
  ): Promise<TeleworkPolicy | null>

  /** Versión vigente publicada de la empresa (`is_current = true`), sin lock. */
  findCurrentByBusinessUnit(businessUnitId: number): Promise<TeleworkPolicy | null>

  /** Igual que `findCurrentByBusinessUnit`, con `.forUpdate()` (invariante "una vigente por empresa"). */
  findCurrentByBusinessUnitForUpdate(
    businessUnitId: number,
    trx: TransactionClientContract
  ): Promise<TeleworkPolicy | null>

  /** Apaga `is_current` de la versión que dejó de ser vigente (dentro de la misma transacción de publicar). */
  clearCurrentFlag(teleworkPolicyId: number, trx: TransactionClientContract): Promise<void>

  /** Máxima versión ya usada por la empresa, incluyendo filas soft-deleted (para nunca reutilizar número). */
  findMaxVersion(businessUnitId: number): Promise<number>

  /** Crea el borrador inicial (version = N, status = draft, is_current = false). */
  createDraft(data: CreateTeleworkPolicyData): Promise<TeleworkPolicy>

  /** Actualiza título/componentes de un borrador existente. No valida estado (lo hace el service). */
  updateDraft(teleworkPolicyId: number, data: UpdateTeleworkPolicyData): Promise<TeleworkPolicy>

  /** Soft delete del borrador (descartar). */
  softDeleteDraft(teleworkPolicyId: number): Promise<void>

  /** Sella la versión como publicada y vigente (status/is_current/content_hash/published_by/published_at). */
  markAsPublished(
    teleworkPolicyId: number,
    data: MarkAsPublishedData,
    trx: TransactionClientContract
  ): Promise<TeleworkPolicy>

  /** Historial de versiones de la empresa (no eliminadas), más reciente primero, con el publicador precargado. */
  listVersions(businessUnitId: number): Promise<TeleworkPolicy[]>
}
