/**
 * Error de dominio para violaciones de integridad del catálogo de módulos y
 * permisos (USRH1785766406720): slugs o claves duplicados, grupos no
 * declarados, estructura inconsistente. Sin superficie HTTP: lo lanzan
 * `validateCatalogIntegrity()` y `validateSystemModulesDeclaration()`, que corre
 * antes de sembrar (0062) y en `permissions:check-consistency` y detiene la
 * operación en consola.
 */
export class SystemPermissionCatalogError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SystemPermissionCatalogError'
  }
}
