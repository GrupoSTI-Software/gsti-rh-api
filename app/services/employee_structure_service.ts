import Department from '#models/department'
import Position from '#models/position'
import { TenantContext } from '#utils/tenant_context'

/** Departamento, puesto y empresa que el empleado tiene GUARDADOS. */
export interface EmployeeStructureCurrent {
  departmentId: number | null
  positionId: number | null
  businessUnitId: number
}

/**
 * Lo que trae la edición, ya validada. Clave ausente = no tocar ese campo;
 * `null` = dejar sin asignar (USRH1788466831270, reglas 2 y 9).
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
export default class EmployeeStructureService {
  async verifyAssignable(
    resolution: EmployeeStructureResolution
  ): Promise<EmployeeStructureVerification> {
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
      'EmployeeStructureService.verifyAssignable: filtra explicitamente por la empresa del empleado, no por el scope ambiental del actor'
    )
  }
}
