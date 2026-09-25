/**
 * Constantes de "Listar las pruebas vivas con sus hitos cumplidos y su
 * frecuencia" (USRH1789079078173).
 */

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
