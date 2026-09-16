import Aircraft from '#models/aircraft'
import AircraftMaintenance from '#models/aircraft_maintenance'
import AircraftMaintenanceStatus from '#models/aircraft_maintenance_status'
import AircraftMaintenanceUrgencyLevel from '#models/maintenance_urgency_level'
import MaintenanceType from '#models/maintenance_type'
import { GenericFilterSearchInterface } from '../interfaces/generic_filter_search_interface.js'
// Importa aquí otros modelos si necesitas verificar datos (ej. Customer, Pilot, etc.)

export default class AircraftMaintenanceService {
  private t: (key: string,params?: { [key: string]: string | number }) => string

  constructor(i18n: any) {
    this.t = i18n.formatMessage.bind(i18n)
  }
  /**
   * Listado de reservations con paginación y/o filtros
   */
  async index(
    filters: GenericFilterSearchInterface,
    aircraftId: number,
    startDate: Date,
    endDate: Date
  ) {
    const query = AircraftMaintenance.query()

    // Filtro de búsqueda opcional
    if (filters.search) {
      query
        .whereHas('maintenanceType', (subQuery) => {
          subQuery
            .where('maintenance_type_name', 'like', `%${filters.search}%`)
            .orWhere('maintenance_type_description', 'like', `%${filters.search}%`)
        })
        .orWhereHas('aircraft', (subQuery) => {
          subQuery.where('aircraft_serial_number', 'like', `%${filters.search}%`)
        })
        .orWhereHas('maintenanceUrgencyLevel', (subQuery) => {
          subQuery
            .where('maintenance_urgency_level_name', 'like', `%${filters.search}%`)
            .orWhere('maintenance_urgency_level_description', 'like', `%${filters.search}%`)
        })
    }
    query.where('aircraft_id', aircraftId).where((_query) => {
      _query
        .whereBetween('aircraft_maintenance_start_date', [startDate, endDate])
        .orWhereBetween('aircraft_maintenance_end_date', [startDate, endDate])
    })

    query.preload('aircraft', (queryCustomer) => {
      queryCustomer.preload('aircraftProperty')
    })
    query.preload('maintenanceUrgencyLevel')
    query.preload('aircraftMaintenanceStatus')
    query.preload('maintenanceType')

    // Ordena por la PK, por ejemplo:
    query.orderBy('aircraftMaintenanceStartDate', 'asc')

    // Retorna la paginación
    const aircraftMaintenances = await query.paginate(filters.page, filters.limit)
    return aircraftMaintenances
  }

  /**
   * Crear nueva reservation
   */
  async create(aircraftMaintenance: AircraftMaintenance) {
    const newAircraftMaintenance = new AircraftMaintenance()
    newAircraftMaintenance.aircraftId = aircraftMaintenance.aircraftId
    newAircraftMaintenance.maintenanceTypeId = aircraftMaintenance.maintenanceTypeId
    newAircraftMaintenance.aircraftMaintenanceStartDate =
      aircraftMaintenance.aircraftMaintenanceStartDate
    newAircraftMaintenance.aircraftMaintenanceEndDate =
      aircraftMaintenance.aircraftMaintenanceEndDate
    newAircraftMaintenance.maintenanceUrgencyLevelId = aircraftMaintenance.maintenanceUrgencyLevelId
    newAircraftMaintenance.aircraftMaintenanceStatusId =
      aircraftMaintenance.aircraftMaintenanceStatusId
    newAircraftMaintenance.aircraftMaintenanceNotes = aircraftMaintenance.aircraftMaintenanceNotes
    await newAircraftMaintenance.save()
    return newAircraftMaintenance
  }

  /**
   * Actualizar reservation existente
   */
  async update(
    currentAircraftMaintenance: AircraftMaintenance,
    aircraftMaintenance: AircraftMaintenance
  ) {
    currentAircraftMaintenance.aircraftId = aircraftMaintenance.aircraftId
    currentAircraftMaintenance.maintenanceTypeId = aircraftMaintenance.maintenanceTypeId
    currentAircraftMaintenance.aircraftMaintenanceStartDate =
      aircraftMaintenance.aircraftMaintenanceStartDate
    currentAircraftMaintenance.aircraftMaintenanceEndDate =
      aircraftMaintenance.aircraftMaintenanceEndDate
    currentAircraftMaintenance.maintenanceUrgencyLevelId =
      aircraftMaintenance.maintenanceUrgencyLevelId
    currentAircraftMaintenance.aircraftMaintenanceStatusId =
      aircraftMaintenance.aircraftMaintenanceStatusId
    currentAircraftMaintenance.aircraftMaintenanceNotes =
      aircraftMaintenance.aircraftMaintenanceNotes
    currentAircraftMaintenance.aircraftMaintenanceFinishDate =
      aircraftMaintenance.aircraftMaintenanceFinishDate
    await currentAircraftMaintenance.save()
    return currentAircraftMaintenance
  }

