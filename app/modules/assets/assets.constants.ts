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
export type OpenAssignmentStatus = (typeof OPEN_ASSIGNMENT_STATUSES)[number]

/**
 * Estado de cobertura de una categoría de insumo de teletrabajo vista en la
 * matriz de cumplimiento (NOM-037-STPS-2023 5.7, R5). Prioridad:
 * `delivered` si hay algún resguardo `active`; si no, `shipping` si hay
 * resguardos abiertos; si no hay ninguno, `own_equipment` cuando el
 * colaborador declaró equipo propio, `uncovered` para silla y cómputo, y
 * `not_delivered` para el aditamento (opcional). Un insumo devuelto no cubre.
 */
export const TELEWORK_SUPPLY_COVERAGE_STATUSES = [
  'delivered',
  'shipping',
  'own_equipment',
  'uncovered',
  'not_delivered',
] as const
export type TeleworkSupplyCoverageStatus = (typeof TELEWORK_SUPPLY_COVERAGE_STATUSES)[number]

/**
 * Estado del resguardo de una asignación vista desde la ficha del colaborador:
 * `signed` si existe al menos un contrato de resguardo vivo, `unsigned` si no.
 */
export const EMPLOYEE_ASSET_CUSTODY_STATUSES = ['signed', 'unsigned'] as const
export type EmployeeAssetCustodyStatus = (typeof EMPLOYEE_ASSET_CUSTODY_STATUSES)[number]

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
  /** Descarga de la evidencia de la declaración de equipo propio (CA-7). */
  ownEquipmentEvidence: 'equipo-propio',
} as const

/**
 * Carpeta del objeto de la evidencia de una declaración de equipo propio
 * (VLRH-H1791493046616, §14): la key es
 * `own-equipment-declarations/${businessUnitId}/${cuid()}` —la empresa sale de
 * la fila del colaborador leída en alcance, nunca del body— y sin el nombre que
 * mandó el cliente, que solo aporta su extensión.
 */
export const OWN_EQUIPMENT_EVIDENCE_S3_FOLDER = 'own-equipment-declarations'

/**
 * Estados de una declaración de equipo propio (`..._status`, regla 3): `active`
 * es la vigente —a lo más una por colaborador y categoría— y `closed` es
 * terminal (la cierra la hermana de ajuste y término).
 */
export const OWN_EQUIPMENT_DECLARATION_STATUSES = ['active', 'closed'] as const
export type OwnEquipmentDeclarationStatus = (typeof OWN_EQUIPMENT_DECLARATION_STATUSES)[number]

/**
 * Origen de la cuota mensual de compensación (`..._fee_source`, regla 5):
 * `default` la propone el sistema y `adjusted` la captura RH. Esta historia
 * siempre escribe `adjusted`; la precarga de `default` llega con su hermana.
 */
export const OWN_EQUIPMENT_FEE_SOURCES = ['default', 'adjusted'] as const
export type OwnEquipmentFeeSource = (typeof OWN_EQUIPMENT_FEE_SOURCES)[number]

/**
 * Motivos de cierre que RH puede elegir al terminar una declaración (regla 8):
 * el catálogo del `Select` y el `vine.enum` del término. `adjusted` NO está
 * aquí: es el motivo reservado al sistema cuando el cierre viene de un ajuste,
 * y por eso no es seleccionable (R8).
 */
export const OWN_EQUIPMENT_CLOSE_REASONS = [
  'company_equipment_assigned',
  'telework_ended',
  'conditions_changed',
  'other',
] as const

/** Motivo de cierre reservado al sistema (R8): lo pone el ajuste, no RH. */
export const OWN_EQUIPMENT_ADJUSTED_CLOSE_REASON = 'adjusted'

/** Motivo de cierre de una declaración: los del catálogo o el del sistema. */
export type OwnEquipmentClosedReason =
  | (typeof OWN_EQUIPMENT_CLOSE_REASONS)[number]
  | typeof OWN_EQUIPMENT_ADJUSTED_CLOSE_REASON

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
  TELEWORK_CATEGORY_INVALID: 'categoria-de-insumo-invalida',
  TYPE_NOT_FOUND: 'tipo-de-activo-no-encontrado',
  EMPLOYEE_NOT_FOUND: 'colaborador-no-encontrado',
  INVALID_INPUT: 'entrada-invalida',
  UNEXPECTED: 'error-inesperado',
  CATEGORY_COVERED_BY_ASSET: 'categoria-cubierta-por-activo',
  EMPLOYEE_WITHOUT_TELEWORK: 'colaborador-sin-teletrabajo',
  OWN_EQUIPMENT_DECLARATION_OPEN_EXISTS: 'declaracion-de-equipo-propio-vigente-existente',
  OWN_EQUIPMENT_FEE_INVALID: 'cuota-de-equipo-propio-invalida',
  DECLARATION_NOT_FOUND: 'declaracion-de-equipo-propio-no-encontrada',
  DECLARATION_NOT_ACTIVE: 'declaracion-de-equipo-propio-no-vigente',
} as const

export type AssetErrorKey = (typeof ASSET_ERROR_KEYS)[keyof typeof ASSET_ERROR_KEYS]
