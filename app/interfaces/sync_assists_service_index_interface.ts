interface SyncAssistsServiceIndexInterface {
  date: string
  dateEnd: string
  employeeID?: number
  withOutExternal?: boolean
}

/**
 * Opciones de `SyncAssistsService.index` que no vienen de la petición.
 * `includeAssistLocationFlag` proyecta la marca de ubicación de cada checada
 * (VLRH-H1791056345261); apagada por omisión: solo la enciende
 * `AssistsController.index` tras evaluar la visibilidad.
 */
interface SyncAssistsIndexOptions {
  includeAssistLocationFlag?: boolean
}

export type { SyncAssistsServiceIndexInterface, SyncAssistsIndexOptions }
