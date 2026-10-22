import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import Employee from '#models/employee'
import EmployeeTeleworkLocation from '#models/employee_telework_location'
import { EMPLOYEE_WORK_SCHEDULE } from '#constants/employee_work_schedule'
import {
  TWL_ERROR_CODES,
  type TwlErrorCode,
  type TeleworkLocationType,
} from '#constants/employee_telework_location_error_codes'
import { TELEWORK_CHECKLIST_INVALIDATION_REASONS } from '#constants/telework_checklist'
import TeleworkChecklistService from '#modules/telework-checklist/telework_checklist.service'
import type { CurrentApplicationLocationRef } from '#modules/telework-checklist/dto/telework_checklist.dto'
import {
  shouldInvalidateTeleworkChecklist,
  toTeleworkLocationSnapshot,
  type TeleworkLocationChange,
  type TeleworkLocationReference,
} from '#utils/telework_location_change'

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
  /**
   * Regla 13 de VLRH-H1791306078668: `true` solo si ESTA petición pasó la lista
   * vigente del colaborador de `vigente` a `invalidada`. Presente en todo
   * `ok: true` de las tres operaciones (create, update y softDelete), `false`
   * cuando no había lista vigente o la regla no aplicaba.
   */
  teleworkChecklistInvalidated?: boolean
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
 * - Todo o nada (reglas 12 y 13 de VLRH-H1791306078668): guardar el lugar y,
 *   si cambió el domicilio del lugar que verificó la lista vigente, invalidarla
 *   ocurre en una sola transacción, con el candado del colaborador tomado
 *   primero (empleado → lugar → lista, igual que `#register`) y con el actor de
 *   la sesión. La respuesta informa si esta petición invalidó.
 *
 * Ver `docs/spec-USRH1782792802405.md` y
 * `docs/superpowers/plans/2026-10-22-invalidar-la-lista-de-verificacion-vigente-al-cambiar-el-domicilio-de-teletrabajo.md`.
 */
export default class EmployeeTeleworkLocationService {
  /**
   * Puerto de la lista de verificación: solo lo que este servicio necesita
   * (`findCurrentEffective` para decidir bajo candado e `invalidateCurrent` para
   * ejecutar la invalidación reentrante en el `trx` que ya está abierto).
   */
  private readonly checklist: Pick<
    TeleworkChecklistService,
    'findCurrentEffective' | 'invalidateCurrent'
  >

  /**
   * El puerto se inyecta por constructor (espejo del servicio de la lista). El
   * default conserva el uso actual del controller (`new` sin argumentos) y es
   * lo que los tests funcionales stubbean por prototipo.
   */
  constructor(
    checklist: Pick<
      TeleworkChecklistService,
      'findCurrentEffective' | 'invalidateCurrent'
    > = new TeleworkChecklistService()
  ) {
    this.checklist = checklist
  }

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
   * Aplica el gating por modalidad, el invariante de fijeza y, si el alta deja
   * un fijo con domicilio distinto al que verificó la lista vigente, la
   * invalidación — todo dentro de la misma transacción.
   *
   * @param employeeId - Id del empleado teletrabajador.
   * @param payload - Datos del lugar ya validados por VineJS.
   * @param scope - IDs de unidades de negocio accesibles.
   * @param actorUserId - Usuario de la sesión (queda como autor de la invalidación).
   */
  async create(
    employeeId: number,
    payload: TeleworkLocationPayload,
    scope: number[],
    actorUserId: number
  ): Promise<TeleworkLocationResult> {
    const resolution = await this.resolveTeleworker(employeeId, scope)
    if (!resolution.employee) {
      return { ok: false, code: resolution.code }
    }

    // La empresa sale de la fila ya filtrada por alcance, nunca del cliente.
    const businessUnitId = resolution.employee.businessUnitId

    return db.transaction(async (trx) => {
      // Candado del colaborador primero: mismo orden que `#register`, sin deadlock.
      const application = await this.checklist.findCurrentEffective(businessUnitId, employeeId, trx)

      // La referencia se resuelve ANTES de escribir: el fijo pactado al que se
      // compara es el previo, no el que está por nacer.
      const reference = await this.resolveReference(application, businessUnitId, employeeId, trx)

      const location = new EmployeeTeleworkLocation()
      location.employeeId = employeeId
      location.businessUnitId = businessUnitId
      this.applyPayload(location, payload)
      location.employeeTeleworkLocationActive = true
      location.useTransaction(trx)
      await location.save()

      if (location.employeeTeleworkLocationIsFixedAgreed) {
        await this.unsetOtherFixedLocations(location, trx)
      }

      return this.finishOperation(
        {
          businessUnitId,
          employeeId,
          actorUserId,
          application,
          reference,
          change: { operation: 'create', after: toTeleworkLocationSnapshot(location) },
          location,
        },
        trx
      )
    })
  }

