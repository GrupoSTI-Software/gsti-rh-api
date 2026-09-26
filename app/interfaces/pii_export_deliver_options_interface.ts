import type { PiiAccessLogColumnRefInterface } from './pii_access_log_column_ref_interface.js'

interface PiiExportDeliverOptionsInterface {
  exportKey: string
  sensitiveColumns: PiiAccessLogColumnRefInterface[]
  /** Titulares incluidos en el archivo; puede resolverse de forma asíncrona. */
  employeeIds: number[] | (() => Promise<number[]>)
  filters: Record<string, unknown>
  businessUnitId: number
  originModule?: string | null
}

export type { PiiExportDeliverOptionsInterface }
