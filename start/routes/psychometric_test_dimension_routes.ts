import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.get('/', '#controllers/psychometric_test_dimension_controller.index')
    router.post('/', '#controllers/psychometric_test_dimension_controller.store')
    router.get('/:psychometricTestDimensionId', '#controllers/psychometric_test_dimension_controller.show')
    router.put('/:psychometricTestDimensionId', '#controllers/psychometric_test_dimension_controller.update')
    router.delete('/:psychometricTestDimensionId', '#controllers/psychometric_test_dimension_controller.delete')
  })
  .prefix('/api/psychometric-test-dimensions')
  .use(middleware.auth())
