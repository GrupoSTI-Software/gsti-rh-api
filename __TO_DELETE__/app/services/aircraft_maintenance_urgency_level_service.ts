import AircraftMaintenanceUrgencyLevel from '#models/maintenance_urgency_level'
import { GenericFilterSearchInterface } from '../interfaces/generic_filter_search_interface.js'
// Importa aquí otros modelos si necesitas verificar datos (ej. Customer, Pilot, etc.)

export default class AircraftMaintenanceUrgencyLevelService {
  /**
   * Listado de reservations con paginación y/o filtros
   */
  async index(filters: GenericFilterSearchInterface) {
    const query = AircraftMaintenanceUrgencyLevel.query()

    // Filtro de búsqueda opcional
    if (filters.search) {
      query
        .where('maintenance_urgency_level_name', 'like', `%${filters.search}%`)
        .orWhere('maintenance_urgency_level_description', 'like', `%${filters.search}%`)
    }

    // Ordena por la PK, por ejemplo:
    query.orderBy('maintenance_urgency_level_name', 'asc')

    // Retorna la paginación
    const aircraftMaintenances = await query.paginate(filters.page, filters.limit)
    return aircraftMaintenances
  }
}
