import ExceptionType from '#models/exception_type'
import { ExceptionTypeFilterSearchInterface } from '../interfaces/exception_type_filter_search_interface.js'

export default class ExceptionTypeService {
  /**
   * Lista paginada de tipos de excepción.
   *
   * @param filters Filtros de búsqueda (search, onlyActive, page, limit).
   * @param restrictToEmployeeRequestable Cuando es `true`, acota la lista a
   *  los tipos que las empleadas pueden solicitar directamente
   *  (`exception_type_can_employee_requests = 1`). Lo activa el controller
   *  sólo para roles `employee`/`employee-sae`; los roles administrativos
   *  reciben la lista completa.
   */
  async index(
    filters: ExceptionTypeFilterSearchInterface,
    restrictToEmployeeRequestable: boolean
  ) {
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
      .if(restrictToEmployeeRequestable, (query) => {


        query.where('exception_type_can_employee_requests', 1)
      })
      .orderBy('exception_type_id')
      .paginate(filters.page, filters.limit)
    return exceptionTypes
  }
}
