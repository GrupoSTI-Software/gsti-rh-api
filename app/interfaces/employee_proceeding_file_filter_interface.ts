interface EmployeeProceedingFileFilterInterface {
  dateStart: string
  dateEnd: string
  /**
   * Puesto por el controlador desde el alcance resuelto: `true` para acceso
   * completo y root, `false` para acceso restringido. Nunca proviene del
   * cliente. USRH1788466831312.
   */
  includeUnassigned?: boolean
}
export type { EmployeeProceedingFileFilterInterface }
