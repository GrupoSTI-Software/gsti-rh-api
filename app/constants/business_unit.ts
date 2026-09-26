/**
 * Constantes del slug opaco de empresa (USRH1787932877000).
 *
 * El slug interno de cada empresa (`business_unit_slug`) identifica a la
 * empresa en procesos automáticos (correos, turnos, días festivos, etc.)
 * y nunca se muestra al cliente ni al empleado. Las empresas nuevas reciben
 * un token generado con estas constantes en lugar de una derivación del
 * nombre comercial.
 */

/**
 * Alfabeto de 31 símbolos para el token opaco.
 *
 * Omite `i`, `l`, `o`, `0` y `1` para evitar confusión visual (especialmente
 * en logs batch donde el slug puede aparecer en texto plano). En minúsculas
 * por construcción: `token.toLowerCase() === token` siempre — los seis
 * consumidores del slug que aplican `.toLowerCase()` nunca producirán una
 * versión distinta a la almacenada. Con 31 símbolos y 12 caracteres el
 * espacio es `31^12 ≈ 7.9×10^17` (≈59.4 bits), más que suficiente para un
 * identificador interno sin carga de seguridad.
 */
export const BUSINESS_UNIT_SLUG_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'

/**
 * Prefijo fijo `bu-` de todos los slugs opacos.
 *
 * Garantiza que `Number('bu-...')` sea `NaN`, de modo que
 * `business_unit_access.ts:parseBusinessUnitAccessInput` clasifique el token
 * siempre como slug (rama `slugs`) y nunca como `business_unit_id` numérico.
 * Probabilidad de clasificación errónea: exactamente 0, a costo de 3 bytes.
 * Beneficio secundario: hace el token greppable en logs de jobs batch.
 */
export const BUSINESS_UNIT_SLUG_PREFIX = 'bu-'

/**
 * Longitud de la parte aleatoria del token (excluyendo el prefijo).
 * El token completo mide `prefix.length + RANDOM_LENGTH = 3 + 12 = 15 chars`,
 * que caben 16 veces dentro de `varchar(255)` contra 6 con UUID v4.
 */
export const BUSINESS_UNIT_SLUG_RANDOM_LENGTH = 12

/**
 * Nombre del índice UNIQUE que garantiza la unicidad entre empresas activas.
 * Lo crea la migración `1787932877000000_add_slug_active_unique_to_business_units.ts`
 * y lo usa `BusinessUnitService.isSlugDuplicateError` para discriminar
 * el `ER_DUP_ENTRY` del slug de otros `ER_DUP_ENTRY` no relacionados.
 */
export const BUSINESS_UNIT_SLUG_UNIQUE_INDEX = 'business_units_slug_active_unique'

/**
 * Tope de reintentos ante colisión de slug.
 * Con `31^12 ≈ 7.9×10^17` el evento es prácticamente imposible; el tope
 * existe para que no haya bucle infinito ni reintento ilimitado si el índice
 * estuviera saturado por cualquier causa imprevista.
 */
export const BUSINESS_UNIT_SLUG_MAX_ATTEMPTS = 3

/**
 * Tope de empresas vivas por usuario.
 *
 * Es un freno de seguridad, no un límite comercial: 20 es holgado para
 * cualquier corporativo real y suficiente para frenar la creación de
 * empresas de prueba gratis en cadena. Decisión cerrada de Wilvardo
 * el 2026-08-28 — no cambiar sin escalar.
 */
export const MAX_LIVE_BUSINESS_UNITS_PER_USER = 20
