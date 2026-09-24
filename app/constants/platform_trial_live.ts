/**
 * Constantes de "Listar las pruebas vivas con sus hitos cumplidos y su
 * frecuencia" (USRH1789079078173).
 */

/**
 * Motivo auditable del único `TenantContext.runUnscoped` de esta HU (molde
 * `app/constants/platform_device_access_point.ts:26-35`).
 *
 * Esta consulta es la única del set que mira, a propósito, a TODAS las
 * empresas de la plataforma a la vez — no hay una empresa "actual" desde la
 * que filtrar. Desde `/api/platform/*` no hay `TenantContext` activo, así
 * que el mixin `withBusinessUnitScope` ya retorna sin filtrar (fail-open) y
 * las tablas de billing no componen ese mixin en ninguna ruta: `runUnscoped`
 * no abre ningún filtro adicional. Su único efecto real es el `logger.warn`
 * que emite por dentro, con este motivo, dejando rastro auditable de que la
 * lectura cruzada ocurrió y por qué.
 */
export const PLATFORM_LIVE_TRIAL_RUN_UNSCOPED_REASON =
  'listar-pruebas-vivas-de-toda-la-plataforma-para-el-panel-de-gsti'

/**
 * Cuántas corridas del motor de asistencia (una por prueba viva — nunca en
 * lote, el motor mezcla empresas si se le pasan juntas) se permiten en
 * paralelo dentro del bucle de frecuencia. Valor conservador de arranque —
 * se calibra con la cifra real del CA-11/Anexo B, no antes.
 */
export const PLATFORM_LIVE_TRIALS_CONCURRENCY = 4

/**
 * Umbral de pruebas vivas simultáneas a partir del cual se emite un
 * `logger.warn` de volumen, sin truncar la lista (RN-35/F23): un tope duro
 * aquí reintroduce exactamente el defecto que esta HU existe para quitar —
 * dejar pruebas fuera del tablero en silencio. Valor conservador de
 * arranque — se calibra con la cifra real del CA-11/Anexo B.
 */
export const PLATFORM_LIVE_TRIALS_EXPECTED_MAX = 200
