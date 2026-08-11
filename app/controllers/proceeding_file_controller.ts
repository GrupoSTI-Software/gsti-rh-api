import { HttpContext } from '@adonisjs/core/http'
import { inject } from '@adonisjs/core'
import UploadService from '#services/upload_service'
import ProceedingFileService from '#services/proceeding_file_service'
import ProceedingFile from '#models/proceeding_file'
import ProceedingFileType from '#models/proceeding_file_type'
import SystemSetting from '#models/system_setting'
import Env from '#start/env'
import {
  createProceedingFileValidator,
  updateProceedingFileValidator,
} from '#validators/proceeding_file'
import { cuid } from '@adonisjs/core/helpers'
import path from 'node:path'
import { DateTime } from 'luxon'
import { ProceedingFileExpiredFilterInterface } from '../interfaces/proceeding_file_expired_filter_interface.js'
import { ensureSecondaryPermission } from '#helpers/permission_gate_secondary'
import {
  proceedingFileTypeIsEmployeeArea,
  proceedingFileIsEmployeeArea,
} from '#helpers/proceeding_file_is_employee_area'
import {
  EMPLOYEES_PROCEEDING_FILE_EMPLOYEE_AREA_WRITE_PERMISSION,
  EMPLOYEES_PROCEEDING_FILE_EMPLOYEE_AREA_DELETE_PERMISSION,
} from '#constants/employees_write_permission_declarations'

export type ProceedingFileMultipartStoreOptions = {
  /** systemSettingId fijado por la ruta (POST /api/system-settings-proceeding-files); si no, se toma del multipart/query */
  systemSettingIdFromPath?: number
}

function resolveMultipartFile(
  request: HttpContext['request'],
  validationOptions: Record<string, string | string[] | number | boolean | undefined>
) {
  return request.file('file', validationOptions as any) ?? request.file('archivo', validationOptions as any)
}

function buildMissingUploadFileResponse(request: HttpContext['request']) {
  const contentType = request.header('content-type') ?? ''
  const isJson = contentType.includes('application/json')
  return {
    status: 400 as const,
    type: 'warning' as const,
    title: 'Archivo no recibido',
    message: isJson
      ? 'Esta ruta solo acepta multipart/form-data con el binario del archivo. No envíes el cuerpo como application/json (aunque incluyas proceedingFile u otros objetos). Usa FormData y append("file", archivo).'
      : 'No se recibió un archivo válido en el campo "file" (o "archivo"). Revisa: Content-Type multipart/form-data, nombre del campo, y no fijes Content-Type a mano al usar FormData (debe incluir el boundary).',
    data: {
      contentType: contentType || null,
      expectedFieldNames: ['file', 'archivo'],
    },
  }
}

/**
 * Subida multipart de proceeding files (empleados, system-setting, etc.).
 */