  /**
   * Eliminar (soft-delete) la reservation
   */
  async delete(currentAircraftMaintenance: AircraftMaintenance) {
    await currentAircraftMaintenance.delete()
    return currentAircraftMaintenance
  }

  /**
   * Mostrar una reservation por ID
   */
  async show(currentAircraftMaintenanceId: number) {
    const aircraftMaintenance = await AircraftMaintenance.query()
      .whereNull('aircraft_maintenance_deleted_at')
      .where('aircraft_maintenance_id', currentAircraftMaintenanceId)
      .preload('aircraft', (queryCustomer) => {
        queryCustomer.preload('aircraftProperty')
      })
      .preload('maintenanceUrgencyLevel')
      .preload('aircraftMaintenanceStatus')
      .preload('maintenanceType')
      .first()
    return aircraftMaintenance
  }

  /**
   * Verificar información básica antes de crear/actualizar
   * (Por ejemplo, si el `reservationUuid` ya está en uso)
   */
  async verifyInfo(aircraftMaintenance: AircraftMaintenance, aircraftMaintenanceId: number) {
    // Aquí podrías verificar si la FK customerId existe, etc.
    // O si existe el pilotPicId, pilotSicId, etc.
    // verify that the customer exists
    const aircraft = await Aircraft.query()
      .whereNull('aircraft_deleted_at')
      .where('aircraft_id',aircraftMaintenance.aircraftId)
      .first()
    if (!aircraft) {
      const entity = this.t('aircraft')
      return {
        status: 400,
        type: 'error',
        title: this.t('entity_was_not_found', { entity }),
        message: this.t('entity_was_not_found', { entity }),
      }
    }

    // verify that the pilotPic exists
    const maintenanceType = await MaintenanceType.query()
      .whereNull('maintenance_type_deleted_at')
      .where('maintenance_type_id',aircraftMaintenance.maintenanceTypeId).first()
    if (!maintenanceType) {
      const entity = this.t('maintenance_type')
      return {
        status: 400,
        type: 'error',
        title: this.t('entity_was_not_found', { entity }),
        message: this.t('entity_was_not_found', { entity }),
      }
    }
    // verify that the pilotSic exists
    const aircraftMaintenanceStatus = await AircraftMaintenanceStatus.query()
      .whereNull('aircraft_maintenance_status_deleted_at')
      .where('aircraft_maintenance_status_id',aircraftMaintenance.aircraftMaintenanceStatusId)
      .first()
    if (!aircraftMaintenanceStatus) {
      const entity = this.t('aircraft_maintenance_status')
      return {
        status: 400,
        type: 'error',
        title: this.t('entity_was_not_found', { entity }),
        message: this.t('entity_was_not_found', { entity }),
      }
    }

    // verify that the flightAttendant exists
    const aircraftMaintenanceUrgencyLevel = await AircraftMaintenanceUrgencyLevel.query()
      .whereNull('maintenance_urgency_level_deleted_at')
      .where('maintenance_urgency_level_id',aircraftMaintenance.maintenanceUrgencyLevelId)
      .first()
    if (!aircraftMaintenanceUrgencyLevel) {
      const entity = this.t('aircraft_maintenance_urgency_level')
      return {
        status: 400,
        type: 'error',
        title: this.t('entity_was_not_found', { entity }),
        message: this.t('entity_was_not_found', { entity }),
      }
    }

    // verify that aircraftMaintenanceStartDate is before aircraftMaintenanceEndDate
    if (
      aircraftMaintenance.aircraftMaintenanceStartDate >
      aircraftMaintenance.aircraftMaintenanceEndDate
    ) {
      return {
        status: 400,
        type: 'error',
        title: this.t('start_date_is_after_end_date'),
        message: this.t('start_date_is_after_end_date'),
      }
    }
    let dateStartString = aircraftMaintenance.aircraftMaintenanceStartDate.toString()
    // replace time
    // dateStartString = dateStartString.split(' ')[0]
    let dateEndString = aircraftMaintenance.aircraftMaintenanceEndDate.toString()
    // replace time
    // dateEndString = dateEndString.split(' ')[0]
    // verify that not exist other maintenance in the same date
    const maintenance = await AircraftMaintenance.query()
      .where('aircraft_id', aircraftMaintenance.aircraftId)
      .where('aircraft_maintenance_start_date', '<=', dateEndString)
      .where('aircraft_maintenance_end_date', '>=', dateStartString)
      .whereNull('aircraft_maintenance_deleted_at')
      .whereNot('aircraft_maintenance_id', aircraftMaintenanceId)
      .first()

    if (maintenance) {
      return {
        status: 400,
        type: 'error',
        title: this.t('already_exist_maintenance_in_the_same_date'),
        message: this.t('already_exist_maintenance_in_the_same_date'),
      }
    }

    return {
      status: 200,
      type: 'success',
      title: this.t('info_verify_successfully'),
      message: this.t('info_verify_successfully'),
      data: { ...aircraftMaintenance },
    }
  }
}
