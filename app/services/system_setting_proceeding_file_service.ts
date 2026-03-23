import SystemSettingProceedingFile from '#models/system_setting_proceeding_file'
import SystemSetting from '#models/system_setting'
import ProceedingFile from '#models/proceeding_file'
import ProceedingFileType from '#models/proceeding_file_type'
import { DateTime } from 'luxon'
import type { ProceedingFileExpiredFilterInterface } from '../interfaces/proceeding_file_expired_filter_interface.js'

export default class SystemSettingProceedingFileService {
  async create(data: { systemSettingId: number; proceedingFileId: number }) {
    const row = new SystemSettingProceedingFile()
    row.systemSettingId = data.systemSettingId
    row.proceedingFileId = data.proceedingFileId
    await row.save()
    await row.load('proceedingFile', (q) => {
      q.whereNull('proceeding_file_deleted_at').preload('proceedingFileType')
    })
    await row.load('systemSetting')
    return row
  }

  async show(systemSettingProceedingFileId: number) {
    return SystemSettingProceedingFile.query()
      .whereNull('system_setting_proceeding_file_deleted_at')
      .where('systemSettingProceedingFileId', systemSettingProceedingFileId)
      .preload('proceedingFile', (q) => {
        q.whereNull('proceeding_file_deleted_at').preload('proceedingFileType')
      })
      .preload('systemSetting')
      .first()
  }

  async update(
    current: SystemSettingProceedingFile,
    data: { systemSettingId: number; proceedingFileId: number }
  ) {
    current.systemSettingId = data.systemSettingId
    current.proceedingFileId = data.proceedingFileId
    await current.save()
    await current.load('proceedingFile', (q) => {
      q.whereNull('proceeding_file_deleted_at').preload('proceedingFileType')
    })
    await current.load('systemSetting')
    return current
  }

  async verifyInfoExist(data: { systemSettingId: number; proceedingFileId: number }) {
    const systemSetting = await SystemSetting.query()
      .whereNull('deletedAt')
      .where('systemSettingId', data.systemSettingId)
      .first()

    if (!systemSetting) {
      return {
        status: 404,
        type: 'warning',
        title: 'System setting not found',
        message: 'No se encontró el system setting con el id indicado',
        data: { systemSettingId: data.systemSettingId },
      }
    }

    const proceedingFile = await ProceedingFile.query()
      .whereNull('proceeding_file_deleted_at')
      .where('proceedingFileId', data.proceedingFileId)
      .preload('proceedingFileType')
      .first()

    if (!proceedingFile) {
      return {
        status: 404,
        type: 'warning',
        title: 'Proceeding file not found',
        message: 'No se encontró el proceeding file con el id indicado',
        data: { proceedingFileId: data.proceedingFileId },
      }
    }

    const area = proceedingFile.proceedingFileType?.proceedingFileTypeAreaToUse
    if (area !== 'system-setting') {
      return {
        status: 400,
        type: 'warning',
        title: 'Invalid proceeding file type',
        message: 'El archivo debe ser de un tipo con área system-setting',
        data: { proceedingFileTypeAreaToUse: area },
      }
    }

    return {
      status: 200,
      type: 'success',
      title: 'OK',
      message: 'OK',
      data: {},
    }
  }

  async verifyInfo(
    data: { systemSettingId: number; proceedingFileId: number },
    excludeSystemSettingProceedingFileId?: number
  ) {
    const query = SystemSettingProceedingFile.query()
      .whereNull('system_setting_proceeding_file_deleted_at')
      .where('systemSettingId', data.systemSettingId)
      .where('proceedingFileId', data.proceedingFileId)

    if (excludeSystemSettingProceedingFileId) {
      query.whereNot('systemSettingProceedingFileId', excludeSystemSettingProceedingFileId)
    }

    const duplicate = await query.first()

    if (duplicate) {
      return {
        status: 400,
        type: 'warning',
        title: 'Relation already exists',
        message: 'Ya existe una relación para este system setting y proceeding file',
        data: { ...data },
      }
    }

    return {
      status: 200,
      type: 'success',
      title: 'OK',
      message: 'OK',
      data: {},
    }
  }

  async getExpiredAndExpiringBySystemSetting(
    systemSettingId: number,
    filters: ProceedingFileExpiredFilterInterface
  ) {
    const proceedingFileTypes = await ProceedingFileType.query()
      .whereNull('proceeding_file_type_deleted_at')
      .where('proceeding_file_type_area_to_use', 'system-setting')
      .orderBy('proceeding_file_type_id')
      .select('proceeding_file_type_id')

    const proceedingFileTypesIds = proceedingFileTypes.map((item) => item.proceedingFileTypeId)

    if (proceedingFileTypesIds.length === 0) {
      return {
        proceedingFilesExpired: [],
        proceedingFilesExpiring: [],
      }
    }

    const proceedingFilesExpired = await ProceedingFile.query()
      .whereNull('proceeding_file_deleted_at')
      .whereIn('proceeding_file_type_id', proceedingFileTypesIds)
      .whereBetween('proceeding_file_expiration_at', [filters.dateStart, filters.dateEnd])
      .whereHas('systemSettingProceedingFile', (q) => {
        q.whereNull('system_setting_proceeding_file_deleted_at').where('system_setting_id', systemSettingId)
      })
      .preload('proceedingFileType')
      .preload('systemSettingProceedingFile', (q) => {
        q.whereNull('system_setting_proceeding_file_deleted_at').preload('systemSetting')
      })
      .orderBy('proceeding_file_expiration_at')

    const newDateStart = DateTime.fromISO(filters.dateEnd).plus({ days: 1 }).toFormat('yyyy-MM-dd')
    const newDateEnd = DateTime.fromISO(filters.dateEnd).plus({ days: 30 }).toFormat('yyyy-MM-dd')
    const proceedingFilesExpiring = await ProceedingFile.query()
      .whereNull('proceeding_file_deleted_at')
      .whereIn('proceeding_file_type_id', proceedingFileTypesIds)
      .whereBetween('proceeding_file_expiration_at', [newDateStart, newDateEnd])
      .whereHas('systemSettingProceedingFile', (q) => {
        q.whereNull('system_setting_proceeding_file_deleted_at').where('system_setting_id', systemSettingId)
      })
      .preload('proceedingFileType')
      .preload('systemSettingProceedingFile', (q) => {
        q.whereNull('system_setting_proceeding_file_deleted_at').preload('systemSetting')
      })
      .orderBy('proceeding_file_expiration_at')

    return {
      proceedingFilesExpired: proceedingFilesExpired ? proceedingFilesExpired : [],
      proceedingFilesExpiring: proceedingFilesExpiring ? proceedingFilesExpiring : [],
    }
  }
}
