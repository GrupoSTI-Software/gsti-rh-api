interface PermissionsDatesExcelFilterInterface {
  filterDate: string
  filterDateEnd: string
  userResponsibleId?: number | null
  businessUnitId?: number
  payrollBusinessUnitId?: number
  /**
   * Puesto por el controlador desde el alcance resuelto: `true` para acceso
   * completo y root, `false` para acceso restringido. Nunca proviene del
   * cliente. USRH1788466831312.
   */
  includeUnassigned?: boolean
}

export type { PermissionsDatesExcelFilterInterface }

