import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

/**
 * Biometricos del colaborador en los equipos (spec ADMS 11).
 *
 * Cuelgan del colaborador y no del equipo porque la pantalla que las usa es la
 * pestaña de biometricos del colaborador. El permiso se resuelve dentro del
 * controlador con `evaluateEnforced`: el interruptor de exigencia del modulo
 * esta apagado y `permissionGate` dejaria pasar a cualquier autenticado.
 */
router
  .group(() => {
    router.post(
      '/:employeeId/device-biometrics/fingerprint-enrollment',
      '#modules/biometric-vault/device-biometrics/device_biometrics.controller.enrollFingerprint'
    )
    router.post(
      '/:employeeId/device-biometrics/face/enable',
      '#modules/biometric-vault/device-biometrics/device_biometrics.controller.enableFace'
    )
    router.post(
      '/:employeeId/device-biometrics/face/disable',
      '#modules/biometric-vault/device-biometrics/device_biometrics.controller.disableFace'
    )
  })
  .prefix('/api/v1/employees')
  .use(middleware.auth())
  .use(middleware.businessScope())
