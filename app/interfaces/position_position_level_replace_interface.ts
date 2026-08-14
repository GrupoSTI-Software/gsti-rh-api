/**
 * Renglón del bloque `levels` del PUT /api/positions/:positionId/levels
 * (spec §10). XOR estricto: `positionLevelId` o `positionPositionLevelAdHocName`,
 * exactamente uno (regla 5); lo valida el servicio, no Vine.
 */
interface PositionPositionLevelRowInput {
  /** Presente cuando el renglón ya existe y debe conservar identidad. */
  positionPositionLevelId?: number | null
  positionLevelId?: number | null
  positionPositionLevelAdHocName?: string | null
  positionPositionLevelRank: number
  positionPositionLevelIsDefault: boolean
  positionPositionLevelActive: boolean
}

/**
 * Renglón serializado hacia los consumidores (CA-10): contrato que leen
 * ESB-03-01-03-03, el tabulador por nivel, el perfil por nivel y las rutas
 * de carrera.
 */
interface PositionPositionLevelView {
  positionPositionLevelId: number
  positionLevelId: number | null
  positionPositionLevelAdHocName: string | null
  /** Nombre del catálogo cuando `positionLevelId` viene; el ad-hoc cuando no. */
  displayName: string
  source: 'catalog' | 'adHoc'
  positionPositionLevelRank: number
  positionPositionLevelIsDefault: boolean
  positionPositionLevelActive: boolean
}

export type { PositionPositionLevelRowInput, PositionPositionLevelView }
