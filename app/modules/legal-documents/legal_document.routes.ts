import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.get('/current', '#modules/legal-documents/legal_document.controller.getCurrent')
  })
  .prefix('/api/legal-documents')
  .use(middleware.auth())
