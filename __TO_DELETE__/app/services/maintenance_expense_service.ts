import MaintenanceExpense from '#models/maintenance_expense'
import MaintenanceExpenseCategory from '#models/maintenance_expense_category'
import AircraftMaintenance from '#models/aircraft_maintenance'
import { GenericFilterSearchInterface } from '../interfaces/generic_filter_search_interface.js'

export default class MaintenanceExpenseService {
  /**
   * Listado de gastos con paginación y/o filtros
   */
  async index(filters: GenericFilterSearchInterface, aircraftMaintenanceId: number) {
    const query = MaintenanceExpense.query()

    // Filtro de búsqueda opcional
    if (filters.search) {
      query
        .whereHas('maintenanceExpenseCategory', (subQuery) => {
          subQuery
            .where('maintenance_expense_category_name', 'like', `%${filters.search}%`)
            .orWhere('maintenance_expense_category_description', 'like', `%${filters.search}%`)
        })
        .orWhere('maintenance_expense_tracking_number', 'like', `%${filters.search}%`)
        .orWhere('maintenance_expense_internal_folio', 'like', `%${filters.search}%`)
    }

    query.where('aircraft_maintenance_id', aircraftMaintenanceId)

    // Cargar relaciones
    query.preload('maintenanceExpenseCategory')
    query.preload('aircraftMaintenance')

    // Orden por fecha de creación
    query.orderBy('maintenanceExpenseCreatedAt', 'asc')

    // Paginación
    const maintenanceExpenses = await query.paginate(filters.page, filters.limit)
    return maintenanceExpenses
  }

  /**
   * Crear un nuevo gasto
   */
  async create(maintenanceExpense: MaintenanceExpense) {
    const newExpense = new MaintenanceExpense()
    newExpense.aircraftMaintenanceId = maintenanceExpense.aircraftMaintenanceId
    newExpense.maintenanceExpenseCategoryId = maintenanceExpense.maintenanceExpenseCategoryId
    newExpense.maintenanceExpenseAmount = maintenanceExpense.maintenanceExpenseAmount
    newExpense.maintenanceExpenseTicket = maintenanceExpense.maintenanceExpenseTicket
    newExpense.maintenanceExpenseTrackingNumber =
      maintenanceExpense.maintenanceExpenseTrackingNumber
    newExpense.maintenanceExpenseInternalFolio = maintenanceExpense.maintenanceExpenseInternalFolio

    await newExpense.save()
    return newExpense
  }

  /**
   * Actualizar un gasto existente
   */
  async update(currentExpense: MaintenanceExpense, updatedExpense: MaintenanceExpense) {
    currentExpense.aircraftMaintenanceId = updatedExpense.aircraftMaintenanceId
    currentExpense.maintenanceExpenseCategoryId = updatedExpense.maintenanceExpenseCategoryId
    currentExpense.maintenanceExpenseAmount = updatedExpense.maintenanceExpenseAmount
    currentExpense.maintenanceExpenseTicket = updatedExpense.maintenanceExpenseTicket
    currentExpense.maintenanceExpenseTrackingNumber =
      updatedExpense.maintenanceExpenseTrackingNumber
    currentExpense.maintenanceExpenseInternalFolio = updatedExpense.maintenanceExpenseInternalFolio

    await currentExpense.save()
    return currentExpense
  }

  /**
   * Eliminar (soft-delete) un gasto
   */
  async delete(currentExpense: MaintenanceExpense) {
    await currentExpense.delete()
    return currentExpense
  }

  /**
   * Mostrar un gasto por ID
   */
  async show(maintenanceExpenseId: number) {
    const expense = await MaintenanceExpense.query()
      .whereNull('maintenance_expense_deleted_at')
      .where('maintenance_expense_id', maintenanceExpenseId)
      .preload('maintenanceExpenseCategory')
      .preload('aircraftMaintenance')
      .first()

    return expense
  }

  /**
   * Verificar la información antes de crear o actualizar
   */
  async verifyInfo(expense: MaintenanceExpense) {
    // Verificar si el mantenimiento existe
    const aircraftMaintenance = await AircraftMaintenance.findOrFail(expense.aircraftMaintenanceId)
    if (!aircraftMaintenance) {
      return {
        status: 400,
        type: 'error',
        title: 'Aircraft Maintenance not found',
        message: 'The associated aircraft maintenance record does not exist.',
      }
    }

    // Verificar si la categoría de gasto existe
    const expenseCategory = await MaintenanceExpenseCategory.findOrFail(
      expense.maintenanceExpenseCategoryId
    )
    if (!expenseCategory) {
      return {
        status: 400,
        type: 'error',
        title: 'Expense Category not found',
        message: 'The expense category does not exist.',
      }
    }

    // Verificar que el monto no sea negativo
    if (expense.maintenanceExpenseAmount <= 0) {
      return {
        status: 400,
        type: 'error',
        title: 'Invalid amount',
        message: 'The expense amount must be greater than zero.',
      }
    }
    expense.maintenanceExpenseId = expense.maintenanceExpenseId || 0
    // Verificar que el folio de rastreo sea único
    const existingExpense = await MaintenanceExpense.query()
      .where('maintenance_expense_tracking_number', expense.maintenanceExpenseTrackingNumber)
      .whereNot('maintenance_expense_id', expense.maintenanceExpenseId)
      .whereNull('maintenance_expense_deleted_at')
      .first()

    if (existingExpense) {
      return {
        status: 400,
        type: 'error',
        title: 'Duplicate tracking number',
        message: 'An expense with this tracking number already exists.',
      }
    }

    // verificar que el folio interno no exista
    const existingInternalFolio = await MaintenanceExpense.query()
      .where('maintenance_expense_internal_folio', expense.maintenanceExpenseInternalFolio)
      .whereNot('maintenance_expense_id', expense.maintenanceExpenseId)
      .whereNull('maintenance_expense_deleted_at')
      .first()

    if (existingInternalFolio) {
      return {
        status: 400,
        type: 'error',
        title: 'Duplicate internal folio',
        message: 'An expense with this internal folio already exists.',
      }
    }

    return {
      status: 200,
      type: 'success',
      title: 'Info verified successfully',
      message: 'The expense data is valid.',
      data: { ...expense },
    }
  }
}
