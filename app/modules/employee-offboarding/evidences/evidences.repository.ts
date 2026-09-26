import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import type EmployeeOffboarding from '#models/employee_offboarding'
import type EmployeeOffboardingItem from '#models/employee_offboarding_item'
import type EmployeeOffboardingItemEvidence from '#models/employee_offboarding_item_evidence'

/** Datos para insertar una evidencia (el servicio ya subió el archivo a S3). */
export interface EvidenceCreateData {
  employeeOffboardingItemId: number
  employeeOffboardingItemEvidenceFile: string
  employeeOffboardingItemEvidenceOriginalName: string | null
}

/**
 * Puerto de acceso a datos de las evidencias de salida (USRH1786568279593).
 * El adaptador MySQL es el ÚNICO que toca Lucid. El aislamiento va en tres
 * saltos (D-8): expediente por su `business_unit_id` snapshoteado EXPLÍCITO,
 * pendiente acotado por el expediente, evidencia acotada por el pendiente.
 * Ninguna consulta toca `employees` (regla 6).
 */
export interface EvidencesRepository {
  /**
   * Expediente vivo dentro del alcance de empresas, por su BU snapshoteado.
   * `null` = inexistente o fuera del alcance (404 uniforme).
   */
  findOffboardingInScope(
    employeeOffboardingId: number,
    businessUnitIds: number[]
  ): Promise<EmployeeOffboarding | null>

  /** Pendiente vivo acotado por el expediente; `null` = 404 uniforme. */
  findItemInCase(
    employeeOffboardingId: number,
    employeeOffboardingItemId: number
  ): Promise<EmployeeOffboardingItem | null>

  /** Evidencias vivas del pendiente, orden `created_at DESC, id DESC`. */
  listByItem(employeeOffboardingItemId: number): Promise<EmployeeOffboardingItemEvidence[]>

  /** Evidencia viva acotada por el pendiente; `null` = 404 uniforme. */
  findEvidenceInItem(
    employeeOffboardingItemId: number,
    employeeOffboardingItemEvidenceId: number
  ): Promise<EmployeeOffboardingItemEvidence | null>

  /** Inserta el envío completo dentro de la transacción (todo o nada, D-3). */
  createEvidences(
    rows: EvidenceCreateData[],
    trx: TransactionClientContract
  ): Promise<EmployeeOffboardingItemEvidence[]>

  /** Borrado lógico; el objeto de S3 se conserva (regla 5, D-5). */
  softDeleteEvidence(evidence: EmployeeOffboardingItemEvidence): Promise<void>
}
