import SystemSetting from '#models/system_setting'
import SystemSettingPayrollConfig from '#models/system_setting_payroll_config'
import SystemSettingSystemModule from '#models/system_setting_system_module'
import env from '#start/env'
import { DateTime } from 'luxon'

export default class SystemSettingService {
  async index(/* filters: SystemSettingFilterSearchInterface */) {
    const businessConf = `${env.get('SYSTEM_BUSINESS')}`
    const businessList = businessConf.split(',')
    let systemSettingsList: SystemSetting[] = []

    const systemSettings = await SystemSetting.query().whereNull('system_setting_deleted_at')
    .preload('systemSettingPayrollConfigs')

    systemSettings.forEach((sistemSetting) => {
      const units = sistemSetting.systemSettingBusinessUnits
        ? sistemSetting.systemSettingBusinessUnits.split(',')
        : []
      const systemBussinesMatches = businessList.filter((value) => units.includes(value))
      const matches = systemBussinesMatches.length

      if (matches > 0) {
        systemSettingsList.push(sistemSetting)
      }
    })

    // const systemSettingsList = await SystemSetting.query()
    //   .whereNull('system_setting_deleted_at')
    //   // .if(filters.search, (query) => {
    //   //   query.where((subQuery) => {
    //   //     subQuery.whereRaw('UPPER(system_setting_trade_name) LIKE ?', [
    //   //       `%${filters.search.toUpperCase()}%`,
    //   //     ])
    //   //   })
    //   // })
    //   .orderBy('system_setting_id')
    //   .paginate(1, 999)

    return { data: systemSettingsList }
  }

  async create(systemSetting: SystemSetting) {
    const newSystemSetting = new SystemSetting()
    newSystemSetting.systemSettingTradeName = systemSetting.systemSettingTradeName
    newSystemSetting.systemSettingSidebarColor = systemSetting.systemSettingSidebarColor
    newSystemSetting.systemSettingLogo = systemSetting.systemSettingLogo
    newSystemSetting.systemSettingBanner = systemSetting.systemSettingBanner
    newSystemSetting.systemSettingFavicon = systemSetting.systemSettingFavicon
    newSystemSetting.systemSettingActive = systemSetting.systemSettingActive
    newSystemSetting.systemSettingBusinessUnits = systemSetting.systemSettingBusinessUnits
    newSystemSetting.systemSettingToleranceCountPerAbsence = systemSetting.systemSettingToleranceCountPerAbsence
    newSystemSetting.systemSettingRestrictFutureVacation = systemSetting.systemSettingRestrictFutureVacation
    await newSystemSetting.save()
    return newSystemSetting
  }

  async update(currentSystemSetting: SystemSetting, systemSetting: SystemSetting) {
    currentSystemSetting.systemSettingTradeName = systemSetting.systemSettingTradeName
    currentSystemSetting.systemSettingSidebarColor = systemSetting.systemSettingSidebarColor
    currentSystemSetting.systemSettingLogo = systemSetting.systemSettingLogo
    currentSystemSetting.systemSettingBanner = systemSetting.systemSettingBanner
    currentSystemSetting.systemSettingFavicon = systemSetting.systemSettingFavicon
    currentSystemSetting.systemSettingActive = systemSetting.systemSettingActive
    currentSystemSetting.systemSettingToleranceCountPerAbsence = systemSetting.systemSettingToleranceCountPerAbsence
    currentSystemSetting.systemSettingRestrictFutureVacation = systemSetting.systemSettingRestrictFutureVacation
    await currentSystemSetting.save()
    return currentSystemSetting
  }

  async delete(currentSystemSetting: SystemSetting) {
    await currentSystemSetting.delete()
    return currentSystemSetting
  }

  async show(systemSettingId: number) {
    const systemSetting = await SystemSetting.query()
      .whereNull('system_setting_deleted_at')
      .where('system_setting_id', systemSettingId)
      .preload('systemSettingSystemModules')
      .preload('systemSettingPayrollConfigs')
      .first()
    return systemSetting ? systemSetting : null
  }

  async getActive() {
    const businessConf = `${env.get('SYSTEM_BUSINESS')}`
    const businessList = businessConf.split(',')
    let sistemSettingActive = null as SystemSetting | null

    const systemSettings = await SystemSetting.query().whereNull('system_setting_deleted_at')

    systemSettings.forEach((sistemSetting) => {
      const units = sistemSetting.systemSettingBusinessUnits
        ? sistemSetting.systemSettingBusinessUnits.split(',')
        : []
      const systemBussinesMatches = businessList.filter((value) => units.includes(value))
      const matches = systemBussinesMatches.length

      if (matches > 0 && sistemSetting.systemSettingActive === 1) {
        sistemSettingActive = sistemSetting
      }
    })

    return sistemSettingActive
  }

  async getPayrollConfig(systemSettingId: number) {

    const today = DateTime.local().toFormat('yyyy-LL-dd')
    const systemSettingPayrollConfig = await SystemSettingPayrollConfig
      .query()
      .whereNull('system_setting_payroll_config_deleted_at')
      .where('system_setting_id', systemSettingId)
      .where('system_setting_payroll_config_apply_since', '<=', today)
      .orderBy('system_setting_payroll_config_apply_since', 'desc')
      .first()

    return systemSettingPayrollConfig
  }