export async function processProceedingFileMultipartStore(
  ctx: HttpContext,
  options?: ProceedingFileMultipartStoreOptions
) {
  const { request, response } = ctx
  const proceedingFileService = new ProceedingFileService()
  let inputs = request.all()
  inputs = proceedingFileService.sanitizeInput(inputs)
  await request.validateUsing(createProceedingFileValidator)

  const validationOptions = {
    types: ['image', 'document', 'text', 'application', 'archive'],
    size: '',
  }
  const file = resolveMultipartFile(request, validationOptions)
  if (!file) {
    response.status(400)
    return buildMissingUploadFileResponse(request)
  }
  const disallowedExtensions = [
    'mp4',
    'avi',
    'mkv',
    'mov',
    'wmv',
    'flv',
    'mp3',
    'wav',
    'flac',
    'aac',
    'ogg',
  ]
  if (disallowedExtensions.includes(file.extname ? file.extname : '')) {
    response.status(400)
    return {
      status: 400,
      type: 'warning',
      title: 'Please upload a file valid',
      message: 'Missing data to process',
      data: file,
    }
  }

  // multipart, query o ambos: proceedingFileTypeId y/o type (mismo significado: id del tipo)
  const proceedingFileTypeIdRaw =
    inputs['proceedingFileTypeId'] ?? request.input('proceedingFileTypeId') ?? request.input('type')
  if (
    proceedingFileTypeIdRaw === undefined ||
    proceedingFileTypeIdRaw === null ||
    String(proceedingFileTypeIdRaw).trim() === '' ||
    proceedingFileTypeIdRaw === 'null'
  ) {
    response.status(400)
    return {
      status: 400,
      type: 'warning',
      title: 'Validation error',
      message:
        'Se requiere proceedingFileTypeId o type (id del tipo de archivo) en el multipart o en la query',
      data: {},
    }
  }

  const proceedingFileTypeId = Number(proceedingFileTypeIdRaw)
  if (Number.isNaN(proceedingFileTypeId) || proceedingFileTypeId <= 0) {
    response.status(400)
    return {
      status: 400,
      type: 'warning',
      title: 'Validation error',
      message: 'proceedingFileTypeId o type debe ser un número positivo',
      data: { proceedingFileTypeId: proceedingFileTypeIdRaw },
    }
  }

  const proceedingFileType = await ProceedingFileType.query()
    .whereNull('deletedAt')
    .where('proceedingFileTypeId', proceedingFileTypeId)
    .first()
  if (!proceedingFileType) {
    response.status(404)
    return {
      status: 404,
      type: 'warning',
      title: 'Proceeding file type not found',
      message: 'The proceeding file type was not found',
      data: { proceedingFileTypeId },
    }
  }

  if (await proceedingFileTypeIsEmployeeArea(proceedingFileTypeId)) {
    const allowed = await ensureSecondaryPermission(
      ctx,
      EMPLOYEES_PROCEEDING_FILE_EMPLOYEE_AREA_WRITE_PERMISSION
    )
    if (!allowed) {
      return
    }
  }

  if (options?.systemSettingIdFromPath !== undefined) {
    const sid = Number(options.systemSettingIdFromPath)
    if (Number.isNaN(sid) || sid <= 0) {
      response.status(400)
      return {
        status: 400,
        type: 'warning',
        title: 'Validation error',
        message: 'systemSettingId de ruta inválido',
        data: { systemSettingId: options.systemSettingIdFromPath },
      }
    }
    if (proceedingFileType.proceedingFileTypeAreaToUse !== 'system-setting') {
      response.status(400)
      return {
        status: 400,
        type: 'warning',
        title: 'Validation error',
        message:
          'Este endpoint solo admite tipos de archivo con área system-setting; el tipo indicado no lo es',
        data: { proceedingFileTypeId, proceedingFileTypeAreaToUse: proceedingFileType.proceedingFileTypeAreaToUse },
      }
    }
  }

  let proceedingFileExpirationAt = request.input('proceedingFileExpirationAt')
  proceedingFileExpirationAt = proceedingFileExpirationAt
    ? DateTime.fromJSDate(new Date(proceedingFileExpirationAt)).setZone('UTC').toJSDate()
    : null
  const proceedingFileName = inputs['proceedingFileName']
  const proceedingFileActive = inputs['proceedingFileActive']
  const proceedingFileObservations = inputs['proceedingFileObservations']
  const isExclusive = request.input('isExclusive')
  const employeeId = request.input('employeeId')
  const systemSettingIdRaw = request.input('systemSettingId')
  let systemSettingId: number | null = null
  if (options?.systemSettingIdFromPath !== undefined) {
    systemSettingId = Number(options.systemSettingIdFromPath)
  } else if (
    systemSettingIdRaw !== undefined &&
    systemSettingIdRaw !== null &&
    String(systemSettingIdRaw).trim() !== '' &&
    systemSettingIdRaw !== 'null'
  ) {
    systemSettingId = Number(systemSettingIdRaw)
    if (Number.isNaN(systemSettingId) || systemSettingId <= 0) {
      response.status(400)
      return {
        status: 400,
        type: 'error',
        title: 'Validation error',
        message: 'systemSettingId must be a positive number',
        data: { systemSettingId: systemSettingIdRaw },
      }
    }
  }
  const proceedingFileUuid = cuid()
  const proceedingFile = {
    proceedingFileName: proceedingFileName,
    proceedingFilePath: '',
    proceedingFileTypeId: proceedingFileTypeId,
    proceedingFileExpirationAt: proceedingFileExpirationAt,
    proceedingFileActive:
      proceedingFileActive && (proceedingFileActive === 'true' || proceedingFileActive === '1')
        ? 1
        : 0,
    proceedingFileUuid: proceedingFileUuid,
    proceedingFileObservations: proceedingFileObservations,
  } as ProceedingFile
  const fileName = `${new Date().getTime()}_${file.clientName}`
  const uploadService = new UploadService()
  const isValidInfo = await proceedingFileService.verifyInfo(proceedingFile)
  if (isValidInfo.status !== 200) {
    response.status(isValidInfo.status)
    return {
      status: isValidInfo.status,
      type: isValidInfo.type,
      title: isValidInfo.title,
      message: isValidInfo.message,
      data: isValidInfo.data,
    }
  }
  if (isExclusive && (isExclusive === 'true' || isExclusive === true || isExclusive === '1')) {
    if (!employeeId) {
      response.status(400)
      return {
        status: 400,
        type: 'error',
        title: 'Validation error',
        message: 'employeeId is required when isExclusive is true',
        data: { isExclusive, employeeId },
      }
    }
  }
  const area = proceedingFileType.proceedingFileTypeAreaToUse
  if (area === 'system-setting') {
    // systemSettingId opcional: igual que empleados (subir archivo y luego POST /api/system-settings-proceeding-files)
    if (systemSettingId !== null) {
      const systemSetting = await SystemSetting.query()
        .whereNull('deletedAt')
        .where('systemSettingId', systemSettingId)
        .first()
      if (!systemSetting) {
        response.status(404)
        return {
          status: 404,
          type: 'warning',
          title: 'System setting not found',
          message: 'No system setting was found with the given ID',
          data: { systemSettingId },
        }
      }
    }
    const exclusive =
      isExclusive === true || isExclusive === 'true' || isExclusive === 1 || isExclusive === '1'
    if (exclusive || employeeId) {
      response.status(400)
      return {
        status: 400,
        type: 'error',
        title: 'Validation error',
        message: 'employeeId and isExclusive are not used with system-setting proceeding file types',
        data: {},
      }
    }
  } else if (systemSettingId !== null) {
    response.status(400)
    return {
      status: 400,
      type: 'error',
      title: 'Validation error',
      message: 'systemSettingId is only valid when the proceeding file type area is system-setting',
      data: { proceedingFileTypeAreaToUse: area },
    }
  }
  try {
    const fileUrl = await uploadService.fileUpload(file, 'proceeding-files', fileName, 'private')
    proceedingFile.proceedingFilePath = fileUrl
    if (!proceedingFile.proceedingFileName) {
      proceedingFile.proceedingFileName = fileName
    }
    const isExclusiveBool = isExclusive && (isExclusive === 'true' || isExclusive === true || isExclusive === '1')
    const newProceedingFile = await proceedingFileService.create(
      proceedingFile,
      isExclusiveBool ? Number(employeeId) : null,
      area === 'system-setting' ? systemSettingId : null
    )
    response.status(201)
    return {
      type: 'success',
      title: 'Proceeding file',
      message: 'The proceeding file was created successfully',
      data: { proceedingFile: newProceedingFile },
    }
  } catch (error) {
    const messageError =
      error.code === 'E_VALIDATION_ERROR' ? error.messages[0].message : error.message
    response.status(500)
    return {
      type: 'error',
      title: 'Server error',
      message: 'An unexpected error has occurred on the server',
      error: messageError,
    }
  }
}

