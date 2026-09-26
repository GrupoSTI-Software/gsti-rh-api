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
  /** Tenant inexistente o borrado lógicamente, por `publicId` (USRH1789079078169) */
  TENANT_NOT_FOUND: 'PLT.MET.TENANT_NOT_FOUND',
  /** El motor de asistencia no pudo calcular el uso de la prueba (USRH1789079078171) */
  USAGE_UNAVAILABLE: 'PLT.MET.USAGE_UNAVAILABLE',
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

/**
 * Textos del ingreso mensual recurrente (USRH1788052455653).
 *
 * El `key` es el slug kebab del título, como manda la convención de esta
 * superficie. La tabla del spec proponía `error-inesperado` a secas; se
 * descartó por consistencia con el área — el `code` es el campo que el cliente
 * consume y ése sí va literal.
 */
export const MRR_METRIC_ERROR_TEXTS: PlatformMetricErrorTexts = {
  failureTitle: 'No fue posible obtener el ingreso mensual recurrente',
  failureKey: 'no-fue-posible-obtener-el-ingreso-mensual-recurrente',
  unhandledTitle: 'Error inesperado al obtener el ingreso mensual recurrente',
  unhandledKey: 'error-inesperado-al-obtener-el-ingreso-mensual-recurrente',
}

/**
 * Textos de la serie mensual de MRR cobrado (USRH1788052455654).
 *
 * Juego propio y no reutilización del de la cifra: son dos endpoints del mismo
 * prefijo y un título compartido dejaría al cliente sin saber cuál de los dos
 * falló. El `key` es el slug kebab del título, como manda la convención del
 * área; el spec proponía `datos-invalidos` y se descartó por consistencia. El
 * `code` sí va literal — es el campo que el cliente consume.
 */
export const MRR_SERIES_METRIC_ERROR_TEXTS: PlatformMetricErrorTexts = {
  failureTitle: 'No fue posible obtener la serie mensual de MRR',
  failureKey: 'no-fue-posible-obtener-la-serie-mensual-de-mrr',
  unhandledTitle: 'Error inesperado al obtener la serie mensual de MRR',
  unhandledKey: 'error-inesperado-al-obtener-la-serie-mensual-de-mrr',
}

/**
 * Textos de los flujos de suscripción del mes (USRH1788052455656).
 *
 * Juego propio: el título nombra la métrica para que el cliente sepa cuál de
 * los endpoints del prefijo falló. El `key` es el slug kebab del título; el
 * `code` (`PLT.MET.*`) es el campo que el cliente consume.
 */
export const SUBSCRIPTION_FLOWS_METRIC_ERROR_TEXTS: PlatformMetricErrorTexts = {
  failureTitle: 'No fue posible obtener los flujos de suscripción',
  failureKey: 'no-fue-posible-obtener-los-flujos-de-suscripcion',
  unhandledTitle: 'Error inesperado al obtener los flujos de suscripción',
  unhandledKey: 'error-inesperado-al-obtener-los-flujos-de-suscripcion',
}

/**
 * Textos de la ventana y el estado de la prueba de un tenant (USRH1789079078169).
 *
 * Estrena el área de consultas de la prueba; comparte infraestructura de
 * error con el resto de métricas de plataforma en vez de crear un módulo de
 * error propio — es la misma clase de superficie (consulta de solo lectura
 * para `platformAdmin`), y el código `PLT.MET.TENANT_NOT_FOUND` se agrega al
 * set compartido en lugar de duplicarlo.
 */
export const TRIAL_METRIC_ERROR_TEXTS: PlatformMetricErrorTexts = {
  failureTitle: 'No fue posible obtener la prueba del tenant',
  failureKey: 'no-fue-posible-obtener-la-prueba-del-tenant',
  unhandledTitle: 'Error inesperado al obtener la prueba del tenant',
  unhandledKey: 'error-inesperado-al-obtener-la-prueba-del-tenant',
}

/**
 * Textos del uso (frecuencia de registro) de la prueba de un tenant
 * (USRH1789079078171).
 *
 * `failureTitle`/`failureKey` cubren el 500 dedicado cuando el motor de
 * asistencia (`AttendanceStatsService.getOverview`) devuelve un
 * `ServiceResult` con `status !== 200` — nunca un número bajo disfrazado de
 * resultado (RB-11). El 404 de tenant lo sigue emitiendo `TRIAL_METRIC_ERROR_TEXTS`
 * (se propaga tal cual desde `USRH1789079078169`, esta HU no lo redefine).
 */
export const TRIAL_USAGE_METRIC_ERROR_TEXTS: PlatformMetricErrorTexts = {
  failureTitle: 'No fue posible obtener el uso de la prueba',
  failureKey: 'no-fue-posible-obtener-el-uso-de-la-prueba',
  unhandledTitle: 'Error inesperado al obtener el uso de la prueba',
  unhandledKey: 'error-inesperado-al-obtener-el-uso-de-la-prueba',
}

/**
 * Textos del listado de pruebas vivas (USRH1789079078173, spec técnico §9).
 *
 * El fallo del universo o de los hitos en lote (regla local "fallo global ≠
 * fallo de fila", §4 del spec) llega aquí sin controlar y sale como
 * `PLT.MET.SYS_UNHANDLED` (500) con estos textos. El fallo de la frecuencia
 * de UNA sola empresa **nunca** llega a este helper — esa fila se degrada a
 * `no-disponible` (RN-53) dentro del propio servicio, sin lanzar.
 */
export const LIVE_TRIALS_METRIC_ERROR_TEXTS: PlatformMetricErrorTexts = {
  failureTitle: 'No fue posible obtener las pruebas vivas',
  failureKey: 'no-fue-posible-obtener-las-pruebas-vivas',
  unhandledTitle: 'Error inesperado al obtener las pruebas vivas',
  unhandledKey: 'error-inesperado-al-obtener-las-pruebas-vivas',
}
