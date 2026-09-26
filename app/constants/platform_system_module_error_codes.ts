/**
 * Códigos estables para el cliente — vista de módulos de plataforma.
 * Prefijo PLT.MOD = PLaTaforma · MODulo.
 *
 * `PLT.MOD.VAL_INPUT` y `PLT.MOD.MODULE_NOT_FOUND` salieron con el interruptor
 * `PUT /:systemModuleId/active`: no se reutilizan con otro significado para que
 * un cliente viejo no los confunda.
 */
export const PLATFORM_SYSTEM_MODULE_ERROR_CODES = {
  /** Error no tipado del sistema */
  SYS_UNHANDLED: 'PLT.MOD.SYS_UNHANDLED',
} as const
