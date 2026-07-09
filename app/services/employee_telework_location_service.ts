import Employee from '#models/employee'
import EmployeeTeleworkLocation from '#models/employee_telework_location'
import { EMPLOYEE_WORK_SCHEDULE } from '#constants/employee_work_schedule'
import {
  TWL_ERROR_CODES,
  type TwlErrorCode,
  type TeleworkLocationType,
} from '#constants/employee_telework_location_error_codes'

/**
 * Payload plano que el controller entrega al servicio tras validar con
 * VineJS. La empresa (`businessUnitId`) nunca viene aquí: se toma del scope
 * resuelto por `businessScope()` (anti-IDOR).
 */
export interface TeleworkLocationPayload {
  employeeTeleworkLocationType: TeleworkLocationType
  employeeTeleworkLocationStreet: string
  employeeTeleworkLocationExternalNumber?: string | null
  employeeTeleworkLocationInternalNumber?: string | null
  employeeTeleworkLocationSettlement?: string | null
  employeeTeleworkLocationCity: string
  employeeTeleworkLocationState: string
  employeeTeleworkLocationCountry?: string
  employeeTeleworkLocationZipcode?: string | null
  employeeTeleworkLocationIsFixedAgreed: boolean
  employeeTeleworkLocationHasInternet: boolean
  employeeTeleworkLocationHasAdequateEquipment: boolean
  employeeTeleworkLocationConnectivityNotes?: string | null
}

/** Resultado discriminado de las operaciones del servicio. */
export interface TeleworkLocationResult {
  ok: boolean
  code?: TwlErrorCode
  location?: EmployeeTeleworkLocation
  locations?: EmployeeTeleworkLocation[]
}

/**
 * Casos de uso del lugar de teletrabajo (NOM-037 5.1 / 5.1.1 / 5.1.2).
 *
 * Reglas que garantiza:
 * - Gating por modalidad: solo empleados `Remote`/`Hybrid` tienen lugares.
 * - Aislamiento por empresa: toda lectura/escritura se restringe al
 *   `businessUnitScope` de la request.
 * - Invariante de fijeza: como máximo un lugar fijo pactado activo por
 *   empleado (al marcar uno, se desmarcan los demás).
 * - Baja lógica: los lugares dados de baja se conservan para auditoría.
 *
 * Ver `docs/spec-USRH1782792802405.md`.
 */
export default class EmployeeTeleworkLocationService {
  /**
   * Resuelve el empleado dentro del scope del tenant y verifica el gating
   * por modalidad.
   *
   * @param employeeId - Id del empleado a validar.
   * @param scope - IDs de unidades de negocio accesibles en la request.
   * @returns El empleado cuando es teletrabajador dentro del scope; código de error en caso contrario.
   */
  private async resolveTeleworker(
    employeeId: number,
    scope: number[]
  ): Promise<{ employee?: Employee; code?: TwlErrorCode }> {
    const employee = await Employee.query()
      .whereNull('employee_deleted_at')
      .where('employee_id', employeeId)
      .whereIn('business_unit_id', scope)
      .first()

    if (!employee) {
      return { code: TWL_ERROR_CODES.EMPLOYEE_NOT_FOUND }
    }

    const isTeleworker =
      employee.employeeWorkSchedule === EMPLOYEE_WORK_SCHEDULE.REMOTE ||
      employee.employeeWorkSchedule === EMPLOYEE_WORK_SCHEDULE.HYBRID

    if (!isTeleworker) {
      return { code: TWL_ERROR_CODES.ONLY_TELEWORKERS }
    }

    return { employee }
  }

  /**
   * Lista los lugares de teletrabajo activos de un empleado del tenant.
   * No aplica gating: si el empleado dejó de ser teletrabajador, sus
   * lugares históricos siguen siendo consultables (el listado 5.1 decide
   * qué mostrar).
   *
   * @param employeeId - Id del empleado.
   * @param scope - IDs de unidades de negocio accesibles.
   */
  async listByEmployee(employeeId: number, scope: number[]): Promise<TeleworkLocationResult> {
    const employee = await Employee.query()
      .whereNull('employee_deleted_at')
      .where('employee_id', employeeId)
      .whereIn('business_unit_id', scope)
      .first()

    if (!employee) {
      return { ok: false, code: TWL_ERROR_CODES.EMPLOYEE_NOT_FOUND }
    }

    const locations = await EmployeeTeleworkLocation.query()
      .where('employee_id', employeeId)
      .whereIn('business_unit_id', scope)
      .orderBy('employee_telework_location_is_fixed_agreed', 'desc')
      .orderBy('employee_telework_location_created_at', 'asc')

    return { ok: true, locations }
  }

