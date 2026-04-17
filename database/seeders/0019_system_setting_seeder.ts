import { BaseSeeder } from '@adonisjs/lucid/seeders'
import SystemSetting from '../../app/models/system_setting.js'

export default class extends BaseSeeder {
  async run() {
    const systemSettings = [
      {
        systemSettingId: 1,
        systemSettingTradeName: 'GrupoSTI',
        systemSettingLogo: 'https://sfo3.digitaloceanspaces.com/sae-assets/sae-bo-system/system-settings/1761589424394_Asset%202%404x-8.png',
        systemSettingBanner: 'https://gsti-assets.sfo3.cdn.digitaloceanspaces.com/gsti-realalfaflight/system-settings/banner.png',
        systemSettingSidebarColor: '0E0A38',
        systemSettingFavicon: 'https://sfo3.digitaloceanspaces.com/sae-assets/sae-bo-system/system-settings/1761589424485_Asset%207%404x-8.png',
        systemSettingActive: 1,
        systemSettingBusinessUnits: 'gsti-rh',
        systemSettingToleranceCountPerAbsence: 3, // Cuantos retardos se acumulan para considerar una falta
        systemSettingRestrictFutureVacation: 0, // 0 para no restringir, 1 para restringir (Poder asignar vacaciones en el futuro "adelantar")
        systemSettingBirthdayEmails: 0, // 0 para no enviar emails, 1 para enviar emails de cumpleaños a los empleados
        systemSettingAnniversaryEmails: 0, // 0 para no enviar emails, 1 para enviar emails de aniversarios a los empleados
        systemSettingAttendanceFaultHrEmails: 0, // 0 desactiva correos a RH por falta de registro tras tolerancia Fault
      },
    ]

    for (const systemSetting of systemSettings) {
      await SystemSetting.firstOrCreate(
        { systemSettingId: systemSetting.systemSettingId },
        systemSetting,
      )
    }
  }
}
