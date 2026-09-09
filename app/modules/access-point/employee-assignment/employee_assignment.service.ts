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
import { canDetachAssignment } from '#modules/access-point/employee-sync/employee_sync_state'
import Employee from '#models/employee'
import logger from '@adonisjs/core/services/logger'
import ReplicationService from '#modules/biometric-vault/replication/replication.service'
import type { ReplicationInput } from '#modules/biometric-vault/replication/replication.service'
import type { ReplicationResult } from '#modules/biometric-vault/replication/replication.types'
import type EmployeeAssignmentRepository from './employee_assignment.repository.js'
import type { BusinessUnitScope } from './employee_assignment.repository.js'

/**
 * De donde viene la peticion, para la constancia de lectura de cada biometrico.
 *
 * Copiar una huella la lee, y toda lectura de un dato biometrico deja rastro.
 */
/** Lo unico que la asignacion necesita de la copia de biometricos. */
export interface BiometricReplicationPort {
  replicate(input: ReplicationInput): Promise<ReplicationResult>
}

export interface AssignmentTrace {
  ip?: string
  userAgent?: string | null
  requestId?: string | null
}

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

  /** Copia de biometricos al equipo nuevo. Inyectable para poder probarla. */
  private readonly replication: BiometricReplicationPort

  constructor(
    i18n: I18n,
    repository?: EmployeeAssignmentRepository,
    sync?: EmployeeSyncService,
    replication?: BiometricReplicationPort
  ) {
    this.i18n = i18n
    this.repository = repository ?? new EmployeeAssignmentRepositoryMysql()
    this.sync = sync ?? new EmployeeSyncService()
    this.replication = replication ?? new ReplicationService()
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
    actorUserId: number | null = null,
    trace: AssignmentTrace = {}
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

    const replicated = await this.replicateInto({
      accessPointId,
      businessUnitId,
      employeeId,
      actorUserId,
      trace,
    })

    return { ...toAccessPointEmployeeDto(sent), queuedBiometrics: replicated }
  }

  /**
   * Retira la asignación entre el empleado y el punto de acceso.
   *
   * Exige que el colaborador ya no esté dentro del aparato. Retirar la fila es
   * un borrado lógico del lado del servidor y no le dice nada al equipo: si la
   * persona seguía dada de alta ahí, se quedaría marcando en un checador donde
   * para nosotros ya no figura, sus checadas entrarían como PIN suelto y su
   * número se daría por libre para otra persona. Primero la baja, que sí viaja
   * al aparato; retirar la asignación es el último paso.
   *
   * @param accessPointId Punto de acceso de origen.
   * @param employeeId Empleado a desasignar.
   * @param scope Alcance de unidades de negocio de la petición.
   * @throws AccessPointEmployeeServiceError si algún extremo no existe, no
   * había asignación, o el colaborador sigue dado de alta en el equipo.
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

    if (!canDetachAssignment(assignment.accessPointEmployeeSyncStatus)) {
      throw new AccessPointEmployeeServiceError({
        key: 'baja-pendiente-en-el-equipo',
        errorCode: ACCESS_POINT_EMPLOYEE_ERROR_CODES.REVOCATION_REQUIRED,
        httpStatus: 409,
        title: this.t('access_point_employee_revocation_required_title'),
        detail: this.t('access_point_employee_revocation_required_message'),
      })
    }

    await this.repository.removeAssignment(assignment)
  }

  /**
   * Copia al equipo nuevo los biometricos que ya sirven ahi.
   *
   * Es la razon de ser de la boveda: alguien que ya puso el dedo en una puerta
   * no tiene por que volver a ponerlo en la siguiente. Solo viaja lo compatible
   * --el servicio compara la version de algoritmo del template con la que
   * declara el aparato-- y el alta sale antes por prioridad de cola, asi que el
   * usuario existe en el equipo cuando llega su biometrico.
   *
   * En su PROPIO try/catch y despues del alta: un consentimiento que falta, o
   * un blob que no se pudo leer, no pueden impedir que la persona quede dada de
   * alta hoy. Lo que no se copio se ve en la matriz y se reintenta.
   */
  private async replicateInto(input: {
    accessPointId: number
    businessUnitId: number
    employeeId: number
    actorUserId: number | null
    trace: AssignmentTrace
  }): Promise<number> {
    try {
      const result = await this.replication.replicate({
        employeeId: input.employeeId,
        businessUnitId: input.businessUnitId,
        // Sin equipo de origen: el dato sale de la boveda, no de otra pantalla.
        sourceAccessPointId: null,
        targetAccessPointIds: [input.accessPointId],
        modalities: [],
        actor: {
          userId: input.actorUserId,
          ip: input.trace.ip ?? '',
          userAgent: input.trace.userAgent ?? null,
          requestId: input.trace.requestId ?? null,
        },
        dryRun: false,
      })

      return result.targets
        .flatMap((target) => target.items)
        .filter((item) => item.status === 'queued').length
    } catch (error: unknown) {
      logger.warn(
        { err: error, accessPointId: input.accessPointId, employeeId: input.employeeId },
        'EmployeeAssignmentService.assign: no se pudieron copiar los biometricos; el alta se completo igual'
      )
      return 0
    }
  }
}

/** Nombre con el que el colaborador queda dado de alta en el aparato. */
function nameOf(employee: Employee): string {
  return [employee.employeeFirstName, employee.employeeLastName]
    .filter((part) => typeof part === 'string' && part.length > 0)
    .join(' ')
    .trim()
}
