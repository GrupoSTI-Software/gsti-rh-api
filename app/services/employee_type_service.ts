import EmployeeType from '#models/employee_type'
import { EmployeeTypeFilterSearchInterface } from '../interfaces/employee_type_filter_search_interface.js'

export default class EmployeeTypeService {
  async index(filters: EmployeeTypeFilterSearchInterface) {
    const roles = await EmployeeType.query()
      .if(filters.search, (query) => {
        query.whereRaw('UPPER(employee_type_name) LIKE ?', [
          `%${filters.search.toUpperCase()}%`,
        ])
        query.orWhereRaw('UPPER(employee_type_slug) LIKE ?', [`%${filters.search.toUpperCase()}%`])
      })
      .orderBy('employee_type_id')
      .paginate(filters.page, filters.limit)
    return roles
  }
}
