/**
 * Códigos estables para el cliente — métricas de plataforma.
 * Prefijo PLT.MET = PLaTaforma · METricas.
 *
 * Superficie compartida del área: la estrena la cartera vencida
 * (USRH1788052455651) y la amplían las rebanadas de MRR, serie mensual, churn y
 * concentración por grupo. Se agregan códigos; los existentes no se renombran.
 */
export const PLATFORM_METRIC_ERROR_CODES = {
  /** Query inválido (Vine) */
  VAL_INPUT: 'PLT.MET.VAL_INPUT',
  /** Error no tipado del sistema */
  SYS_UNHANDLED: 'PLT.MET.SYS_UNHANDLED',
} as const

/** Unión de los códigos estables definidos en `PLATFORM_METRIC_ERROR_CODES`. */
export type PlatformMetricErrorCode =
  (typeof PLATFORM_METRIC_ERROR_CODES)[keyof typeof PLATFORM_METRIC_ERROR_CODES]

/**
 * Título y `key` de las dos respuestas de error de una métrica.
 *
 * El `key` es el slug kebab en español del título y el `code` viaja aparte: son
 * campos distintos. El módulo de tenants mete el `code` dentro del `key`
 * (`platform_tenant_api_error.ts:27,46`); esa inconsistencia queda declarada y
 * no se replica aquí ni se corrige allá.
 */
export interface PlatformMetricErrorTexts {
  /** Título de los rechazos controlados: el 422 de validación y las excepciones de dominio. */
  failureTitle: string
  /** Slug kebab de `failureTitle`. */
  failureKey: string
  /** Título del fallo no controlado (500). */
  unhandledTitle: string
  /** Slug kebab de `unhandledTitle`. */
  unhandledKey: string
}

/** Textos de la cartera vencida (USRH1788052455651). */
export const RECEIVABLES_METRIC_ERROR_TEXTS: PlatformMetricErrorTexts = {
  failureTitle: 'No fue posible obtener la cartera vencida',
  failureKey: 'no-fue-posible-obtener-la-cartera-vencida',
  unhandledTitle: 'Error inesperado al obtener la cartera vencida',
  unhandledKey: 'error-inesperado-al-obtener-la-cartera-vencida',
}
