import router from '@adonisjs/core/services/router'
import limiter from '@adonisjs/limiter/services/main'

/**
 * Lectura pública de la versión vigente de términos y aviso de privacidad
 * (USRH1790610965572). Espejo de `employee-badge/badge_public.routes.ts`: grupo público, sin
 * autenticación ni alcance de empresa, con límite de 60/min por IP. La IP solo es la llave
 * del limitador; no se guarda ni se registra.
 */
const legalDocumentPublicRateLimit = limiter.define('legal-document-public', (ctx) => {
  return limiter.allowRequests(60).every('1 minute').usingKey(ctx.request.ip())
})

router
  .group(() => {
    router
      .get('/current', '#modules/legal-documents/legal_document_public.controller.current')
      .use(legalDocumentPublicRateLimit)
  })
  .prefix('/api/public/legal-documents')