  /**
   * Actualiza un lugar de teletrabajo del tenant. Mantiene el invariante
   * de fijeza cuando el lugar editado queda marcado como fijo pactado y
   * invalida la lista vigente en la misma transacción si el cambio tocó el
   * domicilio del lugar que la lista verificó (o del fijo pactado cuando la
   * lista no tiene lugar ligado).
   *
   * @param locationId - Id del lugar a editar.
   * @param payload - Datos del lugar ya validados por VineJS.
   * @param scope - IDs de unidades de negocio accesibles.
   * @param actorUserId - Usuario de la sesión (queda como autor de la invalidación).
   */
  async update(
    locationId: number,
    payload: TeleworkLocationPayload,
    scope: number[],
    actorUserId: number
  ): Promise<TeleworkLocationResult> {
    const found = await this.findInScope(locationId, scope)
    if (!found) {
      return { ok: false, code: TWL_ERROR_CODES.LOCATION_NOT_FOUND }
    }

    const businessUnitId = found.businessUnitId
    const employeeId = found.employeeId

    return db.transaction(async (trx) => {
      // Candado del colaborador primero (empleado → lugar → lista).
      const application = await this.checklist.findCurrentEffective(businessUnitId, employeeId, trx)

      // El «antes» se captura bajo el candado del lugar y ANTES de `applyPayload`:
      // capturarlo con la instancia leída fuera del trx haría que dos `PUT`
      // compararan contra un estado viejo.
      const location = await this.lockLocationInScope(locationId, scope, trx)
      if (!location) {
        return { ok: false, code: TWL_ERROR_CODES.LOCATION_NOT_FOUND }
      }

      const before = toTeleworkLocationSnapshot(location)
      const reference = await this.resolveReference(application, businessUnitId, employeeId, trx)

      this.applyPayload(location, payload)
      location.useTransaction(trx)
      await location.save()

      if (location.employeeTeleworkLocationIsFixedAgreed) {
        await this.unsetOtherFixedLocations(location, trx)
      }

      return this.finishOperation(
        {
          businessUnitId,
          employeeId,
          actorUserId,
          application,
          reference,
          change: { operation: 'update', before, after: toTeleworkLocationSnapshot(location) },
          location,
        },
        trx
      )
    })
  }

  /**
   * Baja lógica del lugar (se conserva para auditoría — regla 6 de la HU).
   * Si el lugar dado de baja era el que verificó la lista vigente (o el fijo
   * pactado de una lista sin lugar ligado), la invalidación ocurre en la misma
   * transacción.
   *
   * @param locationId - Id del lugar a dar de baja.
   * @param scope - IDs de unidades de negocio accesibles.
   * @param actorUserId - Usuario de la sesión (queda como autor de la invalidación).
   */
  async softDelete(
    locationId: number,
    scope: number[],
    actorUserId: number
  ): Promise<TeleworkLocationResult> {
    const found = await this.findInScope(locationId, scope)
    if (!found) {
      return { ok: false, code: TWL_ERROR_CODES.LOCATION_NOT_FOUND }
    }

    const businessUnitId = found.businessUnitId
    const employeeId = found.employeeId

    return db.transaction(async (trx) => {
      const application = await this.checklist.findCurrentEffective(businessUnitId, employeeId, trx)

      const location = await this.lockLocationInScope(locationId, scope, trx)
      if (!location) {
        return { ok: false, code: TWL_ERROR_CODES.LOCATION_NOT_FOUND }
      }

      const before = toTeleworkLocationSnapshot(location)
      const reference = await this.resolveReference(application, businessUnitId, employeeId, trx)

      location.employeeTeleworkLocationActive = false
      location.useTransaction(trx)
      await location.save()
      await location.delete()

      return this.finishOperation(
        {
          businessUnitId,
          employeeId,
          actorUserId,
          application,
          reference,
          change: { operation: 'softDelete', before },
          location,
        },
        trx
      )
    })
  }

