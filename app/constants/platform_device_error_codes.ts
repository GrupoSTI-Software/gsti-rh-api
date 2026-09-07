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
  /** La unidad no está disponible para asignar (ya está asignada o retirada) */
  ASSIGN_NOT_AVAILABLE: 'PLT.DEV.ASSIGN_NOT_AVAILABLE',
  /** El tenant no tiene la habilitación de biométricos en sitio encendida */
  ASSIGN_TENANT_NOT_ENABLED: 'PLT.DEV.ASSIGN_TENANT_NOT_ENABLED',
  /** Empresa (tenant) no encontrada o sin alta en el sistema */
  TENANT_NOT_FOUND: 'PLT.DEV.TENANT_NOT_FOUND',
  /** No se puede desactivar ni retirar una unidad con entrega abierta (RN7 del spec 1877) */
  LIFECYCLE_HAS_OPEN_ASSIGNMENT: 'PLT.DEV.LIFECYCLE_HAS_OPEN_ASSIGNMENT',
  /** La unidad ya fue retirada; el retiro es irreversible (RN4 del spec 1877) */
  LIFECYCLE_ALREADY_RETIRED: 'PLT.DEV.LIFECYCLE_ALREADY_RETIRED',
  /** La serie ya está viva en un access_point con platformDeviceId poblado de OTRO tenant (colisión real, CA-3 del spec 1879) */
  SERIAL_TAKEN_BY_OTHER_TENANT: 'PLT.DEV.SERIAL_TAKEN_BY_OTHER_TENANT',
  /** La serie ya está viva en un access_point sin platformDeviceId de OTRO tenant (probable auto-descubrimiento, CA-10 del spec 1879) */
  SERIAL_TAKEN_BY_AUTODISCOVERY: 'PLT.DEV.SERIAL_TAKEN_BY_AUTODISCOVERY',
  /** La unidad a precargar no tiene número de serie (defensivo, CA-5 del spec 1879) */
  DEVICE_SERIAL_MISSING: 'PLT.DEV.DEVICE_SERIAL_MISSING',
  /** Falló la materialización del punto de acceso del tenant; revierte toda la transacción (CA-4 del spec 1879) */
  ACCESS_POINT_PRELOAD_FAILED: 'PLT.DEV.ACCESS_POINT_PRELOAD_FAILED',
  /** Error no tipado del sistema */
  SYS_UNHANDLED: 'PLT.DEV.SYS_UNHANDLED',
} as const

export type PlatformDeviceErrorCode =
  (typeof PLATFORM_DEVICE_ERROR_CODES)[keyof typeof PLATFORM_DEVICE_ERROR_CODES]
