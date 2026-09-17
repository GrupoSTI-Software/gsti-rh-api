// app/Services/AircraftOperatorService.ts (o donde lo manejes)
import AircraftOperator from '#models/aircraft_operator'
import { AircraftOperatorFilterSearchInterface } from '../interfaces/aircraft_operator_filter_search_interface.js'

export default class AircraftOperatorService {
  /**
   * Lista de operadores con filtros básicos de búsqueda y paginación.
   */
  async index(filters: AircraftOperatorFilterSearchInterface) {
    const query = AircraftOperator.query().whereNull('aircraft_operator_deleted_at')

    // Filtro por texto (ejemplo: buscar por nombre)
    if (filters.search) {
      query.where((subQuery) => {
        subQuery.whereRaw('UPPER(aircraft_operator_name) LIKE ?', [
          `%${filters.search.toUpperCase()}%`,
        ])
        subQuery.orWhereRaw('UPPER(aircraft_operator_fiscal_name) LIKE ?', [
          `%${filters.search.toUpperCase()}%`,
        ])
      })
    }

    const operators = await query
      .orderBy('aircraft_operator_id')
      .paginate(filters.page, filters.limit)

    return operators
  }

  /**
   * Crea un nuevo operador.
   */
  async create(data: AircraftOperator) {
    const newOperator = new AircraftOperator()
    newOperator.aircraftOperatorName = data.aircraftOperatorName
    newOperator.aircraftOperatorFiscalName = data.aircraftOperatorFiscalName
    newOperator.aircraftOperatorImage = data.aircraftOperatorImage
    newOperator.aircraftOperatorSlug = data.aircraftOperatorSlug
    newOperator.aircraftOperatorActive = data.aircraftOperatorActive ?? true

    await newOperator.save()
    return newOperator
  }

  /**
   * Retorna un operador según su ID. Retorna `null` si no lo encuentra.
   */
  async show(aircraftOperatorId: number) {
    const operator = await AircraftOperator.query()
      .whereNull('aircraft_operator_deleted_at')
      .where('aircraft_operator_id', aircraftOperatorId)
      .first()

    return operator || null
  }

  /**
   * Actualiza un operador (registro ya cargado) con nuevos datos.
   */
  async update(currentOperator: AircraftOperator, data: AircraftOperator) {
    currentOperator.aircraftOperatorName =
      data.aircraftOperatorName ?? currentOperator.aircraftOperatorName
    currentOperator.aircraftOperatorFiscalName =
      data.aircraftOperatorFiscalName ?? currentOperator.aircraftOperatorFiscalName
    currentOperator.aircraftOperatorImage =
      data.aircraftOperatorImage ?? currentOperator.aircraftOperatorImage
    currentOperator.aircraftOperatorSlug =
      data.aircraftOperatorSlug ?? currentOperator.aircraftOperatorSlug
    currentOperator.aircraftOperatorActive =
      data.aircraftOperatorActive ?? currentOperator.aircraftOperatorActive

    await currentOperator.save()
    return currentOperator
  }

  /**
   * Elimina (soft delete) un operador.
   */
  async delete(currentOperator: AircraftOperator) {
    await currentOperator.delete()
    return currentOperator
  }

  /**
   * Ejemplo de verificación de info
   * (similar a tu CustomerService.verifyInfo).
   * Ajusta según la lógica de negocio que necesites.
   */
  async verifyInfo(data: AircraftOperator) {
    // Lógica para verificar que los datos sean correctos.
    const existName = await AircraftOperator.query()
      .if(data.aircraftOperatorId > 0, (query) => {
        // Si es una actualización, no considerar el mismo registro
        query.whereNot('aircraft_operator_id', data.aircraftOperatorId)
      })
      .whereNull('aircraft_operator_deleted_at')
      .where('aircraft_operator_name', data.aircraftOperatorName)
      .first()
    if (existName) {
      return {
        status: 400,
        type: 'warning',
        title: 'Duplicate name',
        message: 'Aircraft operator name already exists',
        data: { ...data },
      }
    }
    // exists aircraftOperatorFiscalName
    const existFiscalName = await AircraftOperator.query()
      .if(data.aircraftOperatorId > 0, (query) => {
        query.whereNot('aircraft_operator_id', data.aircraftOperatorId)
      })
      .whereNull('aircraft_operator_deleted_at')
      .where('aircraft_operator_fiscal_name', data.aircraftOperatorFiscalName)
      .first()
    if (existFiscalName) {
      return {
        status: 400,
        type: 'warning',
        title: 'Duplicate fiscal name',
        message: 'Aircraft operator fiscal name already exists',
        data: { ...data },
      }
    }

    return {
      status: 200,
      type: 'success',
      title: 'Validation passed',
      message: 'Información verificada con éxito',
      data: { ...data },
    }
  }

  /**
   * Ejemplo de verificación de existencia de info
   * (similar a tu CustomerService.verifyInfoExist).
   */
  async verifyInfoExist(operator: Partial<AircraftOperator>) {
    // Lógica para verificar si cierta referencia externa existe, por ejemplo
    // si el ID de otra tabla es válido. Ajustar según necesites.
    return {
      status: 200,
      type: 'success',
      title: 'Reference check passed',
      message: 'Referencia verificada con éxito',
      data: { ...operator },
    }
  }
}
