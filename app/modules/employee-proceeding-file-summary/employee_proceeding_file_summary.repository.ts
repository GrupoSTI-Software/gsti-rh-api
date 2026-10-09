/** Alcance común a todas las consultas del resumen. */
export interface EmployeeProceedingFileSummaryScope {
  employeeId: number
  /** Unidades de negocio de la petición (scope del tenant). Vacío = sin resultados. */
  businessUnitIds: readonly number[]
}

/**
 * Carpeta del árbol del expediente del colaborador, antes de aplicar la regla
 * de exclusivas. Incluye las raíces del área y todos sus descendientes vivos.
 */
export interface EmployeeProceedingFolderRecord {
  proceedingFileTypeId: number
  parentId: number | null
  isExclusive: boolean
  /** La carpeta exclusiva tiene asignado a este empleado. */
  assignedToEmployee: boolean
}

/** Archivos del empleado agrupados por carpeta. */
export interface EmployeeProceedingFileCountRecord {
  proceedingFileTypeId: number
  documents: number
  /** Archivos activos cuyo vencimiento es anterior al día siguiente del horizonte. */
  expiringOrExpired: number
}

/** Parámetros del conteo de archivos. */
export interface EmployeeProceedingFileCountParams extends EmployeeProceedingFileSummaryScope {
  /** Último día incluido en la ventana de "por vencer" (`YYYY-MM-DD`, zona de negocio). */
  horizon: string
}

/**
 * Contrato del repositorio del resumen: consultas agregadas, sin N+1. Todas
 * respetan el borrado lógico y el scope del tenant.
 */
export interface EmployeeProceedingFileSummaryRepository {
  /** El empleado existe en el tenant (incluye a los dados de baja, como el expediente). */
  employeeExists(scope: EmployeeProceedingFileSummaryScope): Promise<boolean>
  /** Árbol completo de carpetas del área del colaborador visible para el tenant. */
  findFolders(scope: EmployeeProceedingFileSummaryScope): Promise<EmployeeProceedingFolderRecord[]>
  /** Conteo de archivos del empleado por carpeta. */
  countFilesByFolder(
    params: EmployeeProceedingFileCountParams
  ): Promise<EmployeeProceedingFileCountRecord[]>
  /** Contratos vivos del empleado. */
  countContracts(scope: EmployeeProceedingFileSummaryScope): Promise<number>
}
