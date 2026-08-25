import type { I18n } from '@adonisjs/i18n'
import RoleService from '#services/role_service'
import { ACCESS_POINT_EMPLOYEE_ERROR_CODES } from '#constants/access_point_employee_error_codes'
import AccessPointEmployeeServiceError from '#exceptions/access_point_employee_service_error'
import {
  ACCESS_POINT_EMPLOYEE_MODULE_SLUG,
  ACCESS_POINT_EMPLOYEE_WRITE_ACTION,
} from './employee_assignment.constants.js'
import {
  toAccessPointEmployeeDto,
  type AccessPointEmployeeDto,
} from './dto/employee_assignment.dto.js'
import EmployeeAssignmentRepositoryMysql from './employee_assignment.repository.mysql.js'
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

  constructor(i18n: I18n, repository?: EmployeeAssignmentRepository) {
    this.i18n = i18n
    this.repository = repository ?? new EmployeeAssignmentRepositoryMysql()
  }

  /** Traduce una clave con el idioma de la petición. */
  private t(key: string): string {
    return this.i18n.formatMessage(key)
  }

  /**
   * Verifica que el rol pueda escribir sobre biométricos del empleado.
   *
   * @param roleId Rol de la sesión.
   * @throws AccessPointEmployeeServiceError con clave `sin-permiso`.
   */
  async assertCanAccess(roleId: number | null | undefined): Promise<void> {
    const forbidden = () =>
      new AccessPointEmployeeServiceError({
        key: 'sin-permiso',
        errorCode: ACCESS_POINT_EMPLOYEE_ERROR_CODES.FORBIDDEN,
        httpStatus: 403,
        title: this.t('access_point_employee_forbidden_title'),
        detail: this.t('access_point_employee_forbidden_message'),
      })

    if (!roleId) {
      throw forbidden()
    }

    const roleService = new RoleService()
    const hasAccess = await roleService.hasAccess(
      roleId,
      ACCESS_POINT_EMPLOYEE_MODULE_SLUG,
      ACCESS_POINT_EMPLOYEE_WRITE_ACTION
    )

    if (!hasAccess) {
      throw forbidden()
    }
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
   * La operación no es idempotente a propósito: reasignar algo ya asignado
   * responde conflicto, para que el backoffice pueda avisar en vez de crear un
   * duplicado silencioso.
   *
   * @param accessPointId Punto de acceso destino.
   * @param employeeId Empleado a asignar.
   * @param scope Alcance de unidades de negocio de la petición.
   * @returns La asignación creada.
   * @throws AccessPointEmployeeServiceError si algún extremo no existe o ya estaba asignado.
   */
  async assign(
    accessPointId: number,
    employeeId: number,
    scope: BusinessUnitScope
  ): Promise<AccessPointEmployeeDto> {
    await this.assertBothExist(accessPointId, employeeId, scope)

    const existing = await this.repository.findAssignment(accessPointId, employeeId, scope)

    if (existing) {
      throw new AccessPointEmployeeServiceError({
        key: 'asignacion-duplicada',
        errorCode: ACCESS_POINT_EMPLOYEE_ERROR_CODES.ALREADY_ASSIGNED,
        httpStatus: 409,
        title: this.t('access_point_employee_already_assigned_title'),
        detail: this.t('access_point_employee_already_assigned_message'),
      })
    }

    const created = await this.repository.createAssignment(accessPointId, employeeId)

    return toAccessPointEmployeeDto(created)
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
