import type {
  AssetCharacteristicType,
  AssetStatus,
  EmployeeAssetCustodyStatus,
  OpenAssignmentStatus,
} from '../assets.constants.js'
import type { SupplyTypeTeleworkCategory } from '#constants/supply_type_telework_category'

/** Colaborador que tiene el activo en resguardo. */
export interface AssetEmployeeDto {
  employeeId: number
  /** Slug del detalle del empleado en el BO (`/employees/<slug>`). */
  employeeSlug: string
  /** Ruta guardada de la foto; se sirve en `GET /api/employees/:id/photo`. `null` sin foto. */
  employeePhoto: string | null
  name: string
  positionName: string | null
  departmentName: string | null
  /** Sucursal base activa del colaborador. */
  branchName: string | null
}

/** Resguardo abierto del activo (a lo más uno): en poder del colaborador o en envío. */
export interface AssetActiveAssignmentDto {
  employeeSupplyId: number
  /** `active`: lo tiene el colaborador; `shipping`: va en camino hacia él. */
  status: OpenAssignmentStatus
  /** Fecha de calendario `YYYY-MM-DD` (fecha de asignación o, sin ella, de alta). */
  assignedAt: string
  /** Fecha de calendario `YYYY-MM-DD`; `null` si no vence. */
  expiresAt: string | null
  /** Notas del resguardo (`employeeSupplyAdditions`). */
  notes: string | null
  employee: AssetEmployeeDto
}

/** Un activo del listado. */
export interface AssetListItemDto {
  supplyId: number
  name: string
  fileNumber: string
  serialNumber: string | null
  description: string | null
  status: AssetStatus
  deactivationReason: string | null
  /** Fecha de calendario `YYYY-MM-DD`. */
  deactivationDate: string | null
  supplyType: { supplyTypeId: number; name: string }
  acquisitionValue: number | null
  /** Fecha de calendario `YYYY-MM-DD`. */
  acquisitionDate: string | null
  /** Último valor del historial; sin historial, el de adquisición (respeta 0). */
  currentValue: number | null
  activeAssignment: AssetActiveAssignmentDto | null
}

/** Paginación del listado. */
export interface AssetListMetaDto {
  total: number
  perPage: number
  currentPage: number
  lastPage: number
}

/** `data` de `GET /api/assets`. */
export interface AssetListResponseDto {
  meta: AssetListMetaDto
  data: AssetListItemDto[]
}

/** `data` de `GET /api/assets/summary` (solo activos `active`). */
export interface AssetsSummaryDto {
  inOperation: number
  assigned: number
  totalValue: number
  unassignedValue: number
}

/** Característica del tipo con el valor del activo (`null` si no lo tiene). */
export interface AssetCharacteristicValueDto {
  characteristicId: number
  name: string
  type: AssetCharacteristicType
  value: string | null
}

/** `data` de `GET /api/assets/:supplyId`. */
export interface AssetDetailDto extends AssetListItemDto {
  characteristicValues: AssetCharacteristicValueDto[]
}

/** Resguardo del historial del activo. */
export interface AssetAssignmentDto {
  employeeSupplyId: number
  status: 'active' | 'retired' | 'shipping'
  /** Fecha de calendario `YYYY-MM-DD`. */
  assignedAt: string
  expiresAt: string | null
  notes: string | null
  retirementReason: string | null
  /** Fecha de calendario `YYYY-MM-DD`. */
  retirementDate: string | null
  employee: {
    employeeId: number
    employeeSlug: string
    /** Ruta guardada de la foto; se sirve en `GET /api/employees/:id/photo`. */
    employeePhoto: string | null
    name: string
    positionName: string | null
  }
  /** Se descargan en `GET /api/employee-supplies-response-contracts/:id/file`. */
  contracts: Array<{ id: number; fileName: string | null }>
  /** Se descargan en `GET /api/employee-supply-assignation-photos/photo/:photoId/file`. */
  photos: Array<{ photoId: number; kind: 'assignation' | 'return' }>
}

