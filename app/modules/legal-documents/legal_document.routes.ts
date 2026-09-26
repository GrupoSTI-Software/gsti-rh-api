import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.get('/current', '#modules/legal-documents/legal_document.controller.getCurrent')

    // Gestión reservada al rol root (assertComplianceRepsePermission en el controller).
    router.get('/', '#modules/legal-documents/legal_document.controller.listByType')
    router.get('/:id', '#modules/legal-documents/legal_document.controller.getById')
    router.post('/', '#modules/legal-documents/legal_document.controller.createDraft')
    router.put('/:id', '#modules/legal-documents/legal_document.controller.updateDraft')
    router.post('/:id/publish', '#modules/legal-documents/legal_document.controller.publish')
  })
  .prefix('/api/legal-documents')
  .use(middleware.auth())
