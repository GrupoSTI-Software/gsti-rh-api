import BusinessUnit from '#models/business_unit'
import User from '#models/user'

/**
 * Resolvedor central del alcance de unidades de negocio accesibles para un usuario.
 *
 * Centraliza la lógica que determina qué business_unit_id puede ver un usuario,
 * reemplazando el patrón disperso de SYSTEM_BUSINESS + filtros manuales.
 *
 * Regla:
 *  - Rol "root"     → todas las unidades activas y no eliminadas.
 *  - Cualquier otro → únicamente las unidades asignadas al usuario en la pivote
 *                     `business_unit_users`, activas y no eliminadas.
 */
export default class BusinessAccessScopeService {
  /**
   * Devuelve los IDs de unidades de negocio accesibles para el usuario dado.
   *
   * El usuario debe tener `role` precargado; si no lo está, el método lo carga.
   * En ambos casos la relación `businessUnits` se consulta directamente sin
   * requerir que venga precargada en el objeto recibido.
   *
   * @param user - Usuario autenticado (instancia de User).
   * @returns Arreglo de `businessUnitId` accesibles. Vacío si el usuario no tiene
   *          unidades asignadas y no es root.
   */
  async getAccessibleIds(user: User): Promise<number[]> {
    if (!user.role) {
      await user.load('role')
    }

    if (user.role?.roleSlug === 'root') {
      return this.getAllActiveIds()
    }

    return this.getUserAssignedIds(user.userId)
  }

  /**
   * Devuelve los IDs de todas las unidades de negocio activas y no eliminadas.
   * Usado exclusivamente para usuarios con rol root.
   */
  private async getAllActiveIds(): Promise<number[]> {
    const units = await BusinessUnit.query()
      .where('business_unit_active', 1)
      .whereNull('business_unit_deleted_at')
      .select('business_unit_id')
      .orderBy('business_unit_id', 'asc')

    return units.map((unit) => unit.businessUnitId)
  }

  /**
   * Devuelve los IDs de las unidades asignadas al usuario en la pivote,
   * filtrando solo las que están activas y no eliminadas.
   */
  private async getUserAssignedIds(userId: number): Promise<number[]> {
    const user = await User.query()
      .where('user_id', userId)
      .preload('businessUnits', (query) => {
        query
          .where('business_unit_active', 1)
          .whereNull('business_unit_deleted_at')
          .select('business_unit_id')
      })
      .first()

    if (!user) return []

    return user.businessUnits.map((unit) => unit.businessUnitId)
  }
}
