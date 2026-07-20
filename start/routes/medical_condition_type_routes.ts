import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import MedicalConditionTypeController from '#controllers/medical_condition_type_controller'

const medicalConditionTypeController = new MedicalConditionTypeController()

router
  .group(() => {
    router.get('/', medicalConditionTypeController.index)
    router.post('/', medicalConditionTypeController.store)
    router.get('/:medicalConditionTypeId', medicalConditionTypeController.show)
    router.put('/:medicalConditionTypeId', medicalConditionTypeController.update)
    router.delete('/:medicalConditionTypeId', medicalConditionTypeController.delete)
  })
  .prefix('/api/medical-condition-types')
  .use(middleware.auth())
  .use(middleware.businessScope())
