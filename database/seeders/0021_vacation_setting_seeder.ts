import { BaseSeeder } from '@adonisjs/lucid/seeders'
import VacationSetting from '../../app/models/vacation_setting.js'

export default class VacationSettingSeeder extends BaseSeeder {
  async run() {
    const vacationSettings = [
      { vacationSettingYearsOfService: 1, vacationSettingVacationDays: 12, vacationSettingCrew: 0 },
      { vacationSettingYearsOfService: 2, vacationSettingVacationDays: 14, vacationSettingCrew: 0 },
      { vacationSettingYearsOfService: 3, vacationSettingVacationDays: 16, vacationSettingCrew: 0 },
      { vacationSettingYearsOfService: 4, vacationSettingVacationDays: 18, vacationSettingCrew: 0 },
      { vacationSettingYearsOfService: 5, vacationSettingVacationDays: 20, vacationSettingCrew: 0 },
      { vacationSettingYearsOfService: 6, vacationSettingVacationDays: 22, vacationSettingCrew: 0 },
      { vacationSettingYearsOfService: 7, vacationSettingVacationDays: 22, vacationSettingCrew: 0 },
      { vacationSettingYearsOfService: 8, vacationSettingVacationDays: 22, vacationSettingCrew: 0 },
      { vacationSettingYearsOfService: 9, vacationSettingVacationDays: 22, vacationSettingCrew: 0 },
      { vacationSettingYearsOfService: 10, vacationSettingVacationDays: 22, vacationSettingCrew: 0 },
    ]

    for (const setting of vacationSettings) {
      const { vacationSettingYearsOfService, ...settingData } = setting
      await VacationSetting.firstOrCreate({ vacationSettingYearsOfService }, settingData)
    }
  }
}
