import db from '@adonisjs/lucid/services/db'
import Department from '#models/department'
import Position from '#models/position'
import { TENANT_UNSCOPED_REASON } from '#constants/tenant_unscoped_reason'
import { TenantContext } from '#utils/tenant_context'

/** Departamento, puesto y empresa que el empleado tiene GUARDADOS. */
export interface EmployeeStructureCurrent {
  departmentId: number | null
  positionId: number | null
  businessUnitId: number
}

/**
 * Lo que trae la edición, ya validada. Clave ausente = no tocar ese campo.
 * `null` en el departamento mientras el empleado conserva puesto lo rechaza
 * la verificación de coherencia (VLRH-H1792361820794). Vaciar solo el puesto,
 * o ambos, sigue dejando sin asignar (USRH1788466831270, reglas 2 y 9).
 */
export interface EmployeeStructureInput {
  departmentId?: number | null
  positionId?: number | null
  /** Empresa del empleado tras la edición; ya validada por el middleware de scope. */
  businessUnitId: number
}

export interface EmployeeStructureResolution {
  /** Valores que quedarán guardados si la verificación pasa. */
  departmentId: number | null
  positionId: number | null
  /** Empresa contra la que se verifica: la del empleado tras la edición (regla 5). */
  businessUnitId: number
  /** Ids que deben existir, vigentes y en `businessUnitId`; `null` = nada que verificar. */
  departmentIdToVerify: number | null
  positionIdToVerify: number | null
}

export type EmployeeStructureField = 'department' | 'position'

export type EmployeeStructureMissing = 'department' | 'position' | 'both'

/**
 * Vacío o en cero cuenta como faltante al alta (USRH1789328927556, regla 2).
 * No trata un string no numérico ("abc") como faltante: eso lo rechaza Vine
 * como dato mal formado (regla 4), no como "Falta el departamento".
 */
export function isMissingStructureId(value: unknown): boolean {
  if (value === null || value === undefined) {
    return true
  }
  if (typeof value === 'string' && value.trim() === '') {
    return true
  }
  return value === 0 || value === '0'
}

/**
 * Decide si el alta trae departamento y puesto, o cuál falta (regla 1).
 * Función pura: no consulta nada y no inventa valores (regla 2).
 */
export function requireEmployeeStructureForCreate(input: {
  departmentId?: unknown
  positionId?: unknown
}): { ok: true } | { ok: false; missing: EmployeeStructureMissing } {
  const departmentMissing = isMissingStructureId(input.departmentId)
  const positionMissing = isMissingStructureId(input.positionId)
  if (departmentMissing && positionMissing) {
    return { ok: false, missing: 'both' }
  }
  if (departmentMissing) {
    return { ok: false, missing: 'department' }
  }
  if (positionMissing) {
    return { ok: false, missing: 'position' }
  }
  return { ok: true }
}

export type EmployeeStructureVerification =
  | { ok: true }
  | { ok: false; field: EmployeeStructureField; requestedId: number }

/**
 * Decide qué departamento y puesto quedan tras editar a un empleado y cuáles
 * hay que verificar antes de guardar (USRH1788466831270).
 *
 * "Cambió" se decide contra lo GUARDADO, nunca contra lo que mande la pantalla
 * (regla 4): reenviar el mismo id —aunque apunte a un departamento eliminado
 * o al relleno de otra empresa— no se verifica, para que ese empleado se
 * pueda seguir editando y dar de baja. Un id distinto se verifica (regla 3).
 * Si la edición cambia de empresa, se verifican los dos aunque no cambien
 * (regla 5). Lo vacío nunca se verifica ni se rellena (reglas 2 y 9).
 *
 * Función pura: no consulta nada. Es la única representación de esa regla;
 * la consume `EmployeeController.update` y la reutilizará el guardado de
 * contratos (USRH1789328927648).
 */
