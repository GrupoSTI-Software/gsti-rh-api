import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

/**
 * Rutas del registro electrónico de jornada (reforma LFT).
 *
 * Todas requieren autenticación y el scope de empresa resuelto (multi-tenant):
 * el controller toma la empresa del header X-Business-Unit-Id y nunca cruza
 * empresas al sellar o verificar.
 */
router
  .group(() => {
    router.get('/', '#modules/work-journal/work_journal.controller.index')
    router.post('/seal', '#modules/work-journal/work_journal.controller.seal')
    router.get('/verify', '#modules/work-journal/work_journal.controller.verify')
  })
  .prefix('/api/v1/work-journal-entries')
  .use(middleware.auth())
  .use(middleware.businessScope())
