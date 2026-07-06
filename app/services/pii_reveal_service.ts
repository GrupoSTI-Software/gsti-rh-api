import db from '@adonisjs/lucid/services/db'
import Person from '#models/person'
import EmployeeBank from '#models/employee_bank'
import EmployeeMedicalCondition from '#models/employee_medical_condition'
import SensitiveFieldsCatalogService from '#services/sensitive_fields_catalog_service'
import PiiAccessLogService from '#services/pii_access_log_service'
import type { PiiAccessInputInterface } from '../interfaces/pii_access_input_interface.js'

/**
 * Resultado de un reveal exitoso.
 */
export interface PiiRevealResult {
  /** Valor en claro del campo solicitado. */
  value: unknown
}

/**
 * Datos de contexto de red que el caller provee para el log de auditoría.
 * (Los campos `model`, `modelColumn`, `recordId` y `businessUnitId` los resuelve
 * el servicio internamente; el caller solo aporta quién y desde dónde.)
 */
export type PiiRevealLogContext = Pick<
  PiiAccessInputInterface,
  'accessorUserId' | 'accessorIp' | 'accessorUserAgent' | 'requestId'
>

/**
 * Servicio de reveal de datos personales sensibles.
 *
 * Responsabilidades:
 *   1. Validar que el campo solicitado esté marcado como `maskedInApi` en el catálogo.
 *   2. Localizar el registro con validación de scope de unidad de negocio (anti-IDOR).
 *   3. Confirmar el log de auditoría y devolver el valor en claro en la misma transacción
 *      (fail-closed: si el log falla, el dato no se revela).
 *
 * Registry de modelos soportados (primer corte HU USRH1783019898097):
 *   - `Person`                   — scope vía `employee.businessUnitId`
 *   - `EmployeeBank`             — scope vía JOIN a `employees`
 *   - `EmployeeMedicalCondition` — scope vía `employee.businessUnitId`
 *
 * Ref: USRH1783019898097 §4 — mecanismo de reveal transaccional.
 */
export default class PiiRevealService {
  private catalogService = new SensitiveFieldsCatalogService()
  private logService = new PiiAccessLogService()

  /**
   * Revela el valor en claro de un campo sensible para el registro indicado,
   * registrando el acceso de forma transaccional antes de devolver el valor.
   *
   * @param model    — nombre de la clase Lucid (p.ej. `'Person'`).
   * @param column   — propiedad camelCase del campo (p.ej. `'personCurp'`).
   * @param recordId — PK del registro.
   * @param buScope  — lista de `businessUnitId` accesibles por el usuario.
   * @param logCtx   — contexto de red para el log de auditoría.
   * @returns        — `{ value }` si el registro existe y el usuario tiene acceso,
   *                   `null` si el campo no está en el catálogo o el registro no
   *                   pertenece al scope del usuario.
   * @throws         — cualquier error de BD se propaga (fail-closed).
   */
  async reveal(
    model: string,
    column: string,
    recordId: number,
    buScope: number[],
    logCtx: PiiRevealLogContext
  ): Promise<PiiRevealResult | null> {
    if (!this.catalogService.isMaskedInApi(model, column)) return null
    if (buScope.length === 0) return null

    const resolved = await this.resolveRecord(model, column, recordId, buScope)
    if (!resolved) return null

    await db.transaction(async (trx) => {
      await this.logService.record(
        {
          businessUnitId: resolved.businessUnitId,
          model,
          modelColumn: column,
          recordId,
          ...logCtx,
        },
        trx
      )
    })

    return { value: resolved.value }
  }

  // ─── registry privado ──────────────────────────────────────────────────────

  private async resolveRecord(
    model: string,
    column: string,
    recordId: number,
    buScope: number[]
  ): Promise<{ value: unknown; businessUnitId: number } | null> {
    switch (model) {
      case 'Person':
        return this.resolvePerson(column, recordId, buScope)
      case 'EmployeeBank':
        return this.resolveEmployeeBank(column, recordId, buScope)
      case 'EmployeeMedicalCondition':
        return this.resolveEmployeeMedicalCondition(column, recordId, buScope)
      default:
        return null
    }
  }

  private async resolvePerson(
    column: string,
    recordId: number,
    buScope: number[]
  ): Promise<{ value: unknown; businessUnitId: number } | null> {
    const person = await Person.query()
      .where('personId', recordId)
      .whereHas('employee', (q) => q.whereIn('businessUnitId', buScope))
      .preload('employee')
      .first()

    if (!person || !person.employee) return null

    return {
      value: (person as unknown as Record<string, unknown>)[column],
      businessUnitId: person.employee.businessUnitId,
    }
  }

  private async resolveEmployeeBank(
    column: string,
    recordId: number,
    buScope: number[]
  ): Promise<{ value: unknown; businessUnitId: number } | null> {
    const scopeRow = await db
      .from('employee_banks')
      .join('employees', 'employees.employee_id', 'employee_banks.employee_id')
      .whereIn('employees.business_unit_id', buScope)
      .where('employee_banks.employee_bank_id', recordId)
      .whereNull('employee_banks.employee_bank_deleted_at')
      .select('employees.business_unit_id as businessUnitId')
      .first()

    if (!scopeRow) return null

    const bank = await EmployeeBank.find(recordId)
    if (!bank) return null

    return {
      value: (bank as unknown as Record<string, unknown>)[column],
      businessUnitId: scopeRow.businessUnitId,
    }
  }

  private async resolveEmployeeMedicalCondition(
    column: string,
    recordId: number,
    buScope: number[]
  ): Promise<{ value: unknown; businessUnitId: number } | null> {
    const condition = await EmployeeMedicalCondition.query()
      .where('employeeMedicalConditionId', recordId)
      .whereHas('employee', (q) => q.whereIn('businessUnitId', buScope))
      .preload('employee')
      .first()

    if (!condition || !condition.employee) return null

    return {
      value: (condition as unknown as Record<string, unknown>)[column],
      businessUnitId: condition.employee.businessUnitId,
    }
  }
}