export function resolveEmployeeStructureUpdate(
  current: EmployeeStructureCurrent,
  input: EmployeeStructureInput
): EmployeeStructureResolution {
  const departmentId = input.departmentId === undefined ? current.departmentId : input.departmentId
  const positionId = input.positionId === undefined ? current.positionId : input.positionId
  const businessUnitChanged = input.businessUnitId !== current.businessUnitId

  const toVerify = (next: number | null, saved: number | null): number | null =>
    next !== null && (businessUnitChanged || next !== saved) ? next : null

  return {
    departmentId,
    positionId,
    businessUnitId: input.businessUnitId,
    departmentIdToVerify: toVerify(departmentId, current.departmentId),
    positionIdToVerify: toVerify(positionId, current.positionId),
  }
}

/**
 * Confirma que el departamento y el puesto marcados para verificar existen,
 * no están eliminados y pertenecen a la empresa del empleado (regla 3).
 *
 * El `where('business_unit_id', …)` es explícito y es el filtro correcto
 * por sí solo. Se ejecuta dentro de `TenantContext.runUnscoped` para que el
 * mixin `withBusinessUnitScope` —que ANDea un filtro ambiental basado en el
 * header de la request— no interfiera: en particular, cuando un empleado
 * cambia de empresa (regla 5), el header permanece fijo en la empresa VIEJA
 * (la única forma de cargar al empleado), pero `resolution.businessUnitId`
 * es la nueva. Sin el bypass, el mixin recibiría un filtro ambiental que
 * intersecta la empresa nueva con la vieja, haciendo invisible cualquier
 * departamento/puesto legítimo de la empresa nueva. Inexistente, eliminado
 * y ajeno son indistinguibles en el resultado (regla 6).
 */
export type EmployeePositionDepartmentMismatch =
  | 'position-requires-department'
  | 'position-without-department-link'
  | 'position-department-mismatch'

export interface EmployeePositionDepartmentPair {
  departmentId: number | null
  positionId: number
  businessUnitId: number
}

/** Resultado puro. `linkedDepartmentIds` solo existe en el desajuste. */
export type EmployeePositionDepartmentVerification =
  | { ok: true }
  | { ok: false; reason: 'position-requires-department' }
  | { ok: false; reason: 'position-without-department-link' }
  | { ok: false; reason: 'position-department-mismatch'; linkedDepartmentIds: number[] }

/** Resultado del método: el desajuste trae además los nombres, ya filtrados por empresa. */
export type EmployeePositionDepartmentCheck =
  | Exclude<EmployeePositionDepartmentVerification, { reason: 'position-department-mismatch' }>
  | {
      ok: false
      reason: 'position-department-mismatch'
      linkedDepartmentIds: number[]
      positionName: string
      linkedDepartmentName: string
    }

/**
 * Alta (`current = null`): par si hay puesto. Edición: par solo si cambia
 * departamento, puesto o empresa contra lo guardado. Puesto null → null. Pura.
 */
export function resolveEmployeePositionDepartmentCheck(
  current: EmployeeStructureCurrent | null,
  next: { departmentId: number | null; positionId: number | null; businessUnitId: number }
): EmployeePositionDepartmentPair | null {
  if (next.positionId === null) {
    return null
  }

  const pair: EmployeePositionDepartmentPair = {
    departmentId: next.departmentId,
    positionId: next.positionId,
    businessUnitId: next.businessUnitId,
  }
  if (current === null) {
    return pair
  }

  const structureChanged =
    next.departmentId !== current.departmentId ||
    next.positionId !== current.positionId ||
    next.businessUnitId !== current.businessUnitId
  return structureChanged ? pair : null
}

/**
 * Orden: departamento null → requires; sin vínculos → without-link;
 * incluido → ok; si no → mismatch. Pura.
 */
