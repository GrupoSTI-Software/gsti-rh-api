import { test } from '@japa/runner'

/**
 * Humo de carga de los controladores del tramo de biometricos en sitio.
 *
 * Existe por un fallo real: un import con alias `#modules/...` terminado en
 * `.js` resuelve a `.js.js` y revienta SOLO en tiempo de ejecucion. El
 * typecheck no lo ve -- TypeScript resuelve el alias por otra via -- y las
 * pruebas de servicio tampoco, porque llaman a los servicios directo sin pasar
 * por el controlador. El endpoint se veia bien hasta que alguien lo llamaba.
 *
 * Importar el modulo ejecuta sus imports: si uno esta mal, esto falla.
 */
const CONTROLADORES = [
  '#modules/access-point/platform/platform_devices.controller',
  '#modules/access-point/health/health.controller',
  '#modules/access-point/incidents/incidents.controller',
  '#modules/access-point/unmapped-pins/unmapped_pins.controller',
  '#modules/access-point/employee-sync/employee_sync.controller',
  '#modules/access-point/device-profile/device_profile.controller',
  '#modules/access-point/device-clock/device_clock.controller',
  '#modules/access-point/upload-progress/upload_progress.controller',
  '#modules/biometric-vault/device-biometrics/device_biometrics.controller',
  '#modules/device-commands/device_commands.controller',
  '#modules/adms/channel/adms_channel.controller',
]

test.group('Carga de los controladores del tramo', () => {
  for (const ruta of CONTROLADORES) {
    test(`${ruta.split('/').pop()} carga sin romper sus imports`, async ({ assert }) => {
      const modulo = await import(ruta)
      assert.isFunction(modulo.default, 'el controlador debe exportar una clase por defecto')
      // Instanciarlo ejercita las dependencias que resuelve en el constructor.
      assert.isObject(new modulo.default())
    })
  }
})
