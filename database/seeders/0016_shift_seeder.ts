import { BaseSeeder } from '@adonisjs/lucid/seeders'
import Shift from '#models/shift'

/**
 * DATOS DE DESARROLLO. Siembra el turno de descanso de la empresa de ejemplo y por eso no corre en producción.
 *
 * Una instalación de producción no tiene empresas propias: los tenants nacen del
 * registro self-service o del alta desde configuración, cada uno con sus roles y
 * su configuración. `GSTI RH` y todo lo que cuelga de ella existen para poder
 * trabajar y correr la suite en local, no para ser el primer cliente.
 *
 * `root` sí se siembra siempre (`0008_user_seeder`): es la cuenta de plataforma
 * y alcanza todas las empresas activas sin necesitar membresía
 * (`BusinessAccessScopeService.getAccessibleIds`).
 */
export default class extends BaseSeeder {
  /** Fuera de producción: es dato de ejemplo, no plataforma. */
  static environment = ['development', 'test']

  async run() {
    const shifts = [
      {
        shiftId: 1,
        shiftName: '00:00 to 00:00 - Rest (NA)',
        shiftDayStart: 1,
        shiftTimeStart: '00:00',
        shiftActiveHours: 24,
        shiftRestDays: '0',
        shiftAccumulatedFault: 1,
        businessUnitId: 1,
        shiftTemp: 0,
      },
    ]

    for (const shift of shifts) {
      const { shiftId, ...shiftData } = shift
      await Shift.firstOrCreate({ shiftId }, shiftData)
    }
  }
}
