import type { I18n } from '@adonisjs/i18n'
import { ACCESS_POINT_EMPLOYEE_ERROR_CODES } from '#constants/access_point_employee_error_codes'
import AccessPointEmployeeServiceError from '#exceptions/access_point_employee_service_error'
import {
  toAccessPointEmployeeDto,
  type AccessPointEmployeeDto,
} from './dto/employee_assignment.dto.js'
import EmployeeAssignmentRepositoryMysql from './employee_assignment.repository.mysql.js'
import EmployeeSyncService from '#modules/access-point/employee-sync/employee_sync.service'
import { ACCESS_POINT_EMPLOYEE_SYNC_STATUS } from '#models/access_point_employee'
import Employee from '#models/employee'
import type EmployeeAssignmentRepository from './employee_assignment.repository.js'
import type { BusinessUnitScope } from './employee_assignment.repository.js'

/**
 * Reglas de negocio de la asignación de empleados a puntos de acceso.
 *
 * Cubre el hueco que el backoffice ya invocaba sin contraparte: asignar y
 * retirar un punto de acceso de un empleado desde la sección de biométricos.
 */
export default class EmployeeAssignmentService {
  private readonly i18n: I18n
  private readonly repository: EmployeeAssignmentRepository

  private readonly sync: EmployeeSyncService

  constructor(
    i18n: I18n,
    repository?: EmployeeAssignmentRepository,
    sync?: EmployeeSyncService
  ) {
    this.i18n = i18n
    this.repository = repository ?? new EmployeeAssignmentRepositoryMysql()
    this.sync = sync ?? new EmployeeSyncService()
  }

  /** Traduce una clave con el idioma de la petición. */
  private t(key: string): string {
    return this.i18n.formatMessage(key)
  }


  /**
   * Comprueba que ambos extremos existan dentro del alcance de la petición.
   *
   * Un identificador de otra unidad de negocio se trata como inexistente, para
   * no revelar su existencia a quien no puede verlo.
   *
   * @throws AccessPointEmployeeServiceError si alguno no existe.
   */
  private async assertBothExist(
    accessPointId: number,
    employeeId: number,
    scope: BusinessUnitScope
  ): Promise<void> {
    const accessPointExists = await this.repository.accessPointExists(accessPointId, scope)

    if (!accessPointExists) {
      throw new AccessPointEmployeeServiceError({
        key: 'punto-acceso-no-encontrado',
        errorCode: ACCESS_POINT_EMPLOYEE_ERROR_CODES.ACCESS_POINT_NOT_FOUND,
        httpStatus: 404,
        title: this.t('access_point_employee_access_point_not_found_title'),
        detail: this.t('access_point_employee_access_point_not_found_message'),
      })
    }

    const employeeExists = await this.repository.employeeExists(employeeId, scope)

    if (!employeeExists) {
      throw new AccessPointEmployeeServiceError({
        key: 'colaborador-no-encontrado',
        errorCode: ACCESS_POINT_EMPLOYEE_ERROR_CODES.EMPLOYEE_NOT_FOUND,
        httpStatus: 404,
        title: this.t('access_point_employee_employee_not_found_title'),
        detail: this.t('access_point_employee_employee_not_found_message'),
      })
    }
  }

  /**
   * Asigna el empleado al punto de acceso.
   *
   * Reasignar a alguien que YA esta dado de alta responde conflicto, para que
   * el backoffice avise en vez de crear un duplicado silencioso. Un vinculo
   * `revoked` no cuenta como asignado: ahi el aparato confirmo que la persona
   * salio, y volver a meterla es una operacion legitima que revive la misma
   * fila -- partir el historial de ese par en dos filas perderia el rastro de
   * quien lo dio de baja y cuando.
   *
   * El alta se delega en el modulo de sincronizacion, que toma el primer PIN
   * libre de ese equipo, y en la misma operacion se encola hacia el
   * aparato: asignar sin enviar dejaba a la persona dada de alta en la pantalla
   * y desconocida para el checador, que es la diferencia entre poder marcar y
   * no poder. Sin PIN no se envia nada -- no hay con que identificarla -- y el
   * vinculo se queda esperando uno.
   *
   * @param accessPointId Punto de acceso destino.
   * @param employeeId Empleado a asignar.
   * @param scope Alcance de unidades de negocio de la petición.
   * @param actorUserId Quien pide el alta, para el historial del pivote.
   * @returns La asignación creada o revivida.
   * @throws AccessPointEmployeeServiceError si algún extremo no existe o ya estaba asignado.
   */
  async assign(
    accessPointId: number,
    employeeId: number,
    scope: BusinessUnitScope,
    actorUserId: number | null = null
  ): Promise<AccessPointEmployeeDto> {
    await this.assertBothExist(accessPointId, employeeId, scope)

    const existing = await this.repository.findAssignment(accessPointId, employeeId, scope)

    if (
      existing &&
      existing.accessPointEmployeeSyncStatus !== ACCESS_POINT_EMPLOYEE_SYNC_STATUS.REVOKED
    ) {
      throw new AccessPointEmployeeServiceError({
        key: 'asignacion-duplicada',
        errorCode: ACCESS_POINT_EMPLOYEE_ERROR_CODES.ALREADY_ASSIGNED,
        httpStatus: 409,
        title: this.t('access_point_employee_already_assigned_title'),
        detail: this.t('access_point_employee_already_assigned_message'),
      })
    }

    const employee = await Employee.query().where('employee_id', employeeId).firstOrFail()
    const businessUnitId = employee.businessUnitId as number
    const actor = { userId: actorUserId }

    const pivot = await this.sync.assign({
      accessPointId,
      businessUnitId,
      employeeId,
      actor,
    })

    const pin = pivot.accessPointEmployeePin
    if (!pin || pin.length === 0) return toAccessPointEmployeeDto(pivot)

    const sent = await this.sync.send({
      accessPointId,
      businessUnitId,
      employeeId,
      employeeName: nameOf(employee),
      actor,
    })

    return toAccessPointEmployeeDto(sent)
  }

  /**
   * Retira la asignación entre el empleado y el punto de acceso.
   *
   * @param accessPointId Punto de acceso de origen.
   * @param employeeId Empleado a desasignar.
   * @param scope Alcance de unidades de negocio de la petición.
   * @throws AccessPointEmployeeServiceError si algún extremo no existe o no había asignación.
   */
  async remove(
    accessPointId: number,
    employeeId: number,
    scope: BusinessUnitScope
  ): Promise<void> {
    await this.assertBothExist(accessPointId, employeeId, scope)

    const assignment = await this.repository.findAssignment(accessPointId, employeeId, scope)

    if (!assignment) {
      throw new AccessPointEmployeeServiceError({
        key: 'asignacion-no-encontrada',
        errorCode: ACCESS_POINT_EMPLOYEE_ERROR_CODES.ASSIGNMENT_NOT_FOUND,
        httpStatus: 404,
        title: this.t('access_point_employee_assignment_not_found_title'),
        detail: this.t('access_point_employee_assignment_not_found_message'),
      })
    }

    await this.repository.removeAssignment(assignment)
  }
}

/** Nombre con el que el colaborador queda dado de alta en el aparato. */
function nameOf(employee: Employee): string {
  return [employee.employeeFirstName, employee.employeeLastName]
    .filter((part) => typeof part === 'string' && part.length > 0)
    .join(' ')
    .trim()
}
