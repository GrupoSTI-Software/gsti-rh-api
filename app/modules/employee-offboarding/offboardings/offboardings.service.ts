import db from '@adonisjs/lucid/services/db'
import type { I18n } from '@adonisjs/i18n'
import type Employee from '#models/employee'
import RoleService from '#services/role_service'
import EmployeeSupplieService from '#services/employee_supplie_service'
import EmployeeOffboardingServiceError from '#exceptions/employee_offboarding_service_error'
import { EMPLOYEE_OFFBOARDING_ERROR_CODES } from '#constants/employee_offboarding_error_codes'
import { toBusinessDateString } from '#utils/business_date'
import { EMPLOYEE_OFFBOARDINGS_MODULE_SLUG } from '../concepts/concepts.constants.js'
import ConceptsRepositoryMysql from '../concepts/concepts.repository.mysql.js'
import type { ConceptsRepository } from '../concepts/concepts.repository.js'
import { EMPLOYEE_OFFBOARDING_ORIGIN } from './offboardings.constants.js'
import OffboardingsRepositoryMysql from './offboardings.repository.mysql.js'
import type {
  EmployeeOffboardingItemCreateData,
  OffboardingsRepository,
} from './offboardings.repository.js'
import { toOffboardingDto, type EmployeeOffboardingDto } from './dto/offboardings.dto.js'

/** Acciones del módulo `employee-offboardings` que usa este slice. */
export type EmployeeOffboardingCaseAction = 'read' | 'create'

export interface ScheduleOffboardingInput {
  employeeId: number
  plannedDate: string
  notes?: string | null
}

/** Largo máximo del snapshot de nombre (columna varchar(200)). */
const ITEM_NAME_MAX_LENGTH = 200

/**
 * Reglas de negocio del expediente de salida (USRH1786568279587): apertura
 * manual y automática con un solo expediente `open` por colaborador (regla 1,
 * lock sobre la fila de `employees`, §7 D6), generación única de pendientes
 * desde el catálogo de la empresa y los insumos asignados (reglas 3-6, con
 * snapshot de nombre §7 D9), consulta con marca de vencido (regla 9) y
 * aislamiento explícito por empresa (regla 12, §7 D1).
 */
export default class OffboardingsService {
  private t: (key: string, params?: { [key: string]: string | number }) => string
  private readonly repository: OffboardingsRepository
  private readonly conceptsRepository: ConceptsRepository

  constructor(
    i18n: I18n,
    repository: OffboardingsRepository = new OffboardingsRepositoryMysql(),
    conceptsRepository: ConceptsRepository = new ConceptsRepositoryMysql()
  ) {
    this.t = i18n.formatMessage.bind(i18n)
    this.repository = repository
    this.conceptsRepository = conceptsRepository
  }

  /**
   * Regla 14 — permiso granular sobre el módulo `employee-offboardings`.
   * `root` y `owner` hacen bypass dentro de `RoleService.hasAccess`.
   */
  async assertCanAccess(
    roleId: number | null | undefined,
    action: EmployeeOffboardingCaseAction
  ) {
    const forbidden = () =>
      new EmployeeOffboardingServiceError({
        key: 'sin-permiso',
        errorCode: EMPLOYEE_OFFBOARDING_ERROR_CODES.CASE_FORBIDDEN,
        httpStatus: 403,
        title: this.t('employee_offboarding_forbidden_title'),
        detail: this.t('employee_offboarding_forbidden_message'),
      })

    if (!roleId) {
      throw forbidden()
    }

    const roleService = new RoleService()
    const hasAccess = await roleService.hasAccess(
      roleId,
      EMPLOYEE_OFFBOARDINGS_MODULE_SLUG,
      action
    )
    if (!hasAccess) {
      throw forbidden()
    }
  }

  /**
   * Programa la baja: abre el expediente con origen `scheduled` y genera sus
   * pendientes (reglas 1-5). El colaborador se resuelve dentro del alcance y
   * con `withTrashed()` (regla 8: tras un fallo del enganche automático, el
   * responsable puede abrir el expediente a mano aunque la baja ya corriera).
   */
  async schedule(
    input: ScheduleOffboardingInput,
    businessUnitScope: number[],
    openedByUserId: number | null
  ): Promise<EmployeeOffboardingDto> {
    const employee = await this.repository.findEmployeeInScope(
      input.employeeId,
      businessUnitScope
    )
    if (!employee) {
      throw this.employeeNotFoundError()
    }

    const result = await this.openCase(employee, {
      plannedDate: input.plannedDate,
      origin: EMPLOYEE_OFFBOARDING_ORIGIN.SCHEDULED,
      notes: input.notes ?? null,
      openedByUserId,
    })

    if (result.alreadyExisted) {
      throw this.alreadyOpenError()
    }

    return await this.buildDto(result.employeeOffboardingId, employee)
  }

  /** Expediente `open` del colaborador con sus pendientes y la marca de vencido. */
  async getByEmployee(
    employeeId: number,
    businessUnitScope: number[]
  ): Promise<EmployeeOffboardingDto> {
    const employee = await this.repository.findEmployeeInScope(employeeId, businessUnitScope)
    if (!employee) {
      throw this.employeeNotFoundError()
    }

    const openCase = await this.repository.findOpenByEmployee(employeeId)
    if (!openCase) {
      throw this.caseNotFoundError()
    }

    return await this.buildDto(openCase.employeeOffboardingId, employee)
  }

