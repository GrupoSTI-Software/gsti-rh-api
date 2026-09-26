import type { BadgeEmployeeContext, BadgePublicRow } from './dto/badge.dto.js'

/**
 * Puerto de acceso a datos del módulo "Gafete del empleado"
 * (USRH1784686362321). La implementación MySQL (`badge.repository.mysql.ts`)
 * es la única que toca Lucid/SQL directamente.
 */
export interface BadgeRepository {
  /**
   * Empleado **activo** (sin soft delete, sin baja) dentro del scope de
   * `businessUnitIds` permitido. `null` si no existe, es de otro tenant,
   * está eliminado o dado de baja (regla 1: nunca revela la diferencia).
   */
  findActiveEmployeeInTenant(
    employeeId: number,
    businessUnitIds: number[]
  ): Promise<BadgeEmployeeContext | null>

  /**
   * Empleados **activos** del scope tenant-safe para un lote (E6). Omite
   * inexistentes, de otro tenant, eliminados o dados de baja. El orden de
   * salida sigue el del array deduplicado de entrada.
   */
  findActiveEmployeesInTenant(
    employeeIds: number[],
    businessUnitIds: number[]
  ): Promise<BadgeEmployeeContext[]>

  /**
   * Empleado **activo** propio del usuario autenticado (E3, self-scope por
   * `personId`), dentro del scope de `businessUnitIds` permitido.
   */
  findActiveEmployeeByPersonId(
    personId: number,
    businessUnitIds: number[]
  ): Promise<BadgeEmployeeContext | null>

  /**
   * Genera y persiste el token si `employees.employee_badge_token IS NULL`
   * (concurrencia-segura vía `UPDATE ... WHERE employee_badge_token IS NULL`
   * + relectura). Si ya existe, lo devuelve intacto. Reintenta una vez en
   * colisión UNIQUE (probabilidad despreciable a 256 bits).
   */
  resolveOrCreateToken(employeeId: number): Promise<string>

  /**
   * Lookup público por token (E4): `withTrashed()` sobre el empleado (R5) +
   * proyección mínima explícita. Jamás serializa modelos Lucid completos.
   * `null` si el token es inexistente (formato válido pero sin match).
   */
  findPublicByToken(token: string): Promise<BadgePublicRow | null>
}
