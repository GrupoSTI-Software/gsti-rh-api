import factory from '@adonisjs/lucid/factories'
import { DateTime } from 'luxon'
import VacationSetting from '#models/vacation_setting'

/**
 * Genera una fila de tabla de vacaciones por antigüedad (tabla vacations_settings).
 * Los valores por defecto siguen el espíritu del VacationSettingSeeder pero con Faker
 * para años/días únicos cuando se necesiten registros extra en modo demo.
 *
 * En el seeder principal se suele usar un `VacationSetting` existente del catálogo;
 * esta factory sirve para `merge({ ... })` cuando haga falta crear líneas adicionales.
 */
export const VacationSettingFactory = factory
  .define(VacationSetting, ({ faker }) => {
    const years = faker.number.int({ min: 1, max: 15 })
    return {
      vacationSettingYearsOfService: years,
      vacationSettingVacationDays: faker.number.int({ min: 12, max: 24 }),
      vacationSettingCrew: 0,
      vacationSettingApplySince: DateTime.fromISO('2023-01-01').toJSDate(),
    }
  })
  .build()
