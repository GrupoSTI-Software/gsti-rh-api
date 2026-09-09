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
    /**
     * Lectura: que biometricos tiene la persona, vengan del canal o del
     * conector viejo. Es lo que pinta las palmas del expediente.
     */
    router.get(
      '/:employeeId/device-biometrics',
      '#modules/biometric-vault/device-biometrics/device_biometrics.controller.summary'
    )
    /**
     * Lectura: como va la captura que se pidio. El Backoffice la sondea
     * mientras espera al aparato, asi que responde el comando y nada mas.
     */
    router.get(
      '/:employeeId/device-biometrics/commands/:commandId',
      '#modules/biometric-vault/device-biometrics/device_biometrics.controller.enrollmentStatus'
    )
    router.post(
      '/:employeeId/device-biometrics/face/enable',
      '#modules/biometric-vault/device-biometrics/device_biometrics.controller.enableFace'
    )
    router.post(
      '/:employeeId/device-biometrics/face/disable',
      '#modules/biometric-vault/device-biometrics/device_biometrics.controller.disableFace'
    )
    router.post(
      '/:employeeId/device-biometrics/replicate',
      '#modules/biometric-vault/device-biometrics/device_biometrics.controller.replicate'
    )
    /**
     * POST y no GET: lleva una lista de destinos en el cuerpo y ademas destapa
     * que biometricos tiene una persona. No es una lectura cacheable.
     */
    router.post(
      '/:employeeId/device-biometrics/replication-preview',
      '#modules/biometric-vault/device-biometrics/device_biometrics.controller.replicationPreview'
    )
  })
  .prefix('/api/v1/employees')
  .use(middleware.auth())
  .use(middleware.businessScope())
