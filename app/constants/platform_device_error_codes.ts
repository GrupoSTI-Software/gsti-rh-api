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
  /** El número de serie ya está registrado en otra unidad del inventario (incluyendo dadas de baja) */
  DEVICE_SERIAL_TAKEN: 'PLT.DEV.DEVICE_SERIAL_TAKEN',
  /** El modelo elegido no está en estado vigente y no puede usarse en altas (puede estar en_validacion o descontinuado) */
  MODEL_NOT_SELECTABLE: 'PLT.DEV.MODEL_NOT_SELECTABLE',
  /** Se enviaron costo o fecha de adquisición para un aparato de origen del_cliente */
  COST_NOT_ALLOWED_FOR_ORIGIN: 'PLT.DEV.COST_NOT_ALLOWED_FOR_ORIGIN',
  /** Unidad del inventario no encontrada o con baja lógica */
  DEVICE_NOT_FOUND: 'PLT.DEV.DEVICE_NOT_FOUND',
  /** Error no tipado del sistema */
  SYS_UNHANDLED: 'PLT.DEV.SYS_UNHANDLED',
} as const

export type PlatformDeviceErrorCode =
  (typeof PLATFORM_DEVICE_ERROR_CODES)[keyof typeof PLATFORM_DEVICE_ERROR_CODES]
