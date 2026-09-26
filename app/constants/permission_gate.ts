/**
 * Comportamiento de salvoconducto de una operación protegida (regla del
 * catálogo de USRH1785766406721). No hay valor por omisión: cada operación
 * protegida declara exactamente uno de los cuatro.
 */
export type PermissionGateBypass = 'standard' | 'expanded' | 'platformReserved' | 'strict'

/**
 * Contrato que cada operación protegida declara en el mismo lugar en que se
 * declara la ruta. `module` es un slug libre (string, no el tipo cerrado del
 * catálogo) para no acoplar las declaraciones de ruta al catálogo tipado. Si
 * el slug no existe en `system_modules`, el gate lo trata como exigido y niega
 * a quien no tenga salvoconducto (fail-closed, `permission_gate_service.ts`).
 */
export interface PermissionGateOptions {
  module: string
  /**
   * Slug de la acción, o lista de slugs en OR: basta con que el rol tenga
   * cualquiera. Un solo permissionGate por ruta; no apilar dos gates.
   */
  action: string | readonly string[]
  bypass: PermissionGateBypass
}