export default class ProceedingFileController {
  /**
   * @swagger
   * /api/proceeding-files:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Proceeding Files
   *     summary: get all proceeding files
   *     responses:
   *       '200':
   *         description: Resource processed successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Response message
   *                 data:
   *                   type: object
   *                   description: Object processed
   *       '404':
   *         description: The resource could not be found
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Response message
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       '400':
   *         description: The parameters entered are invalid or essential data is missing to process the request.
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Response message
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       default:
   *         description: Unexpected error
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Response message
   *                 data:
   *                   type: object
   *                   description: Error message obtained
   *                   properties:
   *                     error:
   *                       type: string
   */

  async index({ response }: HttpContext) {
    try {
      const proceedingFiles = await ProceedingFile.query().whereNull('proceeding_file_deleted_at')
      return response.status(200).json({
        type: 'success',
        title: 'Successfully action',
        message: 'Resources were found successfully',
        data: proceedingFiles,
      })
    } catch (error) {
      return response.status(500).json({
        type: 'error',
        title: 'Server error',
        message: error.message,
        data: null,
      })
    }
  }

  /**
   * @swagger
   * /api/proceeding-files/:
   *   post:
   *     summary: Upload a file
   *     tags:
   *       - Proceeding Files
   *     requestBody:
   *       content:
   *         multipart/form-data:
   *           schema:
   *             type: object
   *             properties:
   *               file:
   *                 type: string
   *                 format: binary
   *                 description: The file to upload
   *               proceedingFileName:
   *                 type: string
   *                 description: Proceeding file name
   *                 required: true
   *                 default: ''
   *               proceedingFileTypeId:
   *                 type: number
   *                 description: Id del tipo de archivo (obligatorio salvo que envíes type)
   *                 required: false
   *                 default: ''
   *               type:
   *                 type: number
   *                 description: Id del tipo (alias de proceedingFileTypeId; mismo uso que ?type= en listados)
   *                 required: false
   *               proceedingFileExpirationAt:
   *                 type: string
   *                 format: date
   *                 description: Proceeding file expiration at (YYYY-MM-DD)
   *                 required: false
   *                 default: ''
   *               proceedingFileActive:
   *                 type: boolean
   *                 description: Proceeding file status
   *                 required: false
   *                 default: true
   *               proceedingFileObservations:
   *                 type: string
   *                 description: Proceeding file observations
   *                 required: false
   *                 default: ''
   *               isExclusive:
   *                 type: boolean
   *                 description: Indicates if the proceeding file is exclusive to an employee
   *                 required: false
   *                 default: false
   *               employeeId:
   *                 type: number
   *                 description: Employee ID (required when isExclusive is true)
   *                 required: false
   *               systemSettingId:
   *                 type: number
   *                 description: ID de system setting (obligatorio si el tipo tiene área system-setting; también en multipart en POST /api/system-settings-proceeding-files)
   *                 required: false
   *     responses:
   *       '201':
   *         description: Resource processed successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: Processed object
   *       '404':
   *         description: Resource not found
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       '400':
   *         description: The parameters entered are invalid or essential data is missing to process the request
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       default:
   *         description: Unexpected error
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: Error message obtained
   *                   properties:
   *                     error:
   *                       type: string
   */
  @inject()
  async store(ctx: HttpContext) {
    return processProceedingFileMultipartStore(ctx)
  }

