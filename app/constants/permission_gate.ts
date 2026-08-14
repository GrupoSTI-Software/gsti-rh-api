/**
 * Comportamiento de salvoconducto de una operación protegida (regla del
 * catálogo de USRH1785766406721). No hay valor por omisión: cada operación
 * protegida declara exactamente uno de los cuatro.
 */
export type PermissionGateBypass = 'standard' | 'expanded' | 'platformReserved' | 'strict'

/**
 * Contrato que cada operación protegida declara en el mismo lugar en que se
 * declara la ruta. `module` es un slug libre (no forzado al catálogo cerrado
 * de módulos): el módulo piloto de esta historia ('compliance-contratos')
 * no existe todavía en `system_modules` ni en el catálogo tipado, y forzar
 * el tipo rompería la declaración del piloto.
 */
export interface PermissionGateOptions {
  module: string
  action: string
  bypass: PermissionGateBypass
}
