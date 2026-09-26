import MaintenanceExpenseCategory from '#models/maintenance_expense_category'
import { GenericFilterSearchInterface } from '../interfaces/generic_filter_search_interface.js'

export default class MaintenanceExpenseCategoryService {
  /**
   * Retrieve all maintenance expense categories with optional filters and pagination.
   */
  async index(filters: GenericFilterSearchInterface) {
    const query = MaintenanceExpenseCategory.query()

    // Optional search filter
    if (filters.search) {
      query
        .where('maintenance_expense_category_name', 'like', `%${filters.search}%`)
        .orWhere('maintenance_expense_category_description', 'like', `%${filters.search}%`)
    }

    // Sorting by name
    query.orderBy('maintenance_expense_category_name', 'asc')

    // Returning paginated results
    const categories = await query.paginate(filters.page, filters.limit)
    return categories
  }
}
