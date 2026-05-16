import factory from '@adonisjs/lucid/factories'
import EmployeeBranchOffice from '#models/employee_branch_office'

/**
 * Asignación activa empleado ↔ sucursal.
 * Requiere `.merge({ employeeId, branchOfficeId })`.
 */
export const EmployeeBranchOfficeFactory = factory
  .define(EmployeeBranchOffice, () => {
    return {
      employeeId: 0,
      branchOfficeId: 0,
      employeeBranchOfficeActive: 1,
      employeeBranchOfficeDeactivatedAt: null,
    }
  })
  .build()
