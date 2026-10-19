export interface AccessPointFilterSearchInterface {
  search?: string
  page: number
  limit: number
  businessUnitId: number
  /** Alcance de la peticion: la empresa pedida solo cuenta si esta aqui. */
  allowedBusinessUnitIds: number[]
}
