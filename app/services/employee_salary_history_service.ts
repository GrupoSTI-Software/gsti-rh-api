import { DateTime } from 'luxon'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import Employee from '#models/employee'
import EmployeeSalaryHistory from '#models/employee_salary_history'

export interface RegistrarCambioInput {
  employeeId: number
  salaryDaily: number
  changedBy: number
  reason?: string | null
}

export interface ServiceError {
  status: number
  key: string
  title: string
  message: string
}

export interface GetHistorySuccess {
  status: 200
  data: EmployeeSalaryHistory[]
}

export default class EmployeeSalaryHistoryService {
  /**
   * Registra un nuevo período en el histórico de salarios del empleado.
   * Si existe una versión vigente (valid_to = null) la cierra con valid_to = hoy
   * y crea una nueva fila a partir de hoy con el nuevo valor.
   * El cifrado lo maneja el modelo transparentemente.
   *
   * @param trx La del llamador: escribe dos filas y un rollback no debe dejar
   * historial huérfano (USRH1789698261612).
   */
  async registrarCambio(input: RegistrarCambioInput, trx?: TransactionClientContract): Promise<void> {
    const hoy = DateTime.now().toLocal().startOf('day')

    const vigente = await EmployeeSalaryHistory.query({ client: trx })
      .where('employee_id', input.employeeId)
      .whereNull('valid_to')
      .whereNull('employee_salary_history_deleted_at')
      .first()

    if (vigente) {
      vigente.validTo = hoy
      await vigente.save()
    }

    const nueva = new EmployeeSalaryHistory()
    nueva.employeeId = input.employeeId
    nueva.salaryDaily = input.salaryDaily
    nueva.validFrom = hoy
    nueva.validTo = null
    nueva.changedBy = input.changedBy
    nueva.reason = input.reason ?? null
    if (trx) nueva.useTransaction(trx)
    await nueva.save()
  }

  /**
   * Retorna el histórico de salarios de un empleado ordenado del más reciente
   * al más antiguo, con montos descifrados por el modelo.
   */
  async getHistory(employeeId: number): Promise<ServiceError | GetHistorySuccess> {
    const empleado = await Employee.query()
      .where('employee_id', employeeId)
      .withTrashed()
      .first()

    if (!empleado) {
      return {
        status: 404,
        key: 'empleado-no-encontrado',
        title: 'Empleado no encontrado',
        message: 'No existe ningún empleado con el ID indicado',
      }
    }

    const registros = await EmployeeSalaryHistory.query()
      .where('employee_id', employeeId)
      .whereNull('employee_salary_history_deleted_at')
      .preload('changedByUser')
      .orderBy('valid_from', 'desc')
      .orderBy('employee_salary_history_id', 'desc')

    return { status: 200, data: registros }
  }
}
