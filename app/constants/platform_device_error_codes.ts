/**
 * Códigos estables para el cliente — catálogo de dispositivos de plataforma.
 * Prefijo PLT.DEV = PLaTaforma · DEVice.
 * Reutilizado por las rebanadas de inventario y asignación del mismo conjunto.
 */
export const PLATFORM_DEVICE_ERROR_CODES = {
  /** Body o query inválido (Vine) */
  VAL_INPUT: 'PLT.DEV.VAL_INPUT',
  /** Modelo no encontrado o con baja lógica */
  MODEL_NOT_FOUND: 'PLT.DEV.MODEL_NOT_FOUND',
  /** El slug enviado ya está registrado en el catálogo */
  MODEL_SLUG_TAKEN: 'PLT.DEV.MODEL_SLUG_TAKEN',
  /** Se intentó cambiar el slug de un modelo existente (es inmutable) */
  MODEL_SLUG_IMMUTABLE: 'PLT.DEV.MODEL_SLUG_IMMUTABLE',
  /** Error no tipado del sistema */
  SYS_UNHANDLED: 'PLT.DEV.SYS_UNHANDLED',
} as const

export type PlatformDeviceErrorCode =
  (typeof PLATFORM_DEVICE_ERROR_CODES)[keyof typeof PLATFORM_DEVICE_ERROR_CODES]
