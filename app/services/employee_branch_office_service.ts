import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { DateTime } from 'luxon'
import Employee from '#models/employee'
import EmployeeBranchOffice from '#models/employee_branch_office'
import BranchOffice from '#models/branch_office'

export default class EmployeeBranchOfficeService {
  /**
   * Desactiva todas las asignaciones activas del empleado (sin borrar filas).
   */
  private static async deactivateActiveAssignments(employeeId: number, trx: TransactionClientContract) {
    // Knex no serializa bien Luxon DateTime en .update() (provoca error "Unknown column '_zone'").
    const now = DateTime.now().toJSDate()
    await EmployeeBranchOffice.query({ client: trx })
      .where('employeeId', employeeId)
      .where('employeeBranchOfficeActive', 1)
      .update({
        employeeBranchOfficeActive: 0,
        employeeBranchOfficeDeactivatedAt: now,
        employeeBranchOfficeUpdatedAt: now,
      })
  }

  /**
   * ¿La asignación vigente es la que el alta puso sola, sin que nadie la viva?
   *
   * Lo es cuando apunta a la sucursal default de la empresa y el empleado no
   * tiene ninguna asignación anterior. Ese es el estado que deja el hook del
   * modelo entre el alta y el assign que manda el backoffice a continuación.
   */
  private static async isUntouchedDefaultAssignment(
    current: EmployeeBranchOffice,
    employee: Employee
  ): Promise<boolean> {
    const previous = await EmployeeBranchOffice.query()
      .where('employeeId', employee.employeeId)
      .where('employeeBranchOfficeActive', 0)
      .first()
    if (previous) return false

    const defaultBranch = await BranchOffice.query()
      .where('businessUnitId', employee.businessUnitId)
      .where('branchOfficeIsDefault', 1)
      .first()

    return defaultBranch?.branchOfficeId === current.branchOfficeId
  }

  /**
   * Asigna sucursal: desactiva la vigente, crea registro nuevo.
   * Si ya está asignado a la misma sucursal, no crea duplicado.
   */
  static async assign(employeeId: number, branchOfficeId: number, businessUnitScope: number[]) {
    const employee = await Employee.query().where('employeeId', employeeId).firstOrFail()

    const branch = await BranchOffice.query()
      .where('branchOfficeId', branchOfficeId)
      .whereNull('branch_office_deleted_at')
      .first()
    if (!branch) {
      throw new Error('Sucursal no encontrada')
    }

    const allowedIds = businessUnitScope
    if (allowedIds.length === 0 || !allowedIds.includes(branch.businessUnitId)) {
      throw new Error('Sucursal no disponible para esta instancia del sistema')
    }

    if (branch.businessUnitId !== employee.businessUnitId) {
      throw new Error('La sucursal debe pertenecer a la misma unidad de negocio del empleado')
    }

    const currentActive = await EmployeeBranchOffice.query()
      .where('employeeId', employeeId)
      .where('employeeBranchOfficeActive', 1)
      .first()

    if (currentActive && currentActive.branchOfficeId === branchOfficeId) {
      await currentActive.load('branchOffice')
      return currentActive
    }

    // El alta deja al empleado en la sucursal default (hook del modelo), y el
    // backoffice manda la sucursal elegida en el request siguiente. Si esa es
    // toda su historia, se reusa la fila: el empleado nunca estuvo en la
    // default, y un historial que dijera lo contrario mentiría.
    if (currentActive && (await this.isUntouchedDefaultAssignment(currentActive, employee))) {
      currentActive.branchOfficeId = branchOfficeId
      await currentActive.save()
      await currentActive.load('branchOffice')
      return currentActive
    }

    return await db.transaction(async (trx) => {
      await this.deactivateActiveAssignments(employeeId, trx)

      const created = await EmployeeBranchOffice.create(
        {
          employeeId,
          branchOfficeId,
          employeeBranchOfficeActive: 1,
          employeeBranchOfficeDeactivatedAt: null,
        },
        { client: trx }
      )
      await created.load('branchOffice')
      return created
    })
  }

  /**
   * Historial completo (activas e inactivas), más reciente primero.
   */
  static async getHistory(employeeId: number) {
    await Employee.query().where('employeeId', employeeId).firstOrFail()

    return await EmployeeBranchOffice.query()
      .where('employeeId', employeeId)
      .orderBy('employeeBranchOfficeId', 'desc')
      .preload('branchOffice', (q) => {
        q.withTrashed()
      })
  }
}
