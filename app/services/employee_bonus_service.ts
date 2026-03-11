import EmployeeBonus from '#models/employee_bonus'
import { EmployeeBonusFilterSearchInterface } from '../interfaces/employee_bonus_filter_search_interface.js'
import { I18n } from '@adonisjs/i18n'
import { DateTime } from 'luxon'

export default class EmployeeBonusService {
  private t: (key: string, params?: { [key: string]: string | number }) => string

  constructor(i18n: I18n) {
    this.t = i18n.formatMessage.bind(i18n)
  }

  async index(filters: EmployeeBonusFilterSearchInterface) {
    const selectedColumns = [
      'employee_bonus_id',
      'employee_id',
      'employee_bonus_concept',
      'employee_bonus_quantity',
      'employee_bonus_unit_amount',
      'employee_bonus_total',
      'employee_bonus_assignment_date',
      'employee_bonus_payment_date',
      'employee_bonus_created_at',
    ]
    const bonuses = await EmployeeBonus.query()
      .whereNull('employee_bonus_deleted_at')
      .where('employee_id', filters.employeeId)
      .if(filters.search, (query) => {
        query.whereRaw('UPPER(employee_bonus_concept) LIKE ?', [
          `%${filters.search!.toUpperCase()}%`,
        ])
      })
      .select(selectedColumns)
      .orderBy('employee_bonus_payment_date', 'desc')
      .paginate(filters.page, filters.limit)

    return bonuses
  }

  async create(bonus: EmployeeBonus) {
    const newBonus = new EmployeeBonus()
    newBonus.employeeId = bonus.employeeId
    newBonus.employeeBonusConcept = bonus.employeeBonusConcept
    newBonus.employeeBonusQuantity = bonus.employeeBonusQuantity
    newBonus.employeeBonusUnitAmount = bonus.employeeBonusUnitAmount
    newBonus.employeeBonusTotal = bonus.employeeBonusTotal
    newBonus.employeeBonusAssignmentDate = bonus.employeeBonusAssignmentDate
    newBonus.employeeBonusPaymentDate = bonus.employeeBonusPaymentDate
    await newBonus.save()
    return newBonus
  }

  async update(currentBonus: EmployeeBonus, bonus: EmployeeBonus) {
    currentBonus.employeeBonusConcept = bonus.employeeBonusConcept
    currentBonus.employeeBonusQuantity = bonus.employeeBonusQuantity
    currentBonus.employeeBonusUnitAmount = bonus.employeeBonusUnitAmount
    currentBonus.employeeBonusTotal = bonus.employeeBonusTotal
    currentBonus.employeeBonusAssignmentDate = bonus.employeeBonusAssignmentDate
    currentBonus.employeeBonusPaymentDate = bonus.employeeBonusPaymentDate
    await currentBonus.save()
    return currentBonus
  }

  async delete(currentBonus: EmployeeBonus) {
    await currentBonus.delete()
    return currentBonus
  }

  async show(employeeBonusId: number) {
    const bonus = await EmployeeBonus.query()
      .whereNull('employee_bonus_deleted_at')
      .where('employee_bonus_id', employeeBonusId)
      .first()
    return bonus ? bonus : null
  }

  /**
   * Obtiene los conceptos únicos usados en bonificaciones de un empleado
   * para el auto catálogo del formulario.
   */
  async getConceptsByEmployee(employeeId: number) {
    const results = await EmployeeBonus.query()
      .whereNull('employee_bonus_deleted_at')
      .where('employee_id', employeeId)
      .select('employee_bonus_concept')
      .groupBy('employee_bonus_concept')
      .orderBy('employee_bonus_concept', 'asc')

    return results.map((r) => r.employeeBonusConcept)
  }

  /**
   * Verifica si la fecha de pago ya venció (es hoy o anterior).
   * Retorna true si la bonificación NO puede ser modificada/eliminada.
   */
  isPaymentDateExpired(paymentDate: DateTime | string): boolean {
    const today = DateTime.now().startOf('day')
    const payDate =
      paymentDate instanceof DateTime
        ? paymentDate.startOf('day')
        : DateTime.fromISO(paymentDate as string).startOf('day')
    return payDate <= today
  }
}
