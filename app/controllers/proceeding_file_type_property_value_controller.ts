import { HttpContext } from '@adonisjs/core/http'
import UploadService from '#services/upload_service'
import path from 'node:path'
import Env from '#start/env'
import logger from '@adonisjs/core/services/logger'
import ProceedingFileTypePropertyValue from '#models/proceeding_file_type_property_value'
import ProceedingFileTypePropertyValueService from '#services/proceeding_file_type_property_value_service'
import ScopeDeniedLogService from '#services/scope_denied_log_service'
import {
  createProceedingFileTypePropertyValueValidator,
  updateProceedingFileTypePropertyValueValidator,
} from '#validators/proceeding_file_type_property_value'
import { ensureSecondaryPermission } from '#helpers/permission_gate_secondary'
import {
  proceedingFileIsEmployeeArea,
  proceedingFileTypePropertyValueIsEmployeeArea,
} from '#helpers/proceeding_file_is_employee_area'
import {
  EMPLOYEES_PROCEEDING_FILE_EMPLOYEE_AREA_WRITE_PERMISSION,
  EMPLOYEES_PROCEEDING_FILE_EMPLOYEE_AREA_DELETE_PERMISSION,
} from '#constants/employees_write_permission_declarations'
import { EMPLOYEES_PROCEEDING_FILE_EMPLOYEE_AREA_READ_PERMISSION } from '#constants/employees_read_permission_declarations'

/** 404 uniforme de pertenencia (no revela "no existe" vs "no es tuyo") — regla 5, USRH1786595131481. */
function notFoundOrOutOfScopeResponse(response: HttpContext['response']) {
  return response.status(404).json({
    title: 'Recurso no encontrado',
    detail: 'El recurso solicitado no existe o está fuera de tu alcance.',
    key: 'recurso-no-encontrado',
    code: 'PFTPV.NOT.001',
  })
}

/**
 * Traduce un error inesperado a 500. Conserva el comportamiento legacy para
 * errores de validación (`E_VALIDATION_ERROR`, message inocuo) pero deja de
 * repetir `error.message` para cualquier otro error (R-1, USRH1786595131481):
 * el `@beforeCreate` del modelo y `resolveParentBusinessUnitId` lanzan
 * mensajes que contienen literalmente "no está en tu alcance", y devolverlos
 * verbatim rompería la regla 5. El detalle interno de esos casos solo va al
 * logger.
 */
function unexpectedErrorResponse(error: unknown, response: HttpContext['response']) {
  const isValidationError =
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'E_VALIDATION_ERROR'

  if (isValidationError) {
    const messages = (error as unknown as { messages: Array<{ message: string }> }).messages
    response.status(500)
    return {
      type: 'error',
      title: 'Server error',
      message: 'An unexpected error has occurred on the server',
      error: messages[0].message,
    }
  }

  logger.error({ err: error }, 'proceeding_file_type_property_value: error inesperado')
  response.status(500)
  return {
    type: 'error',
    title: 'Server error',
    message: 'An unexpected error has occurred on the server',
  }
}

