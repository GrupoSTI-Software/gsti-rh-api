import { HttpContext } from '@adonisjs/core/http'
import { isFileIntakeError } from '#helpers/file_intake_api_error'
import SystemSetting from '#models/system_setting'
import SystemSettingTradeName from '#models/system_setting_trade_name'
import SystemSettingTradeNameService from '#services/system_setting_trade_name_service'
import UploadService from '#services/upload_service'
import Env from '#start/env'
import path from 'node:path'
import fs from 'node:fs'
import sharp from 'sharp'
import { SYSTEM_SETTING_ERROR_CODES } from '../constants/system_setting_error_codes.js'
import {
  createSystemSettingTradeNameValidator,
  updateSystemSettingTradeNameValidator,
} from '#validators/system_setting_trade_name'

export default class SystemSettingTradeNameController {
  /**
   * Valida que la imagen sea PNG, 512x512px y sin transparencia (mismo criterio que system setting).
   */
  private async validateEmployeeApplicationIcon(
    file: any
  ): Promise<{ valid: boolean; errorCode?: string; message?: string }> {
    try {
      if (!file || !file.tmpPath) {
        return {
          valid: false,
          errorCode: SYSTEM_SETTING_ERROR_CODES.FILE_NOT_FOUND.code,
          message: SYSTEM_SETTING_ERROR_CODES.FILE_NOT_FOUND.message,
        }
      }

      const MAX_FILE_SIZE = 5 * 1024 * 1024
      if (file.size && file.size > MAX_FILE_SIZE) {
        return {
          valid: false,
          errorCode: SYSTEM_SETTING_ERROR_CODES.FILE_TOO_LARGE.code,
          message: SYSTEM_SETTING_ERROR_CODES.FILE_TOO_LARGE.message,
        }
      }

      if (file.extname !== 'png') {
        return {
          valid: false,
          errorCode: SYSTEM_SETTING_ERROR_CODES.INVALID_FILE_EXTENSION.code,
          message: SYSTEM_SETTING_ERROR_CODES.INVALID_FILE_EXTENSION.message,
        }
      }

      let imageBuffer: Buffer
      try {
        imageBuffer = fs.readFileSync(file.tmpPath)
      } catch {
        return {
          valid: false,
          errorCode: SYSTEM_SETTING_ERROR_CODES.IMAGE_READ_ERROR.code,
          message: SYSTEM_SETTING_ERROR_CODES.IMAGE_READ_ERROR.message,
        }
      }

      let metadata: sharp.Metadata
      try {
        metadata = await sharp(imageBuffer).metadata()
      } catch {
        return {
          valid: false,
          errorCode: SYSTEM_SETTING_ERROR_CODES.IMAGE_READ_ERROR.code,
          message: SYSTEM_SETTING_ERROR_CODES.IMAGE_READ_ERROR.message,
        }
      }

      if (!metadata.width || !metadata.height) {
        return {
          valid: false,
          errorCode: SYSTEM_SETTING_ERROR_CODES.DIMENSIONS_READ_ERROR.code,
          message: SYSTEM_SETTING_ERROR_CODES.DIMENSIONS_READ_ERROR.message,
        }
      }

      if (metadata.width !== 512 || metadata.height !== 512) {
        return {
          valid: false,
          errorCode: SYSTEM_SETTING_ERROR_CODES.INVALID_RESOLUTION.code,
          message: SYSTEM_SETTING_ERROR_CODES.INVALID_RESOLUTION.message,
        }
      }

      const image = sharp(imageBuffer)
      let stats: sharp.Stats
      try {
        stats = await image.stats()
      } catch {
        return {
          valid: false,
          errorCode: SYSTEM_SETTING_ERROR_CODES.IMAGE_READ_ERROR.code,
          message: SYSTEM_SETTING_ERROR_CODES.IMAGE_READ_ERROR.message,
        }
      }

      if (stats.channels.length === 4) {
        const alphaChannel = stats.channels[3]
        if (alphaChannel && alphaChannel.min < 255) {
          return {
            valid: false,
            errorCode: SYSTEM_SETTING_ERROR_CODES.INVALID_FORMAT_TRANSPARENCY.code,
            message: SYSTEM_SETTING_ERROR_CODES.INVALID_FORMAT_TRANSPARENCY.message,
          }
        }
      }

      let data: Buffer
      let info: sharp.OutputInfo
      try {
        const result = await image.raw().toBuffer({ resolveWithObject: true })
        data = result.data
        info = result.info
      } catch {
        return {
          valid: false,
          errorCode: SYSTEM_SETTING_ERROR_CODES.IMAGE_READ_ERROR.code,
          message: SYSTEM_SETTING_ERROR_CODES.IMAGE_READ_ERROR.message,
        }
      }

      if (info.channels === 4) {
        for (let i = 3; i < data.length; i += 4) {
          if (data[i] < 255) {
            return {
              valid: false,
              errorCode: SYSTEM_SETTING_ERROR_CODES.INVALID_FORMAT_TRANSPARENCY.code,
              message: SYSTEM_SETTING_ERROR_CODES.INVALID_FORMAT_TRANSPARENCY.message,
            }
          }
        }
      }

      return { valid: true }
    } catch {
      return {
        valid: false,
        errorCode: SYSTEM_SETTING_ERROR_CODES.IMAGE_READ_ERROR.code,
        message: SYSTEM_SETTING_ERROR_CODES.IMAGE_READ_ERROR.message,
      }
    }
  }

