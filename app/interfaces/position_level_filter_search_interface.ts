/** Filtros del listado del catálogo de niveles de puesto (USRH1785273891312). */
interface PositionLevelFilterSearchInterface {
  businessUnitId: number
  /** `true` = solo activos (el listado que consumirá USRH1785273891313). */
  active?: boolean
  search?: string
}

export type { PositionLevelFilterSearchInterface }