export default class ProceedingFileTypePropertyValueController {
  /**
   * @swagger
   * /api/proceeding-file-type-property-values:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Proceeding File Type Property Values
   *     summary: create new proceeding file type property value
   *     produces:
   *       - application/json
   *     requestBody:
   *       content:
   *         multipart/form-data:
   *           schema:
   *             type: object
   *             properties:
   *               proceedingFileTypePropertyValueValueFile:
   *                 type: string
   *                 format: binary
   *                 description: Proceeding file type property value value file
   *                 required: false
   *                 default: ''
   *               proceedingFileTypePropertyValueValue:
   *                 type: string
   *                 description: Proceeding file type property value value
   *                 required: true
   *                 default: ''
   *               proceedingFileTypePropertyValueActive:
   *                 type: boolean
   *                 description: Proceeding file type property value active
   *                 required: true
   *                 default: true
   *               proceedingFileTypePropertyId:
   *                 type: number
   *                 description: proceeding file type property id
   *                 required: true
   *                 default: ''
   *               employeeId:
   *                 type: number
   *                 description: Employee id (opcional; p. ej. valores ligados solo a proceeding file / system setting)
   *                 required: false
   *                 default: ''
   *               proceedingFileId:
   *                 type: number
   *                 description: Proceeding file id
   *                 required: true
   *                 default: ''
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
  async store(ctx: HttpContext) {
    const { auth, request, response, businessUnitScope } = ctx
    try {
      const proceedingFileIdInput = request.input('proceedingFileId')
      if (await proceedingFileIsEmployeeArea(Number(proceedingFileIdInput))) {
        const allowed = await ensureSecondaryPermission(
          ctx,
          EMPLOYEES_PROCEEDING_FILE_EMPLOYEE_AREA_WRITE_PERMISSION
        )
        if (!allowed) {
          return
        }
      }
      const proceedingFileTypePropertyValueValue = request.input(
        'proceedingFileTypePropertyValueValue'
      )
      const proceedingFileTypePropertyValueActive = request.input(
        'proceedingFileTypePropertyValueActive'
      )
      const proceedingFileTypePropertyValueService = new ProceedingFileTypePropertyValueService()
      const data = await request.validateUsing(createProceedingFileTypePropertyValueValidator)
      const proceedingFileTypePropertyValue = {
        proceedingFileTypePropertyValueValue: proceedingFileTypePropertyValueValue,
        proceedingFileTypePropertyValueActive:
          proceedingFileTypePropertyValueActive &&
          (proceedingFileTypePropertyValueActive === 'true' ||
            proceedingFileTypePropertyValueActive === '1')
            ? 1
            : 0,
        proceedingFileTypePropertyId: data.proceedingFileTypePropertyId,
        employeeId: data.employeeId ?? null,
        proceedingFileId: data.proceedingFileId,
      } as ProceedingFileTypePropertyValue
      const exist = await proceedingFileTypePropertyValueService.verifyInfoExist(
        proceedingFileTypePropertyValue
      )
      if (exist.status !== 200) {
        if (exist.scopeDenied) {
          await ScopeDeniedLogService.log({
            domain: 'proceeding_file_type_property_value',
            action: 'store',
            requestedId: exist.requestedId ?? 0,
            actorUserId: auth.user?.userId ?? null,
            businessUnitScope,
          })
          return notFoundOrOutOfScopeResponse(response)
        }
        response.status(exist.status)
        return {
          type: exist.type,
          title: exist.title,
          message: exist.message,
          data: { ...data },
        }
      }

      const validationOptions = {
        types: ['image', 'document', 'text', 'application', 'archive'],
        size: '',
      }
      const file = request.file('proceedingFileTypePropertyValueValueFile', validationOptions)
      if (!proceedingFileTypePropertyValueValue && !file) {
        response.status(400)
        return {
          type: 'warning',
          title: 'Missing data to process',
          message: 'The proceeding file type property value value was not found',
          data: { ...proceedingFileTypePropertyValue },
        }
      }
      if (file) {
        const fileName = `${new Date().getTime()}_${file.clientName}`
        const uploadService = new UploadService()
        const fileUrl = await uploadService.fileUpload(
          file,
          'proceeding-file-type-property-values',
          fileName
        )
        proceedingFileTypePropertyValue.proceedingFileTypePropertyValueValue = fileUrl
      }
      const newProceedingFileTypePropertyValue =
        await proceedingFileTypePropertyValueService.create(proceedingFileTypePropertyValue)
      if (!newProceedingFileTypePropertyValue) {
        await ScopeDeniedLogService.log({
          domain: 'proceeding_file_type_property_value',
          action: 'store',
          requestedId: proceedingFileTypePropertyValue.employeeId ?? proceedingFileTypePropertyValue.proceedingFileId,
          actorUserId: auth.user?.userId ?? null,
          businessUnitScope,
        })
        return notFoundOrOutOfScopeResponse(response)
      }
      response.status(201)
      return {
        type: 'success',
        title: 'Proceeding file type property values',
        message: 'The proceeding file type property value was created successfully',
        data: { proceedingFileTypePropertyValue: newProceedingFileTypePropertyValue },
      }
    } catch (error) {
      return unexpectedErrorResponse(error, response)
    }
  }

  /**
   * @swagger
   * /api/proceeding-file-type-property-values/{proceedingFileTypePropertyValueId}:
   *   put:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Proceeding File Type Property Values
   *     summary: update proceeding file type property value
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: proceedingFileTypePropertyValueId
   *         schema:
   *           type: number
   *         description: Proceeding file type property value id
   *         required: true
   *     requestBody:
   *       content:
   *         multipart/form-data:
   *           schema:
   *             type: object
   *             properties:
   *               proceedingFileTypePropertyValueValueFile:
   *                 type: string
   *                 format: binary
   *                 description: Proceeding file type property value value file
   *                 required: false
   *                 default: ''
   *               proceedingFileTypePropertyValueValue:
   *                 type: string
   *                 description: Proceeding file type property value value
   *                 required: true
   *                 default: ''
   *               proceedingFileTypePropertyValueActive:
   *                 type: boolean
   *                 description: Proceeding file type property value active
   *                 required: true
   *                 default: true
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
  async update(ctx: HttpContext) {
    const { auth, request, response, businessUnitScope } = ctx
    try {
      const proceedingFileTypePropertyValueId = request.param('proceedingFileTypePropertyValueId')
      const proceedingFileTypePropertyValueValue = request.input(
        'proceedingFileTypePropertyValueValue'
      )
      const proceedingFileTypePropertyValueActive = request.input(
        'proceedingFileTypePropertyValueActive'
      )
      const proceedingFileTypePropertyValue = {
        proceedingFileTypePropertyValueId: proceedingFileTypePropertyValueId,
        proceedingFileTypePropertyValueValue:
          proceedingFileTypePropertyValueValue !== 'null'
            ? proceedingFileTypePropertyValueValue
            : null,
        proceedingFileTypePropertyValueActive:
          proceedingFileTypePropertyValueActive &&
          (proceedingFileTypePropertyValueActive === 'true' ||
            proceedingFileTypePropertyValueActive === '1')
            ? 1
            : 0,
      } as ProceedingFileTypePropertyValue
      if (!proceedingFileTypePropertyValueId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'Missing data to process',
          message: 'The proceeding file type property value Id was not found',
          data: { ...proceedingFileTypePropertyValue },
        }
      }
      // El mixin `withBusinessUnitScope` filtra esta query por la unidad activa
      // (regla 5): un id de otra empresa resuelve `null` aquí, igual que uno
      // inexistente — no se distingue el motivo.
      const currentProceedingFileTypePropertyValue = await ProceedingFileTypePropertyValue.query()
        .whereNull('proceeding_file_type_property_value_deleted_at')
        .where('proceeding_file_type_property_value_id', proceedingFileTypePropertyValueId)
        .first()
      if (!currentProceedingFileTypePropertyValue) {
        await ScopeDeniedLogService.log({
          domain: 'proceeding_file_type_property_value',
          action: 'update',
          requestedId: proceedingFileTypePropertyValueId,
          actorUserId: auth.user?.userId ?? null,
          businessUnitScope,
        })
        return notFoundOrOutOfScopeResponse(response)
      }
      if (
        await proceedingFileTypePropertyValueIsEmployeeArea(
          Number(proceedingFileTypePropertyValueId)
        )
      ) {
        const allowed = await ensureSecondaryPermission(
          ctx,
          EMPLOYEES_PROCEEDING_FILE_EMPLOYEE_AREA_WRITE_PERMISSION
        )
        if (!allowed) {
          return
        }
      }
      const proceedingFileTypePropertyValueService = new ProceedingFileTypePropertyValueService()
      await request.validateUsing(updateProceedingFileTypePropertyValueValidator)
      const validationOptions = {
        types: ['image', 'document', 'text', 'application', 'archive'],
        size: '',
      }
      const file = request.file('proceedingFileTypePropertyValueValueFile', validationOptions)
      if (!proceedingFileTypePropertyValueValue && !file) {
        response.status(400)
        return {
          type: 'warning',
          title: 'Missing data to process',
          message: 'The proceeding file type property value value was not found',
          data: { ...proceedingFileTypePropertyValue },
        }
      }
      if (file) {
        const fileName = `${new Date().getTime()}_${file.clientName}`
        const uploadService = new UploadService()
        const fileUrl = await uploadService.fileUpload(
          file,
          'proceeding-file-type-property-values',
          fileName
        )
        if (currentProceedingFileTypePropertyValue.proceedingFileTypePropertyValueValue) {
          const fileNameWithExt = decodeURIComponent(
            path.basename(
              currentProceedingFileTypePropertyValue.proceedingFileTypePropertyValueValue
            )
          )
          const fileKey = `${Env.get('AWS_ROOT_PATH')}/proceeding-file-type-property-values/${fileNameWithExt}`
          await uploadService.deleteFile(fileKey)
        }
        proceedingFileTypePropertyValue.proceedingFileTypePropertyValueValue = fileUrl
      }
      const updateProceedingFileTypePropertyValue =
        await proceedingFileTypePropertyValueService.update(
          currentProceedingFileTypePropertyValue,
          proceedingFileTypePropertyValue
        )
      if (updateProceedingFileTypePropertyValue) {
        response.status(201)
        return {
          type: 'success',
          title: 'Proceeding file type property values',
          message: 'The proceeding file type property value was updated successfully',
          data: { proceedingFileTypePropertyValue: updateProceedingFileTypePropertyValue },
        }
      }
    } catch (error) {
      return unexpectedErrorResponse(error, response)
    }
  }

  /**
   * @swagger
   * /api/proceeding-file-type-property-values/{proceedingFileTypePropertyValueId}:
   *   delete:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Proceeding File Type Property Values
   *     summary: delete proceeding file type property value
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: proceedingFileTypePropertyValueId
   *         schema:
   *           type: number
   *         description: Proceeding file type property value id
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
    const { auth, request, response, businessUnitScope } = ctx
    try {
      const proceedingFileTypePropertyValueId = request.param('proceedingFileTypePropertyValueId')
      if (!proceedingFileTypePropertyValueId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'The proceeding file type property value Id was not found',
          message: 'Missing data to process',
          data: { proceedingFileTypePropertyValueId },
        }
      }
      const currentProceedingFileTypePropertyValue = await ProceedingFileTypePropertyValue.query()
        .whereNull('proceeding_file_type_property_value_deleted_at')
        .where('proceeding_file_type_property_value_id', proceedingFileTypePropertyValueId)
        .first()
      if (!currentProceedingFileTypePropertyValue) {
        await ScopeDeniedLogService.log({
          domain: 'proceeding_file_type_property_value',
          action: 'delete',
          requestedId: proceedingFileTypePropertyValueId,
          actorUserId: auth.user?.userId ?? null,
          businessUnitScope,
        })
        return notFoundOrOutOfScopeResponse(response)
      }
      if (
        await proceedingFileTypePropertyValueIsEmployeeArea(
          Number(proceedingFileTypePropertyValueId)
        )
      ) {
        const allowed = await ensureSecondaryPermission(
          ctx,
          EMPLOYEES_PROCEEDING_FILE_EMPLOYEE_AREA_DELETE_PERMISSION
        )
        if (!allowed) {
          return
        }
      }
      const proceedingFileTypePropertyValueService = new ProceedingFileTypePropertyValueService()
      const deleteProceedingFileTypePropertyValue =
        await proceedingFileTypePropertyValueService.delete(currentProceedingFileTypePropertyValue)
      if (deleteProceedingFileTypePropertyValue) {
        response.status(200)
        return {
          type: 'success',
          title: 'Proceeding file type property values',
          message: 'The proceeding file type property value was deleted successfully',
          data: { proceedingFileTypePropertyValue: deleteProceedingFileTypePropertyValue },
        }
      }
    } catch (error) {
      return unexpectedErrorResponse(error, response)
    }
  }

  /**
   * @swagger
   * /api/proceeding-file-type-property-values/{proceedingFileTypePropertyValueId}:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Proceeding File Type Property Values
   *     summary: get proceeding file type property value by id
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: proceedingFileTypePropertyValueId
   *         schema:
   *           type: number
   *         description: Proceeding file type property value id
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
  async show(ctx: HttpContext) {
    const { auth, request, response, businessUnitScope } = ctx
    try {
      const proceedingFileTypePropertyValueId = request.param('proceedingFileTypePropertyValueId')
      if (!proceedingFileTypePropertyValueId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'Missing data to process',
          message: 'The proceeding file type property value Id was not found',
          data: { proceedingFileTypePropertyValueId },
        }
      }
      if (
        await proceedingFileTypePropertyValueIsEmployeeArea(
          Number(proceedingFileTypePropertyValueId)
        )
      ) {
        const allowed = await ensureSecondaryPermission(
          ctx,
          EMPLOYEES_PROCEEDING_FILE_EMPLOYEE_AREA_READ_PERMISSION
        )
        if (!allowed) {
          return
        }
      }
      const proceedingFileTypePropertyValueService = new ProceedingFileTypePropertyValueService()
      const showProceedingFileTypePropertyValue = await proceedingFileTypePropertyValueService.show(
        proceedingFileTypePropertyValueId
      )
      if (!showProceedingFileTypePropertyValue) {
        await ScopeDeniedLogService.log({
          domain: 'proceeding_file_type_property_value',
          action: 'show',
          requestedId: proceedingFileTypePropertyValueId,
          actorUserId: auth.user?.userId ?? null,
          businessUnitScope,
        })
        return notFoundOrOutOfScopeResponse(response)
      }
      response.status(200)
      return {
        type: 'success',
        title: 'Proceeding file type property values',
        message: 'The proceeding file type property value was found successfully',
        data: { proceedingFileTypePropertyValue: showProceedingFileTypePropertyValue },
      }
    } catch (error) {
      return unexpectedErrorResponse(error, response)
    }
  }
}
