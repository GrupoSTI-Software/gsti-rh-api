import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

/**
 * USRH1790610965479 — marco regulatorio (autoridades, normas, numerales y
 * features): dato confidencial de plataforma, sin tenant. Solo usuarios de
 * plataforma con sesión del panel (origin = 'platform').
 *
 *   GET /api/platform/regulatory-authorities                        → lista de autoridades
 *   GET /api/platform/regulatory-authorities/:slug                  → una autoridad
 *   GET /api/platform/regulations/:code                             → norma con árbol de numerales
 *   GET /api/platform/regulations/:code/clauses/:clauseCode         → un numeral
 *   GET /api/platform/regulations/:code/clauses/:clauseCode/features → features del numeral
 *
 * El formato de :clauseCode se valida en el controller (regex + 404 con el
 * shape correcto), no con .where() de la ruta.
 */
router
  .group(() => {
    router.get('/regulatory-authorities', '#modules/regulatory-framework/regulatory_framework.controller.listAuthorities')
    router.get('/regulatory-authorities/:slug', '#modules/regulatory-framework/regulatory_framework.controller.showAuthority')
    router.get('/regulations/:code', '#modules/regulatory-framework/regulatory_framework.controller.showRegulation')
    router.get('/regulations/:code/clauses/:clauseCode', '#modules/regulatory-framework/regulatory_framework.controller.showClause')
    router.get('/regulations/:code/clauses/:clauseCode/features', '#modules/regulatory-framework/regulatory_framework.controller.showClauseFeatures')
  })
  .prefix('/api/platform')
  .use([middleware.auth({ guards: ['api'] }), middleware.platformAdmin()])
