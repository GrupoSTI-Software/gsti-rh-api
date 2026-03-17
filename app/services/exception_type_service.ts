import ExceptionType from '#models/exception_type'
import { ExceptionTypeFilterSearchInterface } from '../interfaces/exception_type_filter_search_interface.js'

export default class ExceptionTypeService {
  async index(filters: ExceptionTypeFilterSearchInterface, canEmployeeRequests: boolean) {
    const exceptionTypes = await ExceptionType.query()
      .if(filters.search, (query) => {
        query.whereRaw('UPPER(exception_type_type_name) LIKE ?', [
          `%${filters.search.toUpperCase()}%`,
        ])
        query.orWhereRaw('UPPER(exception_type_slug) LIKE ?', [`%${filters.search.toUpperCase()}%`])
      })
      .if(
        filters.onlyActive && (filters.onlyActive === 'true' || filters.onlyActive === true),
        (query) => {
          query.where('exception_type_active', 1)
        }
      )
      .if(canEmployeeRequests, (query) => {
        query.where('exception_type_can_employee_requests', 1)
      })
      .orderBy('exception_type_id')
      .paginate(filters.page, filters.limit)
    return exceptionTypes
  }
}