  /**
   * Registra un lugar de teletrabajo para un teletrabajador del tenant.
   * Aplica el gating por modalidad y el invariante de fijeza.
   *
   * @param employeeId - Id del empleado teletrabajador.
   * @param payload - Datos del lugar ya validados por VineJS.
   * @param scope - IDs de unidades de negocio accesibles.
   */
  async create(
    employeeId: number,
    payload: TeleworkLocationPayload,
    scope: number[]
  ): Promise<TeleworkLocationResult> {
    const resolution = await this.resolveTeleworker(employeeId, scope)
    if (!resolution.employee) {
      return { ok: false, code: resolution.code }
    }

    const location = new EmployeeTeleworkLocation()
    location.employeeId = employeeId
    location.businessUnitId = resolution.employee.businessUnitId
    this.applyPayload(location, payload)
    location.employeeTeleworkLocationActive = true
    await location.save()

    if (location.employeeTeleworkLocationIsFixedAgreed) {
      await this.unsetOtherFixedLocations(location)
    }

    return { ok: true, location }
  }

  /**
   * Actualiza un lugar de teletrabajo del tenant. Mantiene el invariante
   * de fijeza cuando el lugar editado queda marcado como fijo pactado.
   *
   * @param locationId - Id del lugar a editar.
   * @param payload - Datos del lugar ya validados por VineJS.
   * @param scope - IDs de unidades de negocio accesibles.
   */
  async update(
    locationId: number,
    payload: TeleworkLocationPayload,
    scope: number[]
  ): Promise<TeleworkLocationResult> {
    const location = await this.findInScope(locationId, scope)
    if (!location) {
      return { ok: false, code: TWL_ERROR_CODES.LOCATION_NOT_FOUND }
    }

    this.applyPayload(location, payload)
    await location.save()

    if (location.employeeTeleworkLocationIsFixedAgreed) {
      await this.unsetOtherFixedLocations(location)
    }

    return { ok: true, location }
  }

  /**
   * Baja lógica del lugar (se conserva para auditoría — regla 6 de la HU).
   *
   * @param locationId - Id del lugar a dar de baja.
   * @param scope - IDs de unidades de negocio accesibles.
   */
  async softDelete(locationId: number, scope: number[]): Promise<TeleworkLocationResult> {
    const location = await this.findInScope(locationId, scope)
    if (!location) {
      return { ok: false, code: TWL_ERROR_CODES.LOCATION_NOT_FOUND }
    }

    location.employeeTeleworkLocationActive = false
    await location.save()
    await location.delete()

    return { ok: true, location }
  }

  /** Busca un lugar vivo dentro del scope del tenant. */
  private async findInScope(
    locationId: number,
    scope: number[]
  ): Promise<EmployeeTeleworkLocation | null> {
    return await EmployeeTeleworkLocation.query()
      .where('employee_telework_location_id', locationId)
      .whereIn('business_unit_id', scope)
      .first()
  }

  /** Copia el payload validado sobre la instancia (sin tocar employee/tenant). */
  private applyPayload(
    location: EmployeeTeleworkLocation,
    payload: TeleworkLocationPayload
  ): void {
    location.employeeTeleworkLocationType = payload.employeeTeleworkLocationType
    location.employeeTeleworkLocationStreet = payload.employeeTeleworkLocationStreet
    location.employeeTeleworkLocationExternalNumber =
      payload.employeeTeleworkLocationExternalNumber ?? null
    location.employeeTeleworkLocationInternalNumber =
      payload.employeeTeleworkLocationInternalNumber ?? null
    location.employeeTeleworkLocationSettlement =
      payload.employeeTeleworkLocationSettlement ?? null
    location.employeeTeleworkLocationCity = payload.employeeTeleworkLocationCity
    location.employeeTeleworkLocationState = payload.employeeTeleworkLocationState
    location.employeeTeleworkLocationCountry = payload.employeeTeleworkLocationCountry ?? 'México'
    location.employeeTeleworkLocationZipcode = payload.employeeTeleworkLocationZipcode ?? null
    location.employeeTeleworkLocationIsFixedAgreed = payload.employeeTeleworkLocationIsFixedAgreed
    location.employeeTeleworkLocationHasInternet = payload.employeeTeleworkLocationHasInternet
    location.employeeTeleworkLocationHasAdequateEquipment =
      payload.employeeTeleworkLocationHasAdequateEquipment
    location.employeeTeleworkLocationConnectivityNotes =
      payload.employeeTeleworkLocationConnectivityNotes ?? null
  }

  /**
   * Invariante de fijeza (5.1.2): desmarca cualquier otro lugar fijo activo
   * del mismo empleado. Se ejecuta después de guardar el lugar que queda
   * como fijo pactado.
   */
  private async unsetOtherFixedLocations(fixed: EmployeeTeleworkLocation): Promise<void> {
    await EmployeeTeleworkLocation.query()
      .where('employee_id', fixed.employeeId)
      .whereNot('employee_telework_location_id', fixed.employeeTeleworkLocationId)
      .where('employee_telework_location_is_fixed_agreed', true)
      .update({ employee_telework_location_is_fixed_agreed: false })
  }
}
