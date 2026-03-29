import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.get('/', '#controllers/psychometric_test_controller.index')
    router.post('/', '#controllers/psychometric_test_controller.store')
    router.get('/:psychometricTestId', '#controllers/psychometric_test_controller.show')
    router.put('/:psychometricTestId', '#controllers/psychometric_test_controller.update')
    router.delete('/:psychometricTestId', '#controllers/psychometric_test_controller.delete')
  })
  .prefix('/api/psychometric-tests')
  .use(middleware.auth())
