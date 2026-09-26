import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
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
import {
  EMPLOYEE_OFFBOARDING_ORIGIN,
  EMPLOYEE_OFFBOARDING_STATUS,
} from './offboardings.constants.js'
import OffboardingsRepositoryMysql from './offboardings.repository.mysql.js'
import type {
  EmployeeOffboardingItemCreateData,
  OffboardingListFilters,
  OffboardingsRepository,
} from './offboardings.repository.js'
import {
  buildSuppliesMap,
  buildUserNamesMap,
  toListRowDto,
  toOffboardingDto,
  type EmployeeOffboardingDto,
  type EmployeeOffboardingListRowDto,
} from './dto/offboardings.dto.js'

/** Acciones del módulo `employee-offboardings` que usa este slice. */
export type EmployeeOffboardingCaseAction = 'read' | 'create' | 'update'

/** Página del listado de salidas (USRH1786568279596, §6.1). */
export interface EmployeeOffboardingListResult {
  meta: {
    total: number
    perPage: number
    currentPage: number
    lastPage: number
    firstPage: number
  }
  rows: EmployeeOffboardingListRowDto[]
}

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

    return await this.buildDto(result.employeeOffboardingId, employee, businessUnitScope)
  }

  /**
   * Expediente del colaborador con sus pendientes, la marca de vencido y el
   * bloque de avance. Cambio de contrato declarado (USRH1786568279596 §6.2):
   * sin expediente `open`, devuelve el MÁS RECIENTE aunque esté cerrado — el
   * 404 queda solo para el colaborador que nunca tuvo expediente (regla 13).
   */
  async getByEmployee(
    employeeId: number,
    businessUnitScope: number[]
  ): Promise<EmployeeOffboardingDto> {
    const employee = await this.repository.findEmployeeInScope(employeeId, businessUnitScope)
    if (!employee) {
      throw this.employeeNotFoundError()
    }

    const openCase = await this.repository.findOpenByEmployee(employeeId)
    const targetCase = openCase ?? (await this.repository.findMostRecentByEmployee(employeeId))
    if (!targetCase) {
      throw this.caseNotFoundError()
    }

    return await this.buildDto(targetCase.employeeOffboardingId, employee, businessUnitScope)
  }

  /**
   * Listado paginado de salidas del alcance (USRH1786568279596): avance
   * agregado en UNA sentencia más la de conteo, "hoy" resuelto una vez por
   * request en la zona de negocio y pasado como binding.
   */
  async list(
    filters: OffboardingListFilters,
    businessUnitScope: number[]
  ): Promise<EmployeeOffboardingListResult> {
    const { rows, total } = await this.repository.listAggregated(
      filters,
      businessUnitScope,
      toBusinessDateString()
    )

    const safePage = Math.max(filters.page, 1)
    const safeLimit = Math.min(Math.max(filters.limit, 1), 100)
    return {
      meta: {
        total,
        perPage: safeLimit,
        currentPage: safePage,
        lastPage: Math.max(Math.ceil(total / safeLimit), 1),
        firstPage: 1,
      },
      rows: rows.map(toListRowDto),
    }
  }

  /**
   * Da por terminada la salida (reglas 6-7): estampa quién y cuándo, NO toca
   * los pendientes (los abiertos se conservan tal cual), ni al colaborador,
   * ni su inventario. Una sola escritura, sin transacción.
   */
  async close(
    employeeOffboardingId: number,
    businessUnitScope: number[],
    closedByUserId: number | null
  ): Promise<EmployeeOffboardingDto> {
    const offboarding = await this.repository.findByIdInScope(
      employeeOffboardingId,
      businessUnitScope
    )
    if (!offboarding) {
      throw this.caseNotFoundError()
    }
    if (offboarding.employeeOffboardingStatus === EMPLOYEE_OFFBOARDING_STATUS.CLOSED) {
      throw this.alreadyClosedError()
    }

    offboarding.employeeOffboardingStatus = EMPLOYEE_OFFBOARDING_STATUS.CLOSED
    offboarding.employeeOffboardingClosedAt = DateTime.now()
    offboarding.employeeOffboardingClosedByUserId = closedByUserId
    await this.repository.saveCase(offboarding)

    return await this.buildDtoForCase(offboarding, businessUnitScope)
  }

  /**
   * Vuelve a abrir la salida (regla 9): regresa al estado de trabajo y quita
   * las marcas del cierre — sin bitácora, solo queda el último cierre.
   */
  async reopen(
    employeeOffboardingId: number,
    businessUnitScope: number[]
  ): Promise<EmployeeOffboardingDto> {
    const offboarding = await this.repository.findByIdInScope(
      employeeOffboardingId,
      businessUnitScope
    )
    if (!offboarding) {
      throw this.caseNotFoundError()
    }
    if (offboarding.employeeOffboardingStatus !== EMPLOYEE_OFFBOARDING_STATUS.CLOSED) {
      throw this.notClosedError()
    }

    offboarding.employeeOffboardingStatus = EMPLOYEE_OFFBOARDING_STATUS.OPEN
    offboarding.employeeOffboardingClosedAt = null
    offboarding.employeeOffboardingClosedByUserId = null
    await this.repository.saveCase(offboarding)

    return await this.buildDtoForCase(offboarding, businessUnitScope)
  }

  /** DTO tras cerrar/reabrir: el colaborador se resuelve sin alcance y con trashed. */
  private async buildDtoForCase(
    offboarding: { employeeOffboardingId: number; employeeId: number },
    businessUnitScope: number[]
  ): Promise<EmployeeOffboardingDto> {
    const employee = await this.repository.findEmployeeWithTrashed(offboarding.employeeId)
    if (!employee) {
      throw this.employeeNotFoundError()
    }
    return await this.buildDto(offboarding.employeeOffboardingId, employee, businessUnitScope)
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
    employee: Employee,
    businessUnitScope: number[]
  ): Promise<EmployeeOffboardingDto> {
    const offboarding = await this.repository.findByIdWithItems(
      employeeOffboardingId,
      businessUnitScope
    )
    if (!offboarding) {
      throw this.caseNotFoundError()
    }

    // Diagnóstico de insumo (D-3 de USRH1786568279590) y autoría del
    // cumplimiento: se derivan en cada lectura, nunca se persisten.
    const items = offboarding.items ?? []
    const supplyIds = [
      ...new Set(
        items
          .map((item) => item.employeeSupplyId)
          .filter((id): id is number => id !== null && id !== undefined)
      ),
    ]
    const userIds = [
      ...new Set(
        items
          .map((item) => item.employeeOffboardingItemCompletedByUserId)
          .filter((id): id is number => id !== null && id !== undefined)
      ),
    ]
    const [supplies, users, evidenceCountsByItemId] = await Promise.all([
      this.repository.findSuppliesByIds(supplyIds, offboarding.businessUnitId),
      this.repository.findUsersByIds(userIds),
      this.repository.countLiveEvidencesByItemIds(
        items.map((item) => item.employeeOffboardingItemId)
      ),
    ])

    return toOffboardingDto(offboarding, {
      employeeTerminatedDate: employee.employeeTerminatedDate,
      employeeDeleted: employee.deletedAt !== null,
      hoyIso: toBusinessDateString(),
      suppliesById: buildSuppliesMap(supplies),
      userNamesById: buildUserNamesMap(users),
      evidenceCountsByItemId,
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

  private alreadyClosedError() {
    return new EmployeeOffboardingServiceError({
      key: 'expediente-ya-cerrado',
      errorCode: EMPLOYEE_OFFBOARDING_ERROR_CODES.CASE_ALREADY_CLOSED,
      httpStatus: 409,
      title: this.t('employee_offboarding_case_already_closed_title'),
      detail: this.t('employee_offboarding_case_already_closed_message'),
    })
  }

  private notClosedError() {
    return new EmployeeOffboardingServiceError({
      key: 'expediente-no-cerrado',
      errorCode: EMPLOYEE_OFFBOARDING_ERROR_CODES.CASE_NOT_CLOSED,
      httpStatus: 409,
      title: this.t('employee_offboarding_case_not_closed_title'),
      detail: this.t('employee_offboarding_case_not_closed_message'),
    })
  }
}
