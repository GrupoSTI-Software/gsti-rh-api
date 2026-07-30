import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

/**
 * USRH1785167064404 — API de consulta del marco regulatorio (solo lectura).
 * Sin `businessScope`: el catálogo regulatorio es global, sin tenant.
 * Rutas estáticas antes que las parametrizadas (mismo criterio que
 * `regulatory_coverage_routes.ts`), aunque aquí no hay colisión real de
 * segmentos porque cada recurso tiene su propio prefijo.
 */

router
  .get(
    '/api/v1/regulatory-authorities',
    '#modules/regulatory-framework/regulatory_framework.controller.listAuthorities'
  )
  .use(middleware.auth())

router
  .get(
    '/api/v1/regulatory-authorities/:slug',
    '#modules/regulatory-framework/regulatory_framework.controller.showAuthority'
  )
  .use(middleware.auth())

router
  .get(
    '/api/v1/regulations/:code',
    '#modules/regulatory-framework/regulatory_framework.controller.showRegulation'
  )
  .use(middleware.auth())

// El formato de `:clauseCode` se valida en el controller (regex + 404 con
// el shape {title, detail, key, code} correcto) — no en `.where()` de la
// ruta, para no producir un 404 de Adonis con otro shape ante un formato
// inválido.
router
  .get(
    '/api/v1/regulations/:code/clauses/:clauseCode',
    '#modules/regulatory-framework/regulatory_framework.controller.showClause'
  )
  .use(middleware.auth())

router
  .get(
    '/api/v1/regulations/:code/clauses/:clauseCode/features',
    '#modules/regulatory-framework/regulatory_framework.controller.showClauseFeatures'
  )
  .use(middleware.auth())
