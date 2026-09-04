/**
 * Prefijo de las rutas del canal ADMS del checador (protocolo push de ZKTeco).
 *
 * El checador NO es un navegador: no manda cabecera `Origin`, no hace preflight
 * y no entiende una respuesta 403 del middleware de CORS. Por eso su grupo de
 * rutas queda fuera del middleware (`config/cors.ts`).
 *
 * SUPUESTO A CONFIRMAR: `/iclock` es el prefijo estándar del protocolo ADMS de
 * ZKTeco (`/iclock/cdata`, `/iclock/getrequest`, `/iclock/devicecmd`). Cuando se
 * implemente el canal en su propia historia, verificar que el grupo de rutas se
 * registre bajo este prefijo o ajustar esta constante.
 */
export const ADMS_ROUTE_PREFIX = '/iclock'

/** Verdadero si la URL pertenece al canal ADMS del checador. */
export function isAdmsChannelUrl(url: string): boolean {
  return url === ADMS_ROUTE_PREFIX || url.startsWith(`${ADMS_ROUTE_PREFIX}/`)
}