  /**
   * @swagger
   * /api/proceeding-files/{proceedingFileId}:
   *   put:
   *     summary: Update upload a file
   *     tags:
   *       - Proceeding Files
   *     parameters:
   *       - in: path
   *         name: proceedingFileId
   *         schema:
   *           type: number
   *         description: Proceeding file id
   *         required: true
   *     requestBody:
   *       content:
   *         multipart/form-data:
   *           schema:
   *             type: object
   *             properties:
   *               file:
   *                 type: string
   *                 format: binary
   *                 description: The file to upload
   *               proceedingFileName:
   *                 type: string
   *                 description: Proceeding file name
   *                 required: true
   *                 default: ''
   *               proceedingFileTypeId:
   *                 type: number
   *                 description: Proceeding file type id
   *                 required: true
   *                 default: ''
   *               proceedingFileExpirationAt:
   *                 type: string
   *                 format: date
   *                 description: Proceeding file expiration at (YYYY-MM-DD)
   *                 required: false
   *                 default: ''
   *               proceedingFileActive:
   *                 type: boolean
   *                 description: Proceeding file status
   *                 required: false
   *                 default: true
   *               proceedingFileObservations:
   *                 type: string
   *                 description: Proceeding file observations
   *                 required: false
   *                 default: ''
   *     responses:
   *       '200':
   *         description: Resource processed successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: Processed object
   *       '404':
   *         description: Resource not found
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       '400':
   *         description: The parameters entered are invalid or essential data is missing to process the request
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       default:
   *         description: Unexpected error
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: Error message obtained
   *                   properties:
   *                     error:
   *                       type: string
   */
  @inject()
  async update(ctx: HttpContext) {
    const { request, response, auth } = ctx
    try {
      const proceedingFileService = new ProceedingFileService()
      const proceedingFileId = request.param('proceedingFileId')
      if (!proceedingFileId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'The proceeding file Id was not found',
          message: 'Missing data to process',
          data: { proceedingFileId },
        }
      }
      const currentProceedingFile = await ProceedingFile.query()
        .whereNull('proceeding_file_deleted_at')
        .where('proceeding_file_id', proceedingFileId)
        .first()
      if (!currentProceedingFile) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The proceeding file was not found',
          message: 'The proceeding file was not found with the entered ID',
          data: { proceedingFileId },
        }
      }
      const nextProceedingFileTypeId = Number(
        request.input('proceedingFileTypeId') ?? currentProceedingFile.proceedingFileTypeId
      )
      const requiresEmployeePermission =
        (await proceedingFileIsEmployeeArea(Number(proceedingFileId))) ||
        (await proceedingFileTypeIsEmployeeArea(nextProceedingFileTypeId))
      if (requiresEmployeePermission) {
        const allowed = await ensureSecondaryPermission(
          ctx,
          EMPLOYEES_PROCEEDING_FILE_EMPLOYEE_AREA_WRITE_PERMISSION
        )
        if (!allowed) {
          return
        }
      }
      let inputs = request.all()
      inputs = proceedingFileService.sanitizeInput(inputs)
      await request.validateUsing(updateProceedingFileValidator)
      const validationOptions = {
        types: ['image', 'document', 'text', 'application', 'archive'],
        size: '1mb',
      }
      const file = request.file('file', validationOptions)
      const previousProceedingFile = JSON.parse(
        JSON.stringify(currentProceedingFile)
      )
      const proceedingFileName = inputs['proceedingFileName']
      const proceedingFileTypeId = inputs['proceedingFileTypeId']
      let proceedingFileExpirationAt = request.input('proceedingFileExpirationAt')
      proceedingFileExpirationAt = proceedingFileExpirationAt
        ? DateTime.fromJSDate(new Date(proceedingFileExpirationAt)).setZone('UTC').toJSDate()
        : null
      const proceedingFileActive = inputs['proceedingFileActive']
      const proceedingFileObservations = inputs['proceedingFileObservations']
      const proceedingFile = {
        proceedingFileId: proceedingFileId,
        proceedingFileName: proceedingFileName
          ? proceedingFileName
          : currentProceedingFile.proceedingFileName,
        proceedingFilePath: currentProceedingFile.proceedingFilePath
          ? currentProceedingFile.proceedingFilePath
          : '',
        proceedingFileTypeId: proceedingFileTypeId
          ? proceedingFileTypeId
          : currentProceedingFile.proceedingFileTypeId,
        proceedingFileExpirationAt: proceedingFileExpirationAt,
        proceedingFileActive:
          proceedingFileActive && (proceedingFileActive === 'true' || proceedingFileActive === '1')
            ? 1
            : 0,
        proceedingFileObservations: proceedingFileObservations,
      } as ProceedingFile
      const isValidInfo = await proceedingFileService.verifyInfo(proceedingFile)
      if (isValidInfo.status !== 200) {
        response.status(isValidInfo.status)
        return {
          status: isValidInfo.status,
          type: isValidInfo.type,
          title: isValidInfo.title,
          message: isValidInfo.message,
          data: isValidInfo.data,
        }
      }
      if (file) {
        const disallowedExtensions = [
          'mp4',
          'avi',
          'mkv',
          'mov',
          'wmv',
          'flv', // Video
          'mp3',
          'wav',
          'flac',
          'aac',
          'ogg', // Audio
        ]
        if (disallowedExtensions.includes(file.extname ? file.extname : '')) {
          response.status(400)
          return {
            status: 400,
            type: 'warning',
            title: 'Please upload a file valid',
            message: 'Missing data to process',
            data: file,
          }
        }
        const fileName = `${new Date().getTime()}_${file.clientName}`
        const uploadService = new UploadService()
        const fileUrl = await uploadService.fileUpload(file, 'proceeding-files', fileName, 'private')
        if (currentProceedingFile.proceedingFilePath) {
          const fileNameWithExt = decodeURIComponent(
            path.basename(currentProceedingFile.proceedingFilePath)
          )
          const fileKey = `${Env.get('AWS_ROOT_PATH')}/proceeding-files/${fileNameWithExt}`
          await uploadService.deleteFile(fileKey)
        }
        proceedingFile.proceedingFilePath = fileUrl
        if (!proceedingFile.proceedingFileName) {
          proceedingFile.proceedingFileName = fileName
        }
      }
      const updateProceedingFile = await proceedingFileService.update(
        currentProceedingFile,
        proceedingFile
      )
      const rawHeaders = request.request.rawHeaders
      const userId = auth.user?.userId
      if (userId) {
        const logProceedingFile = await proceedingFileService.createActionLog(
          rawHeaders,
          'update'
        )
        logProceedingFile.user_id = userId
        logProceedingFile.record_current = JSON.parse(
          JSON.stringify(updateProceedingFile)
        )
        logProceedingFile.record_previous = previousProceedingFile
        await proceedingFileService.saveActionOnLog(logProceedingFile)
      }
      response.status(200)
      return {
        type: 'success',
        title: 'Proceeding file',
        message: 'The proceeding file was updated successfully',
        data: { proceedingFile: updateProceedingFile },
      }
    } catch (error) {
      const messageError =
        error.code === 'E_VALIDATION_ERROR' ? error.messages[0].message : error.message
      response.status(500)
      return {
        type: 'error',
        title: 'Server error',
        message: 'An unexpected error has occurred on the server',
        error: messageError,
      }
    }
  }

  /**
   * @swagger
   * /api/proceeding-files/{proceedingFileId}:
   *   delete:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Proceeding Files
   *     summary: delete proceeding file
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: proceedingFileId
   *         schema:
   *           type: number
   *         description: Proceeding file id
   *         required: true
   *     responses:
   *       '200':
   *         description: Resource processed successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: Processed object
   *       '404':
   *         description: Resource not found
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       '400':
   *         description: The parameters entered are invalid or essential data is missing to process the request
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       default:
   *         description: Unexpected error
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: Error message obtained
   *                   properties:
   *                     error:
   *                       type: string
   */
  async delete(ctx: HttpContext) {
    const { request, response } = ctx
    try {
      const proceedingFileId = request.param('proceedingFileId')
      if (!proceedingFileId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'The proceeding file Id was not found',
          message: 'Missing data to process',
          data: { proceedingFileId },
        }
      }
      const currentProceedingFile = await ProceedingFile.query()
        .whereNull('proceeding_file_deleted_at')
        .where('proceeding_file_id', proceedingFileId)
        .first()
      if (!currentProceedingFile) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The proceeding file was not found',
          message: 'The proceeding file was not found with the entered ID',
          data: { proceedingFileId },
        }
      }
      if (await proceedingFileIsEmployeeArea(Number(proceedingFileId))) {
        const allowed = await ensureSecondaryPermission(
          ctx,
          EMPLOYEES_PROCEEDING_FILE_EMPLOYEE_AREA_DELETE_PERMISSION
        )
        if (!allowed) {
          return
        }
      }
      const proceedingFileService = new ProceedingFileService()
      const deleteProceedingFile = await proceedingFileService.delete(currentProceedingFile)
      if (deleteProceedingFile) {
        response.status(201)
        return {
          type: 'success',
          title: 'Proceeding file',
          message: 'The proceeding file was deleted successfully',
          data: { proceedingFile: deleteProceedingFile },
        }
      }
    } catch (error) {
      response.status(500)
      return {
        type: 'error',
        title: 'Server error',
        message: 'An unexpected error has occurred on the server',
        error: error.message,
      }
    }
  }

  /**
   * @swagger
   * /api/proceeding-files/{proceedingFileId}:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Proceeding Files
   *     summary: get proceeding file by id
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: proceedingFileId
   *         schema:
   *           type: number
   *         description: Proceeding file id
   *         required: true
   *     responses:
   *       '200':
   *         description: Resource processed successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: Processed object
   *       '404':
   *         description: Resource not found
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       '400':
   *         description: The parameters entered are invalid or essential data is missing to process the request
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       default:
   *         description: Unexpected error
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: Error message obtained
   *                   properties:
   *                     error:
   *                       type: string
   */
  async show({ request, response }: HttpContext) {
    try {
      const proceedingFileId = request.param('proceedingFileId')
      if (!proceedingFileId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'The proceeding file Id was not found',
          message: 'Missing data to process',
          data: { proceedingFileId },
        }
      }
      const proceedingFileService = new ProceedingFileService()
      const showProceedingFile = await proceedingFileService.show(proceedingFileId)
      if (!showProceedingFile) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The proceeding file was not found',
          message: 'The proceeding file was not found with the entered ID',
          data: { proceedingFileId },
        }
      } else {
        response.status(200)
        return {
          type: 'success',
          title: 'Proceeding file',
          message: 'The proceeding file was found successfully',
          data: { showProceedingFile: showProceedingFile },
        }
      }
    } catch (error) {
      response.status(500)
      return {
        type: 'error',
        title: 'Server error',
        message: 'An unexpected error has occurred on the server',
        error: error.message,
      }
    }
  }

  /**
   * @swagger
   * /api/proceeding-files/send-expired-to-email:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Proceeding Files
   *     summary: get expired proceeding files by date and send to email
   *     produces:
   *       - application/json
   *     parameters:
   *       - name: dateStart
   *         in: query
   *         required: false
   *         description: Date start (YYYY-MM-DD)
   *         format: date
   *         schema:
   *           type: string
   *       - name: dateEnd
   *         in: query
   *         required: false
   *         description: Date end (YYYY-MM-DD)
   *         format: date
   *         schema:
   *           type: string
   *     responses:
   *       '200':
   *         description: Resource processed successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: Processed object
   *       '404':
   *         description: Resource not found
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       '400':
   *         description: The parameters entered are invalid or essential data is missing to process the request
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       default:
   *         description: Unexpected error
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: Error message obtained
   *                   properties:
   *                     error:
   *                       type: string
   */
  async sendFilesExpiresToEmail({ request, response }: HttpContext) {
    try {
      const dateStart = request.input('dateStart')
      const dateEnd = request.input('dateEnd')
      const filters = { dateStart: dateStart, dateEnd: dateEnd } as ProceedingFileExpiredFilterInterface
      const proceddingFileExpiredService = new ProceedingFileService()
      const proceedingFiles = await proceddingFileExpiredService.sendFilesExpiresToEmail(filters)

      response.status(200)
      return {
        type: 'success',
        title: 'Proceeding files expires',
        message: 'The proceeding files expires were send successfully',
        data: {
          proceedingFiles: proceedingFiles,
        },
      }
    } catch (error) {
      response.status(500)
      return {
        type: 'error',
        title: 'Server error',
        message: 'An unexpected error has occurred on the server',
        error: error.message,
      }
    }
  }
}
