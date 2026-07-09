import type { HttpContext } from '@adonisjs/core/http'
import ApiToken from '#models/api_token'
import type { ConsentAudience } from '#modules/consent/consent.constants'

/**
 * Deriva la audiencia (web|app) del CONTEXTO DE SESIÓN, nunca de un parámetro que
 * el cliente pueda manipular (regla de negocio 4, USRH1783101935670).
 *
 * Reutiliza `api_tokens.origin` ('web'|'app'), que ya se graba en cada login/refresh
 * (`AuthTokenService.issueTokenPair`) y describe con qué canal se emitió el access
 * token vigente. Un empleado de la app no puede declararse "web" para saltarse el
 * biométrico: el valor no llega en el body/query, se resuelve del token autenticado.
 *
 * Fallback 'web' si por algún motivo no hay fila de token — mismo fallback que ya usa
 * `AuthTokenService.classifyRefreshToken` (`origin = apiTokenRow?.origin || 'web'`);
 * 'web' es el conjunto MÁS RESTRICTIVO (nunca exige el biométrico), así que un fallback
 * ambiguo nunca sobre-exige documentos a un usuario.
 */
export async function resolveAudience(auth: HttpContext['auth']): Promise<ConsentAudience> {
  const identifier = auth.user?.currentAccessToken?.identifier

  if (identifier === undefined || identifier === null) {
    return 'web'
  }

  const apiTokenRow = await ApiToken.query().where('id', String(identifier)).first()

  return apiTokenRow?.origin === 'app' ? 'app' : 'web'
}
