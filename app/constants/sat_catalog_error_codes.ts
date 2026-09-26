/**
 * Códigos estables para los catálogos fiscales del SAT.
 * Prefijo SAT.CAT = SAT · CATalog.
 *
 * Contrato fijado por USRH1786737531063 — no renombrar sin escalar a Wilvardo.
 */
export const SAT_CATALOG_ERROR_CODES = {
  /** Tablas vacías: seeder no corrido */
  CATALOG_UNAVAILABLE: 'SAT.CAT.CATALOG_UNAVAILABLE',
  /** Error no tipado del módulo */
  SYS_UNHANDLED: 'SAT.CAT.SYS_UNHANDLED',
} as const

export type SatCatalogErrorCode =
  (typeof SAT_CATALOG_ERROR_CODES)[keyof typeof SAT_CATALOG_ERROR_CODES]

export interface SatCatalogErrorDefinition {
  key: string
  title: string
  detail: string
  code: SatCatalogErrorCode
  status: number
}

/** Catálogo HTTP `{ title, detail, key, code }` del módulo de catálogos SAT. */
export const SAT_CATALOG_ERRORS = {
  CATALOG_UNAVAILABLE: {
    key: 'catalogo-sat-no-disponible',
    title: 'Catálogos del SAT',
    detail:
      'El catálogo de regímenes fiscales y usos de CFDI no está sembrado. Ejecuta el seeder de catálogos del SAT.',
    code: SAT_CATALOG_ERROR_CODES.CATALOG_UNAVAILABLE,
    status: 500,
  },
  SYS_UNHANDLED: {
    key: 'error-sistema',
    title: 'Error del servidor',
    detail: 'Error inesperado al consultar los catálogos del SAT.',
    code: SAT_CATALOG_ERROR_CODES.SYS_UNHANDLED,
    status: 500,
  },
} as const satisfies Record<string, SatCatalogErrorDefinition>
