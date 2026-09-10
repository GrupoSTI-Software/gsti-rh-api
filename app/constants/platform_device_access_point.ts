/**
 * Motivo auditado para `TenantContext.runUnscoped` al precargar el punto de
 * acceso del tenant desde el panel de plataforma (USRH1787189981879 · §13.1).
 *
 * El panel de plataforma no tiene `businessScope` montado en sus rutas — el
 * mixin `withBusinessUnitScope` es no-op ahí de todos modos (solo hookea
 * lecturas). `runUnscoped` no abre ningún filtro que no estuviera ya
 * abierto: solo deja rastro auditable (`logger.warn`) de que el panel
 * escribió en los datos de una empresa cliente y por qué.
 */
export const PLATFORM_DEVICE_ACCESS_POINT_RUN_UNSCOPED_REASON =
  'Precarga del punto de acceso del tenant al asignar una unidad de inventario desde el panel landlord'

/**
 * Motivo auditado para `TenantContext.runUnscoped` al desactivar el punto de
 * acceso del tenant al cerrar la entrega de una unidad (USRH1787189981883 · §13).
 *
 * Mismo razonamiento que la constante de precarga: el panel de plataforma
 * no tiene `businessScope` montado y el mixin de tenant solo hookea
 * lecturas, así que `runUnscoped` no abre ningún filtro adicional — solo
 * deja rastro auditable de que el panel escribió en datos de un cliente.
 */
export const PLATFORM_DEVICE_ACCESS_POINT_DEACTIVATE_REASON =
  'Desasignación de unidad de inventario: desactivar el punto de acceso del tenant'
