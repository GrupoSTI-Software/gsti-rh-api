/* eslint-disable prettier/prettier */

import router from '@adonisjs/core/services/router'

router
  .group(() => {
    // Registro de Passkeys
    router.post('/passkey/register/options', '#controllers/passkey_controller.registerOptions')
    router.post('/passkey/register/complete', '#controllers/passkey_controller.registerComplete')

    // Autenticación con Passkeys
    router.post('/passkey/login/options', '#controllers/passkey_controller.loginOptions')
    router.post('/passkey/login/complete', '#controllers/passkey_controller.loginComplete')

    // Verificación de Passkeys
    router.post('/passkey/check', '#controllers/passkey_controller.checkPasskeys')
  })
  .prefix('/api/auth')
