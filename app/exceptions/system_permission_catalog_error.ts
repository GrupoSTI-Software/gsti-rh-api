/**
 * Error de dominio para violaciones de integridad del catálogo de módulos y
 * permisos (USRH1785766406720): slugs o claves duplicados, grupos no
 * declarados, estructura inconsistente. Sin superficie HTTP: lo lanzan
 * `validateCatalogIntegrity()` y `validateSystemModulesDeclaration()`, que corren
 * antes de sembrar (0062) y en `permissions:check-consistency` y detienen la
 * operación en consola.
 *
 * Sigue el contrato título/detalle/key del estándar aunque no viaje por HTTP:
 * `title` y `key` son fijos porque toda violación es la misma clase de fallo
 * (la constante no se puede sembrar), y `detail` nombra la regla y el slug que
 * la rompen. Sin mensajes en `resources/lang`: nadie lo traduce ni lo pinta.
 */
export class SystemPermissionCatalogError extends Error {
  readonly title = 'Catálogo de módulos inconsistente'
  readonly key = 'catalogo-de-modulos-inconsistente'
  readonly detail: string

  /**
   * @param detail  Regla violada y el slug o clave que la rompe. También es el
   *                `message`, para que la consola lo muestre sin formato extra.
   */
  constructor(detail: string) {
    super(detail)
    this.name = 'SystemPermissionCatalogError'
    this.detail = detail
  }
}
