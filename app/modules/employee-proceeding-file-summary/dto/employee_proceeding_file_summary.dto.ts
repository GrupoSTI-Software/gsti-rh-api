/** Conteos de una carpeta visible del expediente. */
export interface EmployeeProceedingFileSummaryFolderDto {
  proceedingFileTypeId: number
  /** Archivos del empleado directamente en esta carpeta (no recursivo). */
  documentsCount: number
  /** Subcarpetas directas visibles para el empleado. */
  subfoldersCount: number
}

/** Respuesta de `GET /api/employees/:employeeId/proceeding-file-summary` (`data`). */
export interface EmployeeProceedingFileSummaryDto {
  /** Días de la ventana de "por vencer" con la que se calculó `expiringOrExpired`. */
  windowDays: number
  totals: {
    /** Archivos de todas las carpetas visibles + contratos. */
    documents: number
    /** Carpetas visibles (todas las profundidades) + la carpeta virtual de contratos. */
    folders: number
    /** Archivos activos (`proceeding_file_active = 1`) vencidos o que vencen dentro de la ventana. */
    expiringOrExpired: number
  }
  contracts: {
    documents: number
  }
  /** Una fila por carpeta visible, raíz y subcarpetas, en orden de recorrido (hermanos por id). */
  folders: EmployeeProceedingFileSummaryFolderDto[]
}
