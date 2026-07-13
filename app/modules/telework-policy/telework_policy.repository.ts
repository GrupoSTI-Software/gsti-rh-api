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

export interface TeleworkPolicyRepository {
  /** Plantilla base global vigente (`is_current = true`). */
  findTemplateCurrent(): Promise<TeleworkPolicyTemplate | null>

  /** Fila activa (no eliminada) de la empresa — a lo sumo una en esta HU (solo draft). */
  findActiveByBusinessUnit(businessUnitId: number): Promise<TeleworkPolicy | null>

  /** Máxima versión ya usada por la empresa, incluyendo filas soft-deleted (para nunca reutilizar número). */
  findMaxVersion(businessUnitId: number): Promise<number>

  /** Crea el borrador inicial (version = N, status = draft, is_current = false). */
  createDraft(data: CreateTeleworkPolicyData): Promise<TeleworkPolicy>

  /** Actualiza título/componentes de un borrador existente. No valida estado (lo hace el service). */
  updateDraft(teleworkPolicyId: number, data: UpdateTeleworkPolicyData): Promise<TeleworkPolicy>

  /** Soft delete del borrador (descartar). */
  softDeleteDraft(teleworkPolicyId: number): Promise<void>
}
