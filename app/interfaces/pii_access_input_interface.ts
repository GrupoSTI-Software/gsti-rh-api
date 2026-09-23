interface PiiAccessInputInterface {
  businessUnitId: number
  accessorUserId: number
  model: string
  modelColumn: string
  recordId: number
  accessorIp: string
  accessorUserAgent?: string | null
  requestId?: string | null
  /** Trabajador titular del dato revelado; omitir o null si no aplica (p. ej. empresa contratante). */
  subjectEmployeeId?: number | null
  /** Pantalla de origen saneada (`X-Origin-Module`); null si no se informó o no es válida. */
  originModule?: string | null
}

export type { PiiAccessInputInterface }
