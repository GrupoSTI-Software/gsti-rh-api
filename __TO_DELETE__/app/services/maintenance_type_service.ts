import MaintenanceType from '#models/maintenance_type'
import { GenericFilterSearchInterface } from '../interfaces/generic_filter_search_interface.js'
// Importa aquí otros modelos si necesitas verificar datos (ej. Customer, Pilot, etc.)

export default class MaintenanceTypeService {
  /**
   * Listado de reservations con paginación y/o filtros
   */
  async index(filters: GenericFilterSearchInterface) {
    const query = MaintenanceType.query()

    // Filtro de búsqueda opcional
    if (filters.search) {
      query
        .where('maintenance_type_name', 'like', `%${filters.search}%`)
        .orWhere('maintenance_type_description', 'like', `%${filters.search}%`)
    }

    query.orderBy('maintenance_type_name', 'asc')

    // Retorna la paginación
    const aircraftMaintenances = await query.paginate(filters.page, filters.limit)
    return aircraftMaintenances
  }
}