  /**
   * Cierra la operación dentro del `trx`: evalúa la regla pura y, si toca,
   * invalida la vigente con el motivo y el actor de la sesión. `application`
   * `null` significa «sin lista vigente efectiva» (regla 10) y entonces no se
   * evalúa nada. `invalidateCurrent` es reentrante: recibe este mismo `trx`, no
   * abre el suyo; si lanza, `db.transaction` revierte lugar, fijos y lista.
   */
  private async finishOperation(
    operation: {
      businessUnitId: number
      employeeId: number
      actorUserId: number
      application: CurrentApplicationLocationRef | null
      reference: TeleworkLocationReference
      change: TeleworkLocationChange
      location: EmployeeTeleworkLocation
    },
    trx: TransactionClientContract
  ): Promise<TeleworkLocationResult> {
    let teleworkChecklistInvalidated = false

    if (
      operation.application !== null &&
      shouldInvalidateTeleworkChecklist(operation.reference, operation.change)
    ) {
      const invalidated = await this.checklist.invalidateCurrent(
        operation.businessUnitId,
        operation.employeeId,
        TELEWORK_CHECKLIST_INVALIDATION_REASONS.ADDRESS_CHANGE,
        operation.actorUserId,
        trx
      )
      teleworkChecklistInvalidated = invalidated !== null
    }

    return { ok: true, location: operation.location, teleworkChecklistInvalidated }
  }

  /**
   * Referencia contra la que se compara el cambio (reglas 1 y 2): el lugar que
   * la lista verificó cuando sigue vivo, es del MISMO colaborador y de la misma
   * empresa; en cualquier otro caso, el fijo pactado activo (que puede no
   * existir). Un id de otro colaborador, de otra empresa o ya dado de baja nunca
   * entra en la comparación (Review Focus 2): la referencia cae a `fixed`.
   */
  private async resolveReference(
    application: CurrentApplicationLocationRef | null,
    businessUnitId: number,
    employeeId: number,
    trx: TransactionClientContract
  ): Promise<TeleworkLocationReference> {
    const verifiedLocationId = application?.teleworkLocationId ?? null

    if (verifiedLocationId !== null) {
      const verified = await EmployeeTeleworkLocation.query({ client: trx })
        .where('employee_telework_location_id', verifiedLocationId)
        .where('employee_id', employeeId)
        .where('business_unit_id', businessUnitId)
        .where('employee_telework_location_active', true)
        .whereNull('employee_telework_location_deleted_at')
        .first()

      if (verified) {
        return { kind: 'linked', location: toTeleworkLocationSnapshot(verified) }
      }
    }

    const fixed = await this.findActiveFixedLocation(businessUnitId, employeeId, trx)
    return { kind: 'fixed', location: fixed ? toTeleworkLocationSnapshot(fixed) : null }
  }

  /**
   * Fijo pactado activo del colaborador (regla 2). Con más de un fijo activo
   * —dato previo, porque el desmarcado corría fuera de transacción— la
   * referencia es el de `employee_telework_location_created_at` más reciente,
   * con desempate por `employee_telework_location_id` mayor (anexo A).
   */
  private async findActiveFixedLocation(
    businessUnitId: number,
    employeeId: number,
    trx: TransactionClientContract
  ): Promise<EmployeeTeleworkLocation | null> {
    return await EmployeeTeleworkLocation.query({ client: trx })
      .where('employee_id', employeeId)
      .where('business_unit_id', businessUnitId)
      .where('employee_telework_location_is_fixed_agreed', true)
      .where('employee_telework_location_active', true)
      .whereNull('employee_telework_location_deleted_at')
      .orderBy('employee_telework_location_created_at', 'desc')
      .orderBy('employee_telework_location_id', 'desc')
      .first()
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

  /**
   * Relee el lugar dentro del `trx` tomando el candado de la fila
   * (`FOR UPDATE`), filtrando por alcance: si el lugar dejó de existir entre la
   * resolución de alcance y la transacción, quien llama responde
   * `LOCATION_NOT_FOUND` sin haber escrito nada.
   */
  private async lockLocationInScope(
    locationId: number,
    scope: number[],
    trx: TransactionClientContract
  ): Promise<EmployeeTeleworkLocation | null> {
    return await EmployeeTeleworkLocation.query({ client: trx })
      .where('employee_telework_location_id', locationId)
      .whereIn('business_unit_id', scope)
      .forUpdate()
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
   * del mismo empleado. Se ejecuta dentro del `trx` después de guardar el lugar
   * que queda como fijo pactado, y filtra por empresa como defensa en
   * profundidad (el desmarcado masivo no pasa por el mixin de alcance).
   */
  private async unsetOtherFixedLocations(
    fixed: EmployeeTeleworkLocation,
    trx: TransactionClientContract
  ): Promise<void> {
    await EmployeeTeleworkLocation.query({ client: trx })
      .where('employee_id', fixed.employeeId)
      .where('business_unit_id', fixed.businessUnitId)
      .whereNot('employee_telework_location_id', fixed.employeeTeleworkLocationId)
      .where('employee_telework_location_is_fixed_agreed', true)
      .update({ employee_telework_location_is_fixed_agreed: false })
  }
}