export function evaluateEmployeePositionDepartment(
  pair: EmployeePositionDepartmentPair,
  linkedDepartmentIds: readonly number[]
): EmployeePositionDepartmentVerification {
  if (pair.departmentId === null) {
    return { ok: false, reason: 'position-requires-department' }
  }
  if (linkedDepartmentIds.length === 0) {
    return { ok: false, reason: 'position-without-department-link' }
  }
  if (linkedDepartmentIds.includes(pair.departmentId)) {
    return { ok: true }
  }
  return {
    ok: false,
    reason: 'position-department-mismatch',
    linkedDepartmentIds: [...linkedDepartmentIds],
  }
}

function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0
}

export default class EmployeeStructureService {
  async verifyAssignable(
    resolution: EmployeeStructureResolution
  ): Promise<EmployeeStructureVerification> {
    // Sin nada que verificar no se abre el bypass de tenant: runUnscoped
    // anota cada invocación en el log de auditoría aunque no consulte nada.
    if (resolution.departmentIdToVerify === null && resolution.positionIdToVerify === null) {
      return { ok: true }
    }

    return TenantContext.runUnscoped(
      async () => {
        if (resolution.departmentIdToVerify !== null) {
          const department = await Department.query()
            .where('department_id', resolution.departmentIdToVerify)
            .whereNull('department_deleted_at')
            .where('business_unit_id', resolution.businessUnitId)
            .first()
          if (!department) {
            return { ok: false, field: 'department', requestedId: resolution.departmentIdToVerify }
          }
        }

        if (resolution.positionIdToVerify !== null) {
          const position = await Position.query()
            .where('position_id', resolution.positionIdToVerify)
            .whereNull('position_deleted_at')
            .where('business_unit_id', resolution.businessUnitId)
            .first()
          if (!position) {
            return { ok: false, field: 'position', requestedId: resolution.positionIdToVerify }
          }
        }

        return { ok: true }
      },
      TENANT_UNSCOPED_REASON.EMPLOYEE_STRUCTURE
    )
  }

  /**
   * Comprueba que, si el empleado queda con puesto, ese puesto esté ligado
   * vigente al departamento en la empresa del empleado (VLRH-H1792361820794).
   * No llena el departamento. `null` no abre el bypass de tenant.
   */
  async verifyPositionDepartment(
    pair: EmployeePositionDepartmentPair | null
  ): Promise<EmployeePositionDepartmentCheck> {
    if (pair === null) {
      return { ok: true }
    }
    if (pair.departmentId === null) {
      return { ok: false, reason: 'position-requires-department' }
    }
    if (!isPositiveInteger(pair.businessUnitId)) {
      return { ok: false, reason: 'position-without-department-link' }
    }

    return TenantContext.runUnscoped(async () => {
      const links: {
        department_id: number | string
        position_name: string | null
        department_name: string | null
      }[] = await db
        .from('department_position as dp')
        .join('departments as d', 'd.department_id', 'dp.department_id')
        .join('positions as p', 'p.position_id', 'dp.position_id')
        .where('dp.position_id', pair.positionId)
        .where('dp.business_unit_id', pair.businessUnitId)
        .where('d.business_unit_id', pair.businessUnitId)
        .where('p.business_unit_id', pair.businessUnitId)
        .whereNull('dp.department_position_deleted_at')
        .whereNull('d.department_deleted_at')
        .whereNull('p.position_deleted_at')
        .orderBy('dp.department_id', 'asc')
        .select('dp.department_id', 'p.position_name', 'd.department_name')

      const linkedDepartmentIds = links.map((link) => Number(link.department_id))
      const verdict = evaluateEmployeePositionDepartment(pair, linkedDepartmentIds)
      if (verdict.ok || verdict.reason !== 'position-department-mismatch') {
        return verdict
      }

      const firstLink = links[0]
      return {
        ok: false,
        reason: 'position-department-mismatch',
        linkedDepartmentIds,
        positionName: firstLink?.position_name ?? '',
        linkedDepartmentName: firstLink?.department_name ?? '',
      }
    }, TENANT_UNSCOPED_REASON.EMPLOYEE_STRUCTURE)
  }
}
