import type { HttpContext } from '@adonisjs/core/http'
import Employee from '#models/employee'

/**
 * El colaborador de la sesión, o `null` si la cuenta no tiene uno ligado.
 *
 * ## Por qué existe
 * Las rutas de avisos aceptaban `employeeId` por query y lo obedecían: con el
 * token de cualquier trabajador se podían leer —y marcar como leídos— los avisos
 * de otro. La presencia del parámetro sigue decidiendo la vista (con él, la del
 * colaborador; sin él, la de administración), pero **su valor se descarta**: lo
 * pone la sesión.
 *
 * ## Por qué cacheado en el contexto
 * `unread-count` se llama en cada arranque de la app y en cada vuelta al frente.
 * Sin caché, cada una de esas llamadas añadiría una consulta a `employees` para
 * resolver lo mismo. El molde es `ctx.permissionGate`.
 *
 * El predicado es el mismo que usa el gafete para resolver al colaborador por su
 * persona: activo y no borrado.
 */
export async function resolveSessionEmployeeId(ctx: HttpContext): Promise<number | null> {
  if (ctx.sessionEmployeeId !== undefined) {
    return ctx.sessionEmployeeId
  }

  const personId = ctx.auth?.user?.personId ?? null
  if (personId === null) {
    ctx.sessionEmployeeId = null
    return null
  }

  const employee = await Employee.query()
    .where('person_id', personId)
    .whereNull('employee_deleted_at')
    .first()

  ctx.sessionEmployeeId = employee?.employeeId ?? null
  return ctx.sessionEmployeeId
}

declare module '@adonisjs/core/http' {
  export interface HttpContext {
    /** Resuelto una vez por request. `undefined` = todavía sin resolver. */
    sessionEmployeeId?: number | null
  }
}