  /**
   * Apertura automática desde `EmployeeService.delete` (regla 7): origen
   * `termination`, fecha = la fecha de terminación resuelta por la baja,
   * idempotente (regla 1: con expediente abierto es un no-op silencioso).
   * El llamador la envuelve en try/catch (regla 8: la baja nunca falla por
   * el expediente); aquí no se atrapa nada a propósito.
   *
   * SIN alcance de empresa: los caminos de piloto/sobrecargo no traen
   * `TenantContext` (§7 D1); el aislamiento lo da el filtro explícito por
   * `employee.businessUnitId` sobre el catálogo dentro de `openCase`.
   */
  async openAutomatically(employee: Employee, terminationDate: string): Promise<void> {
    await this.openCase(employee, {
      plannedDate: terminationDate,
      origin: EMPLOYEE_OFFBOARDING_ORIGIN.TERMINATION,
      notes: null,
      openedByUserId: null,
    })
  }

  /**
   * Apertura común: transacción → lock de la fila de `employees` (siempre
   * existe, §7 D6) → verificación de expediente `open` → alta del expediente
   * + generación de pendientes en un solo acto (molde
   * `questionnaire_application_service`).
   */
  private async openCase(
    employee: Employee,
    params: {
      plannedDate: string
      origin: string
      notes: string | null
      openedByUserId: number | null
    }
  ): Promise<{ employeeOffboardingId: number, alreadyExisted: boolean }> {
    return await db.transaction(async (trx) => {
      const locked = await this.repository.lockEmployeeRow(employee.employeeId, trx)
      if (!locked) {
        throw this.employeeNotFoundError()
      }

      const existing = await this.repository.findOpenByEmployee(employee.employeeId, trx)
      if (existing) {
        return {
          employeeOffboardingId: existing.employeeOffboardingId,
          alreadyExisted: true,
        }
      }

      // Regla 3 — conceptos ACTIVOS de la empresa del colaborador, con
      // filtro explícito de business_unit_id dentro del adaptador (§7 D1:
      // nunca delegado al mixin, que es no-op sin TenantContext).
      const concepts = await this.conceptsRepository.listLiveOrdered(
        employee.businessUnitId,
        trx,
        true
      )

      // Reutiliza el servicio vigente de insumos: activos y en tránsito,
      // con `supply` precargado (no se reescribe el query).
      const supplies = await EmployeeSupplieService.getActiveByEmployee(employee.employeeId)

      const rows: EmployeeOffboardingItemCreateData[] = [
        ...concepts.map((concept) => ({
          offboardingConceptId: concept.offboardingConceptId,
          employeeSupplyId: null,
          employeeOffboardingItemName: concept.offboardingConceptName.slice(
            0,
            ITEM_NAME_MAX_LENGTH
          ),
        })),
        ...supplies.map((employeeSupply) => ({
          offboardingConceptId: null,
          employeeSupplyId: employeeSupply.employeeSupplyId,
          employeeOffboardingItemName: (
            employeeSupply.supply?.supplyName ?? 'Activo asignado'
          ).slice(0, ITEM_NAME_MAX_LENGTH),
        })),
      ]

      const employeeOffboardingId = await this.repository.createCase(
        {
          employeeId: employee.employeeId,
          // Snapshot desde el colaborador ya resuelto; nunca TenantContext (§7 D2)
          businessUnitId: employee.businessUnitId,
          employeeOffboardingPlannedDate: params.plannedDate,
          employeeOffboardingOrigin: params.origin,
          employeeOffboardingNotes: params.notes,
          employeeOffboardingOpenedByUserId: params.openedByUserId,
        },
        trx
      )

      await this.repository.createItems(employeeOffboardingId, rows, trx)

      return { employeeOffboardingId, alreadyExisted: false }
    })
  }

  /** Arma el DTO con "hoy" resuelto UNA vez por request (regla 9). */
  private async buildDto(
    employeeOffboardingId: number,
    employee: Employee
  ): Promise<EmployeeOffboardingDto> {
    const offboarding = await this.repository.findByIdWithItems(employeeOffboardingId)
    if (!offboarding) {
      throw this.caseNotFoundError()
    }

    return toOffboardingDto(offboarding, {
      employeeTerminatedDate: employee.employeeTerminatedDate,
      employeeDeleted: employee.deletedAt !== null,
      hoyIso: toBusinessDateString(),
    })
  }

  private employeeNotFoundError() {
    return new EmployeeOffboardingServiceError({
      key: 'colaborador-no-encontrado',
      errorCode: EMPLOYEE_OFFBOARDING_ERROR_CODES.CASE_EMPLOYEE_NOT_FOUND,
      httpStatus: 404,
      title: this.t('employee_offboarding_case_employee_not_found_title'),
      detail: this.t('employee_offboarding_case_employee_not_found_message'),
    })
  }

  private caseNotFoundError() {
    return new EmployeeOffboardingServiceError({
      key: 'expediente-no-encontrado',
      errorCode: EMPLOYEE_OFFBOARDING_ERROR_CODES.CASE_NOT_FOUND,
      httpStatus: 404,
      title: this.t('employee_offboarding_case_not_found_title'),
      detail: this.t('employee_offboarding_case_not_found_message'),
    })
  }

  private alreadyOpenError() {
    return new EmployeeOffboardingServiceError({
      key: 'expediente-ya-abierto',
      errorCode: EMPLOYEE_OFFBOARDING_ERROR_CODES.CASE_ALREADY_OPEN,
      httpStatus: 409,
      title: this.t('employee_offboarding_case_already_open_title'),
      detail: this.t('employee_offboarding_case_already_open_message'),
    })
  }
}
