/**
 * Reglas fijas del módulo Activos (`/api/assets`, `/api/asset-types`).
 */

/** Estados de un activo (columna `supplies.supply_status`). */
export const ASSET_STATUSES = ['active', 'inactive', 'lost', 'damaged'] as const
export type AssetStatus = (typeof ASSET_STATUSES)[number]

/** Estados destino de una baja: cualquiera menos `active`. */
export const ASSET_DEACTIVATION_STATUSES = ['inactive', 'lost', 'damaged'] as const
export type AssetDeactivationStatus = (typeof ASSET_DEACTIVATION_STATUSES)[number]

/**
 * Estado que acepta `PUT /api/supplies/:id`: solo reactivar. Las bajas pasan
 * por `PUT /api/supplies/:id/deactivate`, que guarda motivo y fecha y cierra
 * el resguardo; por el PUT genérico el activo quedaba de baja con el
 * resguardo abierto.
 */
export const ASSET_UPDATE_STATUSES = ['active'] as const

/**
 * Estados de un resguardo que comprometen el activo: `active` (lo tiene el
 * colaborador) y `shipping` (va en camino hacia él). Un activo tiene a lo más
 * uno abierto, no se borra con uno abierto y la baja los cierra.
 */
export const OPEN_ASSIGNMENT_STATUSES = ['active', 'shipping'] as const

/**
 * Filtro de estado del listado:
 * - `available`: activo en operación sin resguardo activo.
 * - `assigned`: activo en operación con resguardo activo.
 * - `retired`: activo dado de baja (cualquier estado distinto de `active`).
 */
export const ASSET_STATE_FILTERS = ['all', 'available', 'assigned', 'retired'] as const
export type AssetStateFilter = (typeof ASSET_STATE_FILTERS)[number]

/** Tipos de característica que admite la BD (`supplie_caracteristics`). */
export const ASSET_CHARACTERISTIC_TYPES = ['text', 'number', 'date', 'boolean'] as const
export type AssetCharacteristicType = (typeof ASSET_CHARACTERISTIC_TYPES)[number]

/** Tope de registros por página del listado. */
export const ASSETS_LIST_MAX_LIMIT = 500
export const ASSETS_LIST_DEFAULT_LIMIT = 20

/** Tope de fotos de asignación por resguardo. */
export const MAX_ASSIGNATION_PHOTOS_PER_ASSIGNMENT = 6

/** Nota del primer registro del historial al dar de alta un activo con valor. */
export const ACQUISITION_VALUE_HISTORY_NOTE = 'Valor de adquisición'

/** Primer segmento del nombre de las descargas (nunca lleva datos del empleado). */
export const ASSET_FILE_NAME_PREFIX = {
  responseContract: 'resguardo-activo',
  assignationPhoto: 'foto-asignacion-activo',
  returnPhoto: 'foto-devolucion-activo',
} as const

/** Keys semánticas de error del módulo (contrato título/detalle/key). */
export const ASSET_ERROR_KEYS = {
  ASSET_NOT_FOUND: 'activo-no-encontrado',
  FILE_NUMBER_TAKEN: 'folio-de-activo-duplicado',
  ACTIVE_ASSIGNMENT_EXISTS: 'activo-ya-tiene-resguardo-activo',
  ASSET_HAS_ACTIVE_ASSIGNMENT: 'activo-con-resguardo-activo',
  TYPE_HAS_ASSETS: 'tipo-de-activo-con-activos',
  CHARACTERISTIC_NOT_IN_TYPE: 'caracteristica-no-pertenece-al-tipo',
  CHARACTERISTIC_VALUE_INVALID: 'valor-de-caracteristica-invalido',
  PHOTO_LIMIT_EXCEEDED: 'limite-de-fotos-excedido',
  FILE_NOT_FOUND: 'archivo-no-encontrado',
  INVALID_INPUT: 'entrada-invalida',
  UNEXPECTED: 'error-inesperado',
} as const

export type AssetErrorKey = (typeof ASSET_ERROR_KEYS)[keyof typeof ASSET_ERROR_KEYS]
