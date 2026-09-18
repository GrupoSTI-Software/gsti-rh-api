import AircraftMaintenanceStatus from '#models/aircraft_maintenance_status'
import { GenericFilterSearchInterface } from '../interfaces/generic_filter_search_interface.js'
// Importa aquí otros modelos si necesitas verificar datos (ej. Customer, Pilot, etc.)

export default class AircraftMaintenanceStatusService {
  /**
   * Listado de reservations con paginación y/o filtros
   */
  async index(filters: GenericFilterSearchInterface) {
    const query = AircraftMaintenanceStatus.query()

    // Filtro de búsqueda opcional
    if (filters.search) {
      query.where('aircraft_maintenance_status_name', 'like', `%${filters.search}%`)
    }

    query.orderBy('aircraft_maintenance_status_name', 'asc')

    // Retorna la paginación
    const aircraftMaintenances = await query.paginate(filters.page, filters.limit)
    return aircraftMaintenances
  }
}
