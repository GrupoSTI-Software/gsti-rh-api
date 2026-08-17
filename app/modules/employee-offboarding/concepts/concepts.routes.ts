import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

/**
 * Catálogo de conceptos de salida por empresa (USRH1786568279581).
 * RBAC granular vía `ConceptsService.assertCanAccess` en el controller.
 * `PATCH /reorder` (adelantado de USRH1786568279584) va declarado ANTES de
 * cualquier ruta con `:offboardingConceptId`, o Adonis lo captura como
 * parámetro (molde `start/routes/position_level_routes.ts:8-13`); cuando esa
 * historia agregue `PATCH /:offboardingConceptId/active`, respetar el orden.
 */
router
  .group(() => {
    router.get('/', '#modules/employee-offboarding/concepts/concepts.controller.index')
    router.post('/', '#modules/employee-offboarding/concepts/concepts.controller.store')
    router.patch(
      '/reorder',
      '#modules/employee-offboarding/concepts/concepts.controller.reorder'
    )
    router.patch(
      '/:offboardingConceptId/active',
      '#modules/employee-offboarding/concepts/concepts.controller.setActive'
    )
    router.get(
      '/:offboardingConceptId',
      '#modules/employee-offboarding/concepts/concepts.controller.show'
    )
    router.put(
      '/:offboardingConceptId',
      '#modules/employee-offboarding/concepts/concepts.controller.update'
    )
    router.delete(
      '/:offboardingConceptId',
      '#modules/employee-offboarding/concepts/concepts.controller.destroy'
    )
  })
  .prefix('/api/offboarding-concepts')
  .use(middleware.auth())
  .use(middleware.businessScope())