  async verifyInfo(systemSetting: SystemSetting) {
    const action = systemSetting.systemSettingId > 0 ? 'updated' : 'created'
    const existTradeName = await SystemSetting.query()
      .if(systemSetting.systemSettingId > 0, (query) => {
        query.whereNot('system_setting_id', systemSetting.systemSettingId)
      })
      .whereNull('system_setting_deleted_at')
      .where('system_setting_trade_name', systemSetting.systemSettingTradeName)
      .first()

    if (existTradeName) {
      return {
        status: 400,
        type: 'warning',
        title: 'The system setting trade name exists for another system setting',
        message: `The system setting resource cannot be ${action} because the system setting trade name is already assigned to another system setting`,
        data: { ...systemSetting },
      }
    }
    return {
      status: 200,
      type: 'success',
      title: 'Info verifiy successfully',
      message: 'Info verifiy successfully',
      data: { ...systemSetting },
    }
  }

  async verifyActiveStore(systemSetting: SystemSetting) {
    const businessConf = `${env.get('SYSTEM_BUSINESS')}`
    const businessList = businessConf.split(',')
    const action = systemSetting.systemSettingId > 0 ? 'updated' : 'created'
    if (systemSetting.systemSettingActive) {
      const activeItem = await SystemSetting.query()
        .where('system_setting_active', 1)
        .whereNull('system_setting_deleted_at')
        .andWhere((query) => {
          businessList.forEach((business) => {
            query.orWhereRaw('FIND_IN_SET(?, system_setting_business_units)', [business.trim()])
          })
        })
        .first()
      if (activeItem) {
        return {
          status: 400,
          type: 'warning',
          title: 'The system setting status',
          message: `The system setting resource cannot be ${action} because only one record can be active`,
          data: { ...systemSetting },
        }
      }
    }
    return {
      status: 200,
      type: 'success',
      title: 'Info verifiy successfully',
      message: 'Info verifiy successfully',
      data: { ...systemSetting },
    }
  }

  async verifyActiveUpdate(systemSetting: SystemSetting, currentSystemSetting: SystemSetting) {
    const businessConf = `${env.get('SYSTEM_BUSINESS')}`
    const businessList = businessConf.split(',')
    const action = systemSetting.systemSettingId > 0 ? 'updated' : 'created'
    if (systemSetting.systemSettingId > 0) {
      if (systemSetting.systemSettingActive && !currentSystemSetting.systemSettingActive) {
        const activeItem = await SystemSetting.query()
          .where('system_setting_active', 1)
          .whereNull('system_setting_deleted_at')
          .andWhere((query) => {
            businessList.forEach((business) => {
              query.orWhereRaw('FIND_IN_SET(?, system_setting_business_units)', [business.trim()])
            })
          })
          .first()
        if (activeItem && activeItem.systemSettingId !== currentSystemSetting.systemSettingId) {
          return {
            status: 400,
            type: 'warning',
            title: 'The system setting status',
            message: `The system setting resource cannot be ${action} because only one record can be active`,
            data: { ...systemSetting },
          }
        }
      }
    }
    return {
      status: 200,
      type: 'success',
      title: 'Info verifiy successfully',
      message: 'Info verifiy successfully',
      data: { ...systemSetting },
    }
  }

  async assignSystemModules(systemSettingId: number, systemModules: Array<number>) {
    let systemSettingSystemModules = await SystemSettingSystemModule.query()
      .whereNull('system_setting_system_module_deleted_at')
      .where('system_setting_id', systemSettingId)
    if (systemSettingSystemModules) {
      if (systemModules === undefined) {
        systemModules = []
      }
      for await (const item of systemSettingSystemModules) {
        const existSystemModule = systemModules.find(
          (a: number) => Number.parseInt(a.toString()) === item.systemModuleId
        )
        if (!existSystemModule) {
          await item.delete()
        }
      }
    }
    for await (const systemModuleId of systemModules) {
      const existSystemSettingSystemModules = systemSettingSystemModules.find(
        (a) => a.systemModuleId === Number.parseInt(systemModuleId.toString())
      )
      if (!existSystemSettingSystemModules) {
        const newSystemSettingSystemModules = new SystemSettingSystemModule()
        newSystemSettingSystemModules.systemSettingId = systemSettingId
        newSystemSettingSystemModules.systemModuleId = systemModuleId
        await newSystemSettingSystemModules.save()
      }
    }
    systemSettingSystemModules = await SystemSettingSystemModule.query()
      .whereNull('system_setting_system_module_deleted_at')
      .where('system_setting_id', systemSettingId)
    return systemSettingSystemModules
  }

  async updateBirthdayEmailsStatus(systemSettingId: number, birthdayEmailsEnabled: boolean) {
    const systemSetting = await SystemSetting.query()
      .whereNull('system_setting_deleted_at')
      .where('system_setting_id', systemSettingId)
      .first()

    if (!systemSetting) {
      return {
        status: 404,
        type: 'warning',
        title: 'System setting not found',
        message: 'The system setting was not found with the entered ID',
        data: { systemSettingId },
      }
    }

    systemSetting.systemSettingBirthdayEmails = birthdayEmailsEnabled ? 1 : 0
    await systemSetting.save()

    return {
      status: 200,
      type: 'success',
      title: 'Birthday emails status updated',
      message: 'The birthday emails status was updated successfully',
      data: { systemSetting },
    }
  }

  async updateAnniversaryEmailsStatus(systemSettingId: number, anniversaryEmailsEnabled: boolean) {
    const systemSetting = await SystemSetting.query()
      .whereNull('system_setting_deleted_at')
      .where('system_setting_id', systemSettingId)
      .first()

    if (!systemSetting) {
      return {
        status: 404,
        type: 'warning',
        title: 'System setting not found',
        message: 'The system setting was not found with the entered ID',
        data: { systemSettingId },
      }
    }

    systemSetting.systemSettingAnniversaryEmails = anniversaryEmailsEnabled ? 1 : 0
    await systemSetting.save()

    return {
      status: 200,
      type: 'success',
      title: 'Anniversary emails status updated',
      message: 'The anniversary emails status was updated successfully',
      data: { systemSetting },
    }
  }
}