  /**
   * @swagger
   * /api/system-setting-trade-names:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - System Setting Trade Names
   *     summary: Listar razones sociales por system setting
   *     parameters:
   *       - in: query
   *         name: systemSettingId
   *         required: true
   *         schema:
   *           type: integer
   *         description: ID del system setting padre
   *     responses:
   *       '200':
   *         description: Recurso procesado correctamente
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                 title:
   *                   type: string
   *                 message:
   *                   type: string
   *                 data:
   *                   type: object
   *       '400':
   *         description: Faltan datos o parámetros inválidos
   *       '401':
   *         description: No autenticado
   *       default:
   *         description: Error inesperado
   */
  async index({ request, response }: HttpContext) {
    try {
      const systemSettingId = request.input('systemSettingId')
      if (!systemSettingId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'Faltan datos',
          message: 'Se requiere systemSettingId en la consulta',
          data: {},
        }
      }
      const service = new SystemSettingTradeNameService()
      const systemSettingTradeNames = await service.index(Number(systemSettingId))
      response.status(200)
      return {
        type: 'success',
        title: 'Razones sociales',
        message: 'Registros obtenidos correctamente',
        data: systemSettingTradeNames,
      }
    } catch (error: any) {
      response.status(500)
      return {
        type: 'error',
        title: 'Error del servidor',
        message: 'Ocurrió un error inesperado en el servidor',
        error: error.message,
      }
    }
  }

  /**
   * @swagger
   * /api/system-setting-trade-names:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - System Setting Trade Names
   *     summary: Crear razón social (referencia de system setting)
   *     requestBody:
   *       required: true
   *       content:
   *         multipart/form-data:
   *           schema:
   *             type: object
   *             required:
   *               - systemSettingId
   *               - systemSettingTradeName
   *               - systemSettingSidebarColor
   *             properties:
   *               systemSettingId:
   *                 type: integer
   *                 description: ID del system setting padre
   *               systemSettingTradeName:
   *                 type: string
   *                 maxLength: 150
   *                 description: Razón social
   *               systemSettingSidebarColor:
   *                 type: string
   *                 maxLength: 25
   *                 description: Color de la barra lateral
   *               systemSettingLogo:
   *                 type: string
   *                 format: binary
   *                 description: Logo (svg, png o webp)
   *               systemSettingBanner:
   *                 type: string
   *                 format: binary
   *                 description: Banner (svg, png o webp)
   *               systemSettingFavicon:
   *                 type: string
   *                 format: binary
   *                 description: Favicon (svg, png o webp)
   *               systemSettingEmployeeAplicationIcon:
   *                 type: string
   *                 format: binary
   *                 description: Ícono app empleado (PNG 512x512, sin transparencia)
   *     responses:
   *       '201':
   *         description: Registro creado
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                 title:
   *                   type: string
   *                 message:
   *                   type: string
   *                 data:
   *                   type: object
   *       '400':
   *         description: Validación o archivo inválido
   *       '404':
   *         description: System setting no encontrado
   *       '401':
   *         description: No autenticado
   *       '500':
   *         description: Error del servidor
   *       default:
   *         description: Error inesperado
   */
  async store({ request, response }: HttpContext) {
    try {
      const data = await request.validateUsing(createSystemSettingTradeNameValidator)

      const parent = await SystemSetting.query()
        .whereNull('system_setting_deleted_at')
        .where('system_setting_id', data.systemSettingId)
        .first()

      if (!parent) {
        response.status(404)
        return {
          type: 'warning',
          title: 'System setting no encontrado',
          message: 'No existe un system setting con el ID indicado',
          data: { systemSettingId: data.systemSettingId },
        }
      }

      const payload = {
        systemSettingId: data.systemSettingId,
        systemSettingTradeName: data.systemSettingTradeName,
        systemSettingSidebarColor: data.systemSettingSidebarColor,
      } as SystemSettingTradeName

      const service = new SystemSettingTradeNameService()
      const valid = await service.verifyInfo(payload)
      if (valid.status !== 200) {
        response.status(valid.status)
        return {
          type: valid.type,
          title: valid.title,
          message: valid.message,
          data: { ...data },
        }
      }

      const validationOptions = {
        types: ['image'] as const,
        size: '',
      }

      const systemSettingLogo = request.file('systemSettingLogo', validationOptions)
      if (systemSettingLogo) {
        const allowedExtensions = ['svg', 'png', 'webp', 'jpg', 'jpeg']
        if (!allowedExtensions.includes(systemSettingLogo.extname ? systemSettingLogo.extname : '')) {
          response.status(400)
          return {
            status: 400,
            type: 'warning',
            title: 'Datos inválidos',
            message: 'Sube una imagen válida para el logo',
            data: systemSettingLogo,
          }
        }
        const uploadService = new UploadService()
        const fileUrl = await uploadService.fileUpload(systemSettingLogo, 'branding-asset', 'system-settings')
        payload.systemSettingLogo = fileUrl
      }

      const systemSettingBanner = request.file('systemSettingBanner', validationOptions)
      if (systemSettingBanner) {
        const allowedExtensions = ['svg', 'png', 'webp', 'jpg', 'jpeg']
        if (
          !allowedExtensions.includes(systemSettingBanner.extname ? systemSettingBanner.extname : '')
        ) {
          response.status(400)
          return {
            status: 400,
            type: 'warning',
            title: 'Datos inválidos',
            message: 'Sube una imagen válida para el banner',
            data: systemSettingBanner,
          }
        }
        const uploadService = new UploadService()
        const fileUrl = await uploadService.fileUpload(systemSettingBanner, 'branding-asset', 'system-settings')
        payload.systemSettingBanner = fileUrl
      }

      const systemSettingFavicon = request.file('systemSettingFavicon', validationOptions)
      if (systemSettingFavicon) {
        const allowedExtensions = ['svg', 'png', 'webp', 'jpg', 'jpeg']
        if (
          !allowedExtensions.includes(systemSettingFavicon.extname ? systemSettingFavicon.extname : '')
        ) {
          response.status(400)
          return {
            status: 400,
            type: 'warning',
            title: 'Datos inválidos',
            message: 'Sube una imagen válida para el favicon',
            data: systemSettingFavicon,
          }
        }
        const uploadService = new UploadService()
        const fileUrl = await uploadService.fileUpload(systemSettingFavicon, 'branding-asset', 'system-settings')
        payload.systemSettingFavicon = fileUrl
      }

      const systemSettingEmployeeAplicationIcon = request.file(
        'systemSettingEmployeeAplicationIcon',
        validationOptions
      )
      if (systemSettingEmployeeAplicationIcon) {
        const validation = await this.validateEmployeeApplicationIcon(systemSettingEmployeeAplicationIcon)
        if (!validation.valid) {
          response.status(400)
          return {
            status: 400,
            type: 'warning',
            title: 'Imagen inválida',
            message: validation.message || 'Sube una imagen válida',
            errorCode: validation.errorCode,
            data: {},
          }
        }
        const uploadService = new UploadService()
        const fileUrl = await uploadService.fileUpload(systemSettingEmployeeAplicationIcon, 'branding-asset', 'system-settings')
        if (fileUrl === 'S3Producer.fileUpload' || fileUrl === 'file_not_found') {
          response.status(500)
          return {
            status: 500,
            type: 'error',
            title: 'Error de carga',
            message: SYSTEM_SETTING_ERROR_CODES.UPLOAD_ERROR.message,
            errorCode: SYSTEM_SETTING_ERROR_CODES.UPLOAD_ERROR.code,
            data: {},
          }
        }
        payload.systemSettingEmployeeAplicationIcon = fileUrl
      }

      const created = await service.create(payload)
      response.status(201)
      return {
        type: 'success',
        title: 'Razón social',
        message: 'El registro se creó correctamente',
        data: { systemSettingTradeName: created },
      }
    } catch (error: any) {
      // Un rechazo de la entrada de archivos es 422 con triplete, no un fallo del
      // servidor: se relanza para que lo formatee el handler global.
      if (isFileIntakeError(error)) throw error

      const messageError =
        error.code === 'E_VALIDATION_ERROR' ? error.messages[0].message : error.message
      response.status(500)
      return {
        type: 'error',
        title: 'Error del servidor',
        message: 'Ocurrió un error inesperado en el servidor',
        error: messageError,
      }
    }
  }

  /**
   * @swagger
   * /api/system-setting-trade-names/{systemSettingTradeNameId}:
   *   put:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - System Setting Trade Names
   *     summary: Actualizar razón social
   *     parameters:
   *       - in: path
   *         name: systemSettingTradeNameId
   *         required: true
   *         schema:
   *           type: integer
   *         description: ID del registro de razón social
   *     requestBody:
   *       required: true
   *       content:
   *         multipart/form-data:
   *           schema:
   *             type: object
   *             required:
   *               - systemSettingTradeName
   *               - systemSettingSidebarColor
   *             properties:
   *               systemSettingTradeName:
   *                 type: string
   *                 maxLength: 150
   *               systemSettingSidebarColor:
   *                 type: string
   *                 maxLength: 25
   *               systemSettingLogo:
   *                 type: string
   *                 format: binary
   *               systemSettingBanner:
   *                 type: string
   *                 format: binary
   *               systemSettingFavicon:
   *                 type: string
   *                 format: binary
   *               systemSettingEmployeeAplicationIcon:
   *                 type: string
   *                 format: binary
   *                 description: PNG 512x512, sin transparencia
   *     responses:
   *       '200':
   *         description: Registro actualizado
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                 title:
   *                   type: string
   *                 message:
   *                   type: string
   *                 data:
   *                   type: object
   *       '400':
   *         description: Validación o archivo inválido
   *       '404':
   *         description: Registro no encontrado
   *       '401':
   *         description: No autenticado
   *       '500':
   *         description: Error del servidor
   *       default:
   *         description: Error inesperado
   */
  async update({ request, response }: HttpContext) {
    try {
      const systemSettingTradeNameId = request.param('systemSettingTradeNameId')
      if (!systemSettingTradeNameId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'Faltan datos',
          message: 'No se recibió systemSettingTradeNameId',
          data: {},
        }
      }

      const current = await SystemSettingTradeName.query()
        .whereNull('system_setting_deleted_at')
        .where('system_setting_trade_name_id', systemSettingTradeNameId)
        .first()

      if (!current) {
        response.status(404)
        return {
          type: 'warning',
          title: 'Registro no encontrado',
          message: 'No existe la razón social con el ID indicado',
          data: { systemSettingTradeNameId },
        }
      }

      const data = await request.validateUsing(updateSystemSettingTradeNameValidator)

      const payload = {
        systemSettingTradeNameId: current.systemSettingTradeNameId,
        systemSettingId: current.systemSettingId,
        systemSettingTradeName: data.systemSettingTradeName,
        systemSettingSidebarColor: data.systemSettingSidebarColor,
        systemSettingLogo: current.systemSettingLogo,
        systemSettingBanner: current.systemSettingBanner,
        systemSettingFavicon: current.systemSettingFavicon,
        systemSettingEmployeeAplicationIcon: current.systemSettingEmployeeAplicationIcon,
      } as SystemSettingTradeName

      const service = new SystemSettingTradeNameService()
      const valid = await service.verifyInfo(payload)
      if (valid.status !== 200) {
        response.status(valid.status)
        return {
          type: valid.type,
          title: valid.title,
          message: valid.message,
          data: { ...data },
        }
      }

      const validationOptions = {
        types: ['image'] as const,
        size: '',
      }

      const systemSettingLogo = request.file('systemSettingLogo', validationOptions)
      if (systemSettingLogo) {
        const allowedExtensions = ['svg', 'png', 'webp', 'jpg', 'jpeg']
        if (!allowedExtensions.includes(systemSettingLogo.extname ? systemSettingLogo.extname : '')) {
          response.status(400)
          return {
            status: 400,
            type: 'warning',
            title: 'Datos inválidos',
            message: 'Sube una imagen válida para el logo',
            data: systemSettingLogo,
          }
        }
        const uploadService = new UploadService()
        if (current.systemSettingLogo) {
          const fileNameWithExt = path.basename(current.systemSettingLogo)
          const fileKey = `${Env.get('AWS_ROOT_PATH')}/system-settings/${fileNameWithExt}`
          await uploadService.deleteFile(fileKey)
        }
        const fileUrl = await uploadService.fileUpload(systemSettingLogo, 'branding-asset', 'system-settings')
        payload.systemSettingLogo = fileUrl
      }

      const systemSettingBanner = request.file('systemSettingBanner', validationOptions)
      if (systemSettingBanner) {
        const allowedExtensions = ['svg', 'png', 'webp', 'jpg', 'jpeg']
        if (
          !allowedExtensions.includes(systemSettingBanner.extname ? systemSettingBanner.extname : '')
        ) {
          response.status(400)
          return {
            status: 400,
            type: 'warning',
            title: 'Datos inválidos',
            message: 'Sube una imagen válida para el banner',
            data: systemSettingBanner,
          }
        }
        const uploadService = new UploadService()
        if (current.systemSettingBanner) {
          const fileNameWithExt = path.basename(current.systemSettingBanner)
          const fileKey = `${Env.get('AWS_ROOT_PATH')}/system-settings/${fileNameWithExt}`
          await uploadService.deleteFile(fileKey)
        }
        const fileUrl = await uploadService.fileUpload(systemSettingBanner, 'branding-asset', 'system-settings')
        payload.systemSettingBanner = fileUrl
      }

      const systemSettingFavicon = request.file('systemSettingFavicon', validationOptions)
      if (systemSettingFavicon) {
        const allowedExtensions = ['svg', 'png', 'webp', 'jpg', 'jpeg']
        if (
          !allowedExtensions.includes(systemSettingFavicon.extname ? systemSettingFavicon.extname : '')
        ) {
          response.status(400)
          return {
            status: 400,
            type: 'warning',
            title: 'Datos inválidos',
            message: 'Sube una imagen válida para el favicon',
            data: systemSettingFavicon,
          }
        }
        const uploadService = new UploadService()
        if (current.systemSettingFavicon) {
          const fileNameWithExt = path.basename(current.systemSettingFavicon)
          const fileKey = `${Env.get('AWS_ROOT_PATH')}/system-settings/${fileNameWithExt}`
          await uploadService.deleteFile(fileKey)
        }
        const fileUrl = await uploadService.fileUpload(systemSettingFavicon, 'branding-asset', 'system-settings')
        payload.systemSettingFavicon = fileUrl
      }

      const systemSettingEmployeeAplicationIcon = request.file(
        'systemSettingEmployeeAplicationIcon',
        validationOptions
      )
      if (systemSettingEmployeeAplicationIcon) {
        const validation = await this.validateEmployeeApplicationIcon(systemSettingEmployeeAplicationIcon)
        if (!validation.valid) {
          response.status(400)
          return {
            status: 400,
            type: 'warning',
            title: 'Imagen inválida',
            message: validation.message || 'Sube una imagen válida',
            errorCode: validation.errorCode,
            data: {},
          }
        }
        const uploadService = new UploadService()
        if (current.systemSettingEmployeeAplicationIcon) {
          const fileNameWithExt = path.basename(current.systemSettingEmployeeAplicationIcon)
          const fileKey = `${Env.get('AWS_ROOT_PATH')}/system-settings/${fileNameWithExt}`
          const deleteResult = await uploadService.deleteFile(fileKey)
          if (deleteResult.status !== 200 && deleteResult.status !== 404) {
            response.status(500)
            return {
              status: 500,
              type: 'error',
              title: 'Error al eliminar archivo',
              message: SYSTEM_SETTING_ERROR_CODES.DELETE_ERROR.message,
              errorCode: SYSTEM_SETTING_ERROR_CODES.DELETE_ERROR.code,
              data: {},
            }
          }
        }
        const fileUrl = await uploadService.fileUpload(systemSettingEmployeeAplicationIcon, 'branding-asset', 'system-settings')
        if (fileUrl === 'S3Producer.fileUpload' || fileUrl === 'file_not_found') {
          response.status(500)
          return {
            status: 500,
            type: 'error',
            title: 'Error de carga',
            message: SYSTEM_SETTING_ERROR_CODES.UPLOAD_ERROR.message,
            errorCode: SYSTEM_SETTING_ERROR_CODES.UPLOAD_ERROR.code,
            data: {},
          }
        }
        payload.systemSettingEmployeeAplicationIcon = fileUrl
      }

      const updated = await service.update(current, payload)
      response.status(200)
      return {
        type: 'success',
        title: 'Razón social',
        message: 'El registro se actualizó correctamente',
        data: { systemSettingTradeName: updated },
      }
    } catch (error: any) {
      // Un rechazo de la entrada de archivos es 422 con triplete, no un fallo del
      // servidor: se relanza para que lo formatee el handler global.
      if (isFileIntakeError(error)) throw error

      const messageError =
        error.code === 'E_VALIDATION_ERROR' ? error.messages[0].message : error.message
      response.status(500)
      return {
        type: 'error',
        title: 'Error del servidor',
        message: 'Ocurrió un error inesperado en el servidor',
        error: messageError,
      }
    }
  }

  /**
   * @swagger
   * /api/system-setting-trade-names/{systemSettingTradeNameId}:
   *   delete:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - System Setting Trade Names
   *     summary: Eliminar (lógico) razón social
   *     parameters:
   *       - in: path
   *         name: systemSettingTradeNameId
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       '200':
   *         description: Registro eliminado
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                 title:
   *                   type: string
   *                 message:
   *                   type: string
   *                 data:
   *                   type: object
   *       '400':
   *         description: Falta el ID
   *       '404':
   *         description: Registro no encontrado
   *       '401':
   *         description: No autenticado
   *       '500':
   *         description: Error del servidor
   *       default:
   *         description: Error inesperado
   */
  async delete({ request, response }: HttpContext) {
    try {
      const systemSettingTradeNameId = request.param('systemSettingTradeNameId')
      if (!systemSettingTradeNameId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'Faltan datos',
          message: 'No se recibió systemSettingTradeNameId',
          data: {},
        }
      }

      const current = await SystemSettingTradeName.query()
        .whereNull('system_setting_deleted_at')
        .where('system_setting_trade_name_id', systemSettingTradeNameId)
        .first()

      if (!current) {
        response.status(404)
        return {
          type: 'warning',
          title: 'Registro no encontrado',
          message: 'No existe la razón social con el ID indicado',
          data: { systemSettingTradeNameId },
        }
      }

      const service = new SystemSettingTradeNameService()
      const deleted = await service.delete(current)
      response.status(200)
      return {
        type: 'success',
        title: 'Razón social',
        message: 'El registro se eliminó correctamente',
        data: { systemSettingTradeName: deleted },
      }
    } catch (error: any) {
      const messageError =
        error.code === 'E_VALIDATION_ERROR' ? error.messages[0].message : error.message
      response.status(500)
      return {
        type: 'error',
        title: 'Error del servidor',
        message: 'Ocurrió un error inesperado en el servidor',
        error: messageError,
      }
    }
  }

  /**
   * @swagger
   * /api/system-setting-trade-names/{systemSettingTradeNameId}:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - System Setting Trade Names
   *     summary: Obtener una razón social por ID
   *     parameters:
   *       - in: path
   *         name: systemSettingTradeNameId
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       '200':
   *         description: Registro encontrado
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                 title:
   *                   type: string
   *                 message:
   *                   type: string
   *                 data:
   *                   type: object
   *       '400':
   *         description: Falta el ID
   *       '404':
   *         description: Registro no encontrado
   *       '401':
   *         description: No autenticado
   *       '500':
   *         description: Error del servidor
   *       default:
   *         description: Error inesperado
   */
  async show({ request, response }: HttpContext) {
    try {
      const systemSettingTradeNameId = request.param('systemSettingTradeNameId')
      if (!systemSettingTradeNameId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'Faltan datos',
          message: 'No se recibió systemSettingTradeNameId',
          data: {},
        }
      }

      const service = new SystemSettingTradeNameService()
      const row = await service.show(Number(systemSettingTradeNameId))
      if (!row) {
        response.status(404)
        return {
          type: 'warning',
          title: 'Registro no encontrado',
          message: 'No existe la razón social con el ID indicado',
          data: { systemSettingTradeNameId },
        }
      }

      response.status(200)
      return {
        type: 'success',
        title: 'Razón social',
        message: 'Registro obtenido correctamente',
        data: { systemSettingTradeName: row },
      }
    } catch (error: any) {
      response.status(500)
      return {
        type: 'error',
        title: 'Error del servidor',
        message: 'Ocurrió un error inesperado en el servidor',
        error: error.message,
      }
    }
  }

  /**
   * @swagger
   * /api/system-setting-trade-names/{systemSettingTradeNameId}/employee-application-icon:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - System Setting Trade Names
   *     summary: Subir ícono de aplicación empleado (512x512 PNG)
   *     parameters:
   *       - in: path
   *         name: systemSettingTradeNameId
   *         required: true
   *         schema:
   *           type: integer
   *     requestBody:
   *       required: true
   *       content:
   *         multipart/form-data:
   *           schema:
   *             type: object
   *             required:
   *               - systemSettingEmployeeAplicationIcon
   *             properties:
   *               systemSettingEmployeeAplicationIcon:
   *                 type: string
   *                 format: binary
   *                 description: PNG 512x512, fondo opaco, sin transparencia
   *     responses:
   *       '200':
   *         description: Archivo subido correctamente
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                 title:
   *                   type: string
   *                 message:
   *                   type: string
   *                 data:
   *                   type: object
   *                   properties:
   *                     fileUrl:
   *                       type: string
   *                     systemSettingTradeName:
   *                       type: object
   *       '400':
   *         description: Archivo ausente o inválido
   *       '404':
   *         description: Registro no encontrado
   *       '401':
   *         description: No autenticado
   *       '500':
   *         description: Error de carga o al eliminar archivo previo
   *       default:
   *         description: Error inesperado
   */
  async uploadEmployeeApplicationIcon({ request, response }: HttpContext) {
    try {
      const systemSettingTradeNameId = request.param('systemSettingTradeNameId')
      if (!systemSettingTradeNameId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'Faltan datos',
          message: 'No se recibió systemSettingTradeNameId',
          data: {},
        }
      }

      const current = await SystemSettingTradeName.query()
        .whereNull('system_setting_deleted_at')
        .where('system_setting_trade_name_id', systemSettingTradeNameId)
        .first()

      if (!current) {
        response.status(404)
        return {
          type: 'warning',
          title: 'Registro no encontrado',
          message: 'No existe la razón social con el ID indicado',
          data: { systemSettingTradeNameId },
        }
      }

      const validationOptions = {
        types: ['image'] as const,
        size: '5mb',
      }

      const systemSettingEmployeeAplicationIcon = request.file(
        'systemSettingEmployeeAplicationIcon',
        validationOptions
      )

      if (!systemSettingEmployeeAplicationIcon) {
        response.status(400)
        return {
          status: 400,
          type: 'warning',
          title: 'Imagen inválida',
          message: SYSTEM_SETTING_ERROR_CODES.FILE_NOT_FOUND.message,
          errorCode: SYSTEM_SETTING_ERROR_CODES.FILE_NOT_FOUND.code,
          data: {},
        }
      }

      const validation = await this.validateEmployeeApplicationIcon(systemSettingEmployeeAplicationIcon)
      if (!validation.valid) {
        response.status(400)
        return {
          status: 400,
          type: 'warning',
          title: 'Imagen inválida',
          message: validation.message || 'Sube una imagen válida',
          errorCode: validation.errorCode,
          data: {},
        }
      }

      const uploadService = new UploadService()

      if (current.systemSettingEmployeeAplicationIcon) {
        const fileNameWithExt = path.basename(current.systemSettingEmployeeAplicationIcon)
        const fileKey = `${Env.get('AWS_ROOT_PATH')}/system-settings/${fileNameWithExt}`
        const deleteResult = await uploadService.deleteFile(fileKey)
        if (deleteResult.status !== 200 && deleteResult.status !== 404) {
          response.status(500)
          return {
            status: 500,
            type: 'error',
            title: 'Error al eliminar archivo',
            message: SYSTEM_SETTING_ERROR_CODES.DELETE_ERROR.message,
            errorCode: SYSTEM_SETTING_ERROR_CODES.DELETE_ERROR.code,
            data: {},
          }
        }
      }

      const fileUrl = await uploadService.fileUpload(systemSettingEmployeeAplicationIcon, 'branding-asset', 'system-settings')

      if (fileUrl === 'S3Producer.fileUpload' || fileUrl === 'file_not_found') {
        response.status(500)
        return {
          status: 500,
          type: 'error',
          title: 'Error de carga',
          message: SYSTEM_SETTING_ERROR_CODES.UPLOAD_ERROR.message,
          errorCode: SYSTEM_SETTING_ERROR_CODES.UPLOAD_ERROR.code,
          data: {},
        }
      }

      current.systemSettingEmployeeAplicationIcon = fileUrl
      await current.save()

      response.status(200)
      return {
        type: 'success',
        title: 'Razón social',
        message: 'El ícono de la aplicación empleado se subió correctamente',
        data: {
          fileUrl,
          systemSettingTradeName: current,
        },
      }
    } catch (error: any) {
      // Un rechazo de la entrada de archivos es 422 con triplete, no un fallo del
      // servidor: se relanza para que lo formatee el handler global.
      if (isFileIntakeError(error)) throw error

      const messageError =
        error.code === 'E_VALIDATION_ERROR' ? error.messages[0].message : error.message
      response.status(500)
      return {
        type: 'error',
        title: 'Error del servidor',
        message: 'Ocurrió un error inesperado en el servidor',
        error: messageError,
      }
    }
  }
}
