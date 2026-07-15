import Employee from '#models/employee'
import type EmployeeTeleworkLocation from '#models/employee_telework_location'
import {
  EMPLOYEE_WORK_SCHEDULE,
  TELEWORK_LEGAL_THRESHOLD_PERCENT,
} from '#constants/employee_work_schedule'

/** Filtros de la consulta derivada del listado 5.1. */
export interface TeleworkWorkerFilters {
  search?: string
  page: number
  limit: number
}

/** Lugar donde labora en la forma que consume el listado (subset del 5.1). */
export interface TeleworkWorkerWorkplace {
  locationType: string
  address: string
  isFixedAgreed: boolean
  hasInternet: boolean
  hasAdequateEquipment: boolean
}

/** Fila del listado 5.1 (DTO derivado, no persistido). */
export interface TeleworkWorkerRow {
  employeeId: number
  employeeCode: number | string
  fullName: string
  position: string
  workSchedule: string
  teleworkPercentage: number
  workplaces: TeleworkWorkerWorkplace[]
}

/**
 * Vista derivada del listado de teletrabajadores (NOM-037 5.1).
 *
 * No persiste nada: se calcula al momento sobre `employees` activos del
 * tenant con modalidad Home Office o Híbrido y porcentaje de teletrabajo
 * igual o mayor al umbral legal (5.1.f, inclusivo por decisión de producto).
 * Un empleado entra o sale del listado automáticamente al cambiar su
 * modalidad o porcentaje.
 */
export default class TeleworkWorkerService {
  /**
   * Ejecuta la consulta derivada del listado 5.1 dentro del scope del tenant.
   *
   * @param filters - Búsqueda por nombre/puesto y paginación.
   * @param scope - IDs de unidades de negocio accesibles en la request.
   * @returns Página de filas del listado con meta de paginación.
   */
  async list(filters: TeleworkWorkerFilters, scope: number[]) {
    const employees = await Employee.query()
      .whereNull('employee_deleted_at')
      .whereIn('business_unit_id', scope)
      .whereIn('employee_work_schedule', [
        EMPLOYEE_WORK_SCHEDULE.REMOTE,
        EMPLOYEE_WORK_SCHEDULE.HYBRID,
      ])
      // Umbral 5.1.f inclusivo por decisión de producto (2026-07-08): el 40% exacto SÍ entra al listado.
      .where('employee_telework_percentage', '>=', TELEWORK_LEGAL_THRESHOLD_PERCENT)
      .if(filters.search, (query) => {
        const term = `%${filters.search!.toUpperCase()}%`
        query.where((sub) => {
          sub
            .whereHas('person', (personQuery) => {
              personQuery.whereRaw(
                "UPPER(CONCAT(person_firstname, ' ', person_lastname, ' ', IFNULL(person_second_lastname, ''))) LIKE ?",
                [term]
              )
            })
            .orWhereHas('position', (positionQuery) => {
              positionQuery.whereRaw('UPPER(position_name) LIKE ?', [term])
            })
        })
      })
      .preload('person')
      .preload('position')
      .preload('teleworkLocations', (locationQuery) => {
        locationQuery
          .orderBy('employee_telework_location_is_fixed_agreed', 'desc')
          .orderBy('employee_telework_location_created_at', 'asc')
      })
      .orderBy('employee_telework_percentage', 'desc')
      .paginate(filters.page, filters.limit)

    const serialized = employees.toJSON()

    return {
      meta: serialized.meta,
      data: (employees.all() as Employee[]).map((employee) => this.toRow(employee)),
    }
  }

  /** Mapea el empleado al DTO del listado (la capa de presentación nunca ve el modelo crudo). */
  private toRow(employee: Employee): TeleworkWorkerRow {
    const person = employee.person
    const fullName = [
      person?.personFirstname,
      person?.personLastname,
      person?.personSecondLastname,
    ]
      .filter((part) => !!part && `${part}`.trim().length > 0)
      .join(' ')

    return {
      employeeId: employee.employeeId,
      employeeCode: employee.employeeCode,
      fullName,
      position: employee.position?.positionName ?? '',
      workSchedule: employee.employeeWorkSchedule,
      teleworkPercentage: Number(employee.employeeTeleworkPercentage),
      workplaces: (employee.teleworkLocations ?? []).map((location) =>
        this.toWorkplace(location)
      ),
    }
  }

  /** Aplana el lugar de teletrabajo a la forma del 5.1 que muestra el listado. */
  private toWorkplace(location: EmployeeTeleworkLocation): TeleworkWorkerWorkplace {
    const streetLine = [
      location.employeeTeleworkLocationStreet,
      location.employeeTeleworkLocationExternalNumber,
    ]
      .filter((part) => !!part && `${part}`.trim().length > 0)
      .join(' ')

    const address = [
      streetLine,
      location.employeeTeleworkLocationSettlement,
      location.employeeTeleworkLocationCity,
      location.employeeTeleworkLocationState,
    ]
      .filter((part) => !!part && `${part}`.trim().length > 0)
      .join(', ')

    return {
      locationType: location.employeeTeleworkLocationType,
      address,
      isFixedAgreed: location.employeeTeleworkLocationIsFixedAgreed,
      hasInternet: location.employeeTeleworkLocationHasInternet,
      hasAdequateEquipment: location.employeeTeleworkLocationHasAdequateEquipment,
    }
  }
}
