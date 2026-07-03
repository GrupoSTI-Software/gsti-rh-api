import BusinessUnit from '#models/business_unit'
import User from '#models/user'

/** Regex de validación para UUID v4. */
const UUID_V4_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

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
   * Resuelve un código público (UUID v4) al ID interno de la unidad de negocio,
   * validando que pertenezca al scope accesible del usuario.
   *
   * Devuelve `null` en los siguientes casos — intencionalmente indistinguibles
   * para el cliente (regla de negocio: no filtrar existencia):
   *  - El valor no tiene formato UUID v4 válido.
   *  - El UUID existe pero la unidad está fuera del scope del usuario.
   *  - El UUID no existe en la base de datos.
   *
   * @param publicId    - Código público recibido del cliente.
   * @param scopeIds    - IDs internos accesibles para el usuario (de getAccessibleIds).
   * @returns ID interno o `null`.
   */
  async resolveInternalId(publicId: string, scopeIds: number[]): Promise<number | null> {
    if (!UUID_V4_RE.test(publicId)) return null
    if (scopeIds.length === 0) return null

    const unit = await BusinessUnit.query()
      .where('business_unit_public_id', publicId)
      .whereIn('business_unit_id', scopeIds)
      .whereNull('business_unit_deleted_at')
      .select('business_unit_id')
      .first()

    return unit?.businessUnitId ?? null
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
