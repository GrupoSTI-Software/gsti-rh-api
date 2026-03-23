import ProceedingFileType from '#models/proceeding_file_type'
import vine from '@vinejs/vine'

/**
 * proceedingFileTypeId se valida en el controlador; también se acepta el alias `type`
 * (query o multipart), igual que en GET .../proceeding-files?type= para empleados.
 */
export const createProceedingFileValidator = vine.compile(
  vine.object({
    proceedingFileName: vine.string().trim().minLength(0).maxLength(100).optional(),
    systemSettingId: vine.number().optional(),
  })
)

export const updateProceedingFileValidator = vine.compile(
  vine.object({
    proceedingFileName: vine.string().trim().minLength(0).maxLength(100).optional(),
    proceedingFileTypeId: vine.number().exists(async (_db, value) => {
      const proceedingFileType = await ProceedingFileType.query()
        .whereNull('deletedAt')
        .where('proceedingFileTypeId', value)
        .first()
      return !!proceedingFileType
    }),
  })
)