/** Registro del historial de valor. */
export interface AssetValueHistoryEntryDto {
  supplyValueHistoryId: number
  amount: number
  notes: string | null
  /** ISO 8601 en UTC. */
  recordedAt: string
}

/** `data` de `GET /api/assets/:supplyId/value-history`. */
export interface AssetValueHistoryDto {
  acquisition: { value: number | null; date: string | null }
  /** Del más reciente al más antiguo. */
  entries: AssetValueHistoryEntryDto[]
}

/** Tipo de activo con su conteo y características. */
export interface AssetTypeDto {
  supplyTypeId: number
  name: string
  slug: string
  description: string | null
  /** Categoría de insumo de teletrabajo (NOM-037-STPS-2023); `null` sin marcar. */
  teleworkCategory: SupplyTypeTeleworkCategory | null
  /** Activos no borrados del tipo. */
  suppliesCount: number
  characteristics: Array<{ characteristicId: number; name: string; type: AssetCharacteristicType }>
}

/** Un valor a guardar en `PUT /api/assets/:supplyId/characteristic-values`. */
export interface AssetCharacteristicValueInput {
  characteristicId: number
  /** `null` o texto vacío quita el valor. */
  value: string | number | boolean | null
}

/** Perfil mínimo del colaborador para la lectura de sus activos. */
export interface AssetEmployeeProfile {
  employeeId: number
  /** Slug del detalle del empleado en el BO (`/employees/<slug>`). */
  employeeSlug: string
  businessUnitId: number
  /** Porcentaje de teletrabajo (DECIMAL); campo interno, no viaja en la respuesta. */
  teleworkPercentage: number
}

/** Característica capturada del activo con su último valor vivo. */
export interface EmployeeAssetCharacteristicDto {
  characteristicId: number
  name: string
  type: AssetCharacteristicType
  value: string
}

/** Activo tal como se muestra en un renglón de la ficha del colaborador. */
export interface EmployeeAssetDto {
  supplyId: number
  name: string
  fileNumber: string
  serialNumber: string | null
  status: AssetStatus
  /** El activo fue borrado lógicamente (sigue apareciendo, sin enlace). */
  isDeleted: boolean
  supplyType: { supplyTypeId: number; name: string | null }
  characteristics: EmployeeAssetCharacteristicDto[]
}

/** Campos comunes de un renglón de asignación (vigente o devuelto). */
export interface EmployeeAssetItemBase {
  employeeSupplyId: number
  /** Fecha de calendario `YYYY-MM-DD` (fecha de asignación o, sin ella, de alta). */
  assignedAt: string
  /** Fecha de calendario `YYYY-MM-DD`; `null` si no vence. */
  expiresAt: string | null
  /** `signed` si el resguardo tiene un contrato vivo; `unsigned` si no. */
  custodyStatus: EmployeeAssetCustodyStatus
  asset: EmployeeAssetDto
}

/** Asignación vigente del colaborador (en poder o en envío). */
export interface EmployeeAssetCurrentItemDto extends EmployeeAssetItemBase {
  status: OpenAssignmentStatus
  retirementDate: null
  retirementReason: null
}

/** Asignación devuelta del colaborador. */
export interface EmployeeAssetHistoryItemDto extends EmployeeAssetItemBase {
  status: 'retired'
  /** Fecha de calendario `YYYY-MM-DD`. */
  retirementDate: string | null
  retirementReason: string | null
}

/** Un renglón de asignación; `status` discrimina vigente de devuelta. */
export type EmployeeAssetItemDto = EmployeeAssetCurrentItemDto | EmployeeAssetHistoryItemDto

/** `data` de `GET /api/employees/:employeeId/assets`. */
export interface EmployeeAssetsDto {
  employeeId: number
  employeeSlug: string
  current: EmployeeAssetCurrentItemDto[]
  history: EmployeeAssetHistoryItemDto[]
}
