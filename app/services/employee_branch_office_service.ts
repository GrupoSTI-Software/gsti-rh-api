import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { DateTime } from 'luxon'
import Employee from '#models/employee'
import EmployeeBranchOffice from '#models/employee_branch_office'
import BranchOffice from '#models/branch_office'
import BranchOfficeService from '#services/branch_office_service'

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
   * Asigna sucursal: desactiva la vigente, crea registro nuevo.
   * Si ya está asignado a la misma sucursal, no crea duplicado.
   */
  static async assign(employeeId: number, branchOfficeId: number) {
    const employee = await Employee.query().where('employeeId', employeeId).firstOrFail()

    const branch = await BranchOffice.query()
      .where('branchOfficeId', branchOfficeId)
      .whereNull('branch_office_deleted_at')
      .first()
    if (!branch) {
      throw new Error('Sucursal no encontrada')
    }

    const allowedIds = await BranchOfficeService.getAllowedBusinessUnitIds()
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
   * Desasigna: solo desactiva la asignación vigente (empleado queda sin sucursal activa).
   */
  static async unassign(employeeId: number) {
    await Employee.query().where('employeeId', employeeId).firstOrFail()

    await db.transaction(async (trx) => {
      await this.deactivateActiveAssignments(employeeId, trx)
    })

    return null
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
