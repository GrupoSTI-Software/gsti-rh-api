import type { AssetStateFilter } from './assets.constants.js'
import type {
  AssetAssignmentDto,
  AssetCharacteristicValueDto,
  AssetEmployeeProfile,
  AssetListItemDto,
  AssetListResponseDto,
  AssetsSummaryDto,
  AssetTypeDto,
  AssetValueHistoryEntryDto,
  EmployeeAssetItemDto,
} from './dto/assets.dto.js'
import type { TeleworkCoverageRow, TeleworkProfile } from './dto/telework_supplies.dto.js'

/** Filtro del listado. `businessUnitIds` vacío = sin resultados. */
export interface AssetListFilter {
  businessUnitIds: readonly number[]
  search?: string
  supplyTypeId?: number
  state: AssetStateFilter
  page: number
  limit: number
}

/** Lo mínimo del activo para escribir sobre él. */
export interface AssetOwnership {
  supplyId: number
  supplyTypeId: number
  businessUnitId: number | null
}

/** Valor de característica ya normalizado (`null` = quitar). */
export interface AssetCharacteristicValueWrite {
  characteristicId: number
  value: string | null
}

/** Referencia al archivo guardado; nunca sale del API. */
export interface AssetStoredFile {
  id: number
  storedPath: string | null
}

/**
 * Contrato del repositorio de Activos. Cada lectura es una consulta (o una por
 * colección embebida), con joins y subconsultas: sin N+1. Todas respetan el
 * borrado lógico y el scope de empresas de la petición.
 */
export interface AssetsRepository {
  list(filter: AssetListFilter): Promise<AssetListResponseDto>
  summary(businessUnitIds: readonly number[], supplyTypeId?: number): Promise<AssetsSummaryDto>
  findById(businessUnitIds: readonly number[], supplyId: number): Promise<AssetListItemDto | null>
  findOwnership(businessUnitIds: readonly number[], supplyId: number): Promise<AssetOwnership | null>
  /** Todas las características vivas del tipo, con el valor del activo o `null`. */
  findCharacteristicValues(supplyId: number, supplyTypeId: number): Promise<AssetCharacteristicValueDto[]>
  findAssignments(businessUnitIds: readonly number[], supplyId: number): Promise<AssetAssignmentDto[]>
  /**
   * Perfil del colaborador acotado al alcance de empresas de la petición. Un
   * colaborador dado de baja sigue consultable (no se filtra por borrado).
   * Alcance vacío → `null` sin consultar.
   */
  findEmployeeProfile(
    businessUnitIds: readonly number[],
    employeeId: number
  ): Promise<AssetEmployeeProfile | null>
  /**
   * Asignaciones (vigentes y devueltas) del colaborador, con su resguardo y sus
   * características capturadas. Alcance vacío → `[]` sin consultar.
   */
  findEmployeeAssignments(
    businessUnitIds: readonly number[],
    employeeId: number
  ): Promise<EmployeeAssetItemDto[]>
  /**
   * Perfiles de teletrabajo de un lote de colaboradores, con el alcance de
   * empresas DENTRO de la consulta. No filtra por borrado del colaborador
   * (R12: la baja se resuelve como `applies: false` en las reglas puras).
   * Cualquier argumento vacío → `[]` sin consultar. Una sola consulta por lote.
   */
  findTeleworkProfiles(
    businessUnitIds: readonly number[],
    employeeIds: readonly number[]
  ): Promise<TeleworkProfile[]>
  /**
   * Renglones de cobertura abierta (resguardos `active`/`shipping` de insumos
   * con categoría de teletrabajo) de un lote de colaboradores, con el alcance
   * de empresas DENTRO de la consulta y el resguardo firmado por `EXISTS`.
   * Cualquier argumento vacío → `[]` sin consultar. Una sola consulta por lote.
   */
  findTeleworkCoverage(
    businessUnitIds: readonly number[],
    employeeIds: readonly number[]
  ): Promise<TeleworkCoverageRow[]>
  findValueHistory(supplyId: number): Promise<AssetValueHistoryEntryDto[]>
  findTypes(businessUnitIds: readonly number[]): Promise<AssetTypeDto[]>
  upsertCharacteristicValues(
    asset: AssetOwnership,
    values: readonly AssetCharacteristicValueWrite[]
  ): Promise<void>
  findResponseContractFile(
    businessUnitIds: readonly number[],
    contractId: number
  ): Promise<AssetStoredFile | null>
  findAssignationPhotoFile(
    businessUnitIds: readonly number[],
    photoId: number
  ): Promise<(AssetStoredFile & { kind: 'assignation' | 'return' }) | null>
}
