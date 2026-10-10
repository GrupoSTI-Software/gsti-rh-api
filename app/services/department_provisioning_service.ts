import type { I18n } from '@adonisjs/i18n'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import Department from '#models/department'
import DepartmentService from '#services/department_service'
import { DEFAULT_DEPARTMENT_CODE, DEFAULT_DEPARTMENT_NAME } from '#constants/department'

/**
 * Departamento raíz de una empresa nueva ("Dirección General").
 *
 * Se siembra en los dos caminos por los que nace una empresa —alta
 * self-service (`SignupDraftService.complete`) y alta de empresa adicional
 * (`AdditionalBusinessUnitService`)— dentro de su transacción, después de
 * aprovisionar los roles del tenant para que el departamento quede asignado a
 * ellos. Mismo criterio que `BranchOfficeProvisioningService`.
 *
 * Solo empresas nuevas: no es un backfill y no toca empresas existentes.
 */
export default class DepartmentProvisioningService {
  /**
   * Devuelve el departamento default vivo de la empresa, creándolo si no lo hay.
   *
   * Idempotente: si la empresa ya tiene un departamento marcado como default,
   * lo devuelve sin crear otro.
   *
   * @param businessUnitId Empresa recién creada.
   * @param trx Transacción del alta; el departamento y su asignación a roles
   *            se revierten con ella si el alta falla.
   */
  static async ensureDefault(
    businessUnitId: number,
    trx: TransactionClientContract
  ): Promise<Department> {
    const current = await Department.query({ client: trx })
      .where('businessUnitId', businessUnitId)
      .where('departmentIsDefault', true)
      .whereNull('department_deleted_at')
      .first()
    if (current) {
      return current
    }

    const department = new Department()
    department.departmentCode = DEFAULT_DEPARTMENT_CODE
    department.departmentName = DEFAULT_DEPARTMENT_NAME
    department.departmentIsDefault = true
    department.departmentActive = 1
    department.parentDepartmentId = null
    department.businessUnitId = businessUnitId

    // El alta y la asignación a roles no traducen nada: basta un i18n mínimo, mismo criterio que
    // `BusinessUnitService` en `AdditionalBusinessUnitService`.
    const departmentService = new DepartmentService({ formatMessage: (key: string) => key } as unknown as I18n)
    return departmentService.createWithRoleAssignment(department, trx)
  }
}
