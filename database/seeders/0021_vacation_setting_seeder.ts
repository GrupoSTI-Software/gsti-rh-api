import { BaseSeeder } from '@adonisjs/lucid/seeders'
import VacationSetting from '../../app/models/vacation_setting.js'
import { vacationScaleRows } from '../../app/modules/employee-vacations/vacation_scale_catalog.js'

/**
 * Escalas de vacaciones de la LFT: la anterior a la reforma y la de 2023, de 1
 * a 50 años de servicio (`vacation_scale_catalog.ts`).
 *
 * Una fila se identifica por años de servicio y fecha de vigencia: antes se
 * buscaba solo por años, así que con la escala de 2023 sembrada la anterior
 * nunca se creaba. Las filas que ya existen no se tocan, para respetar lo que
 * se haya capturado desde la pantalla de Vacaciones.
 */
export default class VacationSettingSeeder extends BaseSeeder {
  async run() {
    for (const row of vacationScaleRows()) {
      const existing = await VacationSetting.query()
        .whereNull('vacation_setting_deleted_at')
        .where('vacation_setting_years_of_service', row.yearsOfService)
        .whereRaw('DATE(vacation_setting_apply_since) = ?', [row.applySince])
        .where('vacation_setting_crew', 0)
        .first()
      if (existing) continue

      await VacationSetting.create({
        vacationSettingYearsOfService: row.yearsOfService,
        vacationSettingVacationDays: row.vacationDays,
        vacationSettingApplySince: row.applySince,
        vacationSettingCrew: 0,
      })
    }
  }
}
