/**
 * Error de dominio para violaciones de integridad del índice maestro de
 * módulos y permisos (USRH1785766406720): slugs duplicados, estructura
 * inconsistente, etc. Sin superficie HTTP — este catálogo no tiene endpoint
 * propio; el error se usa en `validateCatalogIntegrity()` y en sus tests.
 */
export class SystemPermissionCatalogError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SystemPermissionCatalogError'
  }
}
