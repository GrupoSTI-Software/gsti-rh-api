import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.get('/', '#controllers/position_psychometric_profile_controller.index')
    router.post('/', '#controllers/position_psychometric_profile_controller.store')
    router.get('/:positionPsychometricProfileId', '#controllers/position_psychometric_profile_controller.show')
    router.put('/:positionPsychometricProfileId', '#controllers/position_psychometric_profile_controller.update')
    router.delete('/:positionPsychometricProfileId', '#controllers/position_psychometric_profile_controller.delete')
  })
  .prefix('/api/position-psychometric-profiles')
  .use(middleware.auth())
