import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import { runWithSensitiveReadDecisions } from '#helpers/sensitive_read_decisions'

/**
 * Abre el contexto de lectura sensible en grupos autenticados que no pasan
 * por `businessScope` / `businessScopeOptional` (USRH1787204602825).
 * Requiere `auth()` previo. No rechaza la petición: solo llena el ALS.
 */
export default class SensitiveAccessContextMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    return runWithSensitiveReadDecisions(ctx, next)
  }
}
