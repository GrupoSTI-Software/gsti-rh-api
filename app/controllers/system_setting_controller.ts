import { HttpContext } from '@adonisjs/core/http'
import BusinessUnit from '#models/business_unit'
import SystemSetting from '#models/system_setting'
import SystemSettingProceedingFile from '#models/system_setting_proceeding_file'
import SystemSettingService from '#services/system_setting_service'
import { createSystemSettingValidator } from '#validators/system_setting'
import UploadService from '#services/upload_service'
import path from 'node:path'
import Env from '#start/env'
import sharp from 'sharp'
import fs from 'node:fs'
import { SYSTEM_SETTING_ERROR_CODES } from '../constants/system_setting_error_codes.js'
import SystemSettingProceedingFileService from '#services/system_setting_proceeding_file_service'
import { DateTime } from 'luxon'
import {
  createSystemSettingProceedingFileValidator,
  updateSystemSettingProceedingFileValidator,
} from '#validators/system_setting_proceeding_file'
import BusinessAccessScopeService from '#services/business_access_scope_service'
import { SystemSettingResolutionError } from '../exceptions/system_setting_resolution_error.js'
import { resolveSystemSettingApiError } from '../helpers/resolve_system_setting_api_error.js'

export default class SystemSettingController {
  /**
   * Validates that an image is PNG, 512x512px, and has no transparency
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

      const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB in bytes
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
      } catch (error: any) {
        return {
          valid: false,
          errorCode: SYSTEM_SETTING_ERROR_CODES.IMAGE_READ_ERROR.code,
          message: SYSTEM_SETTING_ERROR_CODES.IMAGE_READ_ERROR.message,
        }
      }

      let metadata: sharp.Metadata
      try {
        metadata = await sharp(imageBuffer).metadata()
      } catch (error: any) {
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
      } catch (error: any) {
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
            errorCode:
              SYSTEM_SETTING_ERROR_CODES.INVALID_FORMAT_TRANSPARENCY.code,
            message:
              SYSTEM_SETTING_ERROR_CODES.INVALID_FORMAT_TRANSPARENCY.message,
          }
        }
      }

      let data: Buffer
      let info: sharp.OutputInfo
      try {
        const result = await image.raw().toBuffer({ resolveWithObject: true })
        data = result.data
        info = result.info
      } catch (error: any) {
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
              errorCode:
                SYSTEM_SETTING_ERROR_CODES.INVALID_FORMAT_TRANSPARENCY.code,
              message:
                SYSTEM_SETTING_ERROR_CODES.INVALID_FORMAT_TRANSPARENCY.message,
            }
          }
        }
      }

      return { valid: true }
    } catch (error: any) {
      return {
        valid: false,
        errorCode: SYSTEM_SETTING_ERROR_CODES.IMAGE_READ_ERROR.code,
        message: SYSTEM_SETTING_ERROR_CODES.IMAGE_READ_ERROR.message,
      }
    }
  }
  /**
   * @swagger
   * /api/system-settings:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - System Settings
   *     summary: get all
   *     parameters:
   *       - name: search
   *         in: query
   *         required: false
   *         description: Search
   *         schema:
   *           type: string
   *       - name: page
   *         in: query
   *         required: true
   *         description: The page number for pagination
   *         default: 1
   *         schema:
   *           type: integer
   *       - name: limit
   *         in: query
   *         required: true
   *         description: The number of records per page
   *         default: 100
   *         schema:
   *           type: integer
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
  async index({ response, businessUnitScope }: HttpContext) {
    try {
      // USRH1783712837584: filtra por `business_unit_id` (relación formal) en
      // vez de `FIND_IN_SET` sobre el CSV de slugs.
      const systemSettingService = new SystemSettingService()
      const systemSettings = await systemSettingService.index(businessUnitScope[0])
      response.status(200)
      return {
        type: 'success',
        title: 'System settings',
        message: 'The system setting were found successfully',
        data: {
          systemSettings,
        },
      }
    } catch (error) {
      response.status(500)
      return {
        type: 'error',
        title: 'Server Error',
        message: 'An unexpected error has occurred on the server',
        error: error.message,
      }
    }
  }

  /**
   * @swagger
   * /api/system-settings:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - System Settings
   *     summary: create new system setting
   *     produces:
   *       - application/json
   *     requestBody:
   *       content:
   *        multipart/form-data:
   *           schema:
   *             type: object
   *             properties:
   *               systemSettingLogo:
   *                 type: string
   *                 format: binary
   *                 description: System setting logo
   *                 required: false
   *               systemSettingBanner:
   *                 type: string
   *                 format: binary
   *                 description: System setting banner
   *                 required: false
 *               systemSettingFavicon:
 *                 type: string
 *                 format: binary
 *                 description: System setting favicon
 *                 required: false
 *               systemSettingEmployeeAplicationIcon:
 *                 type: string
 *                 format: binary
 *                 description: System setting employee application icon (512x512 PNG, white background, no transparency)
 *                 required: false
 *               systemSettingTradeName:
   *                 type: string
   *                 description: System setting trade name
   *                 required: true
   *                 default: ''
   *               systemSettingSidebarColor:
   *                 type: string
   *                 description: System setting sidebar color
   *                 required: true
   *                 default: ''
   *               systemSettingActive:
   *                 type: boolean
   *                 description: System setting status
   *                 required: false
   *                 default: true
   *               systemSettingToleranceCountPerAbsence:
   *                 type: number
   *                 description: System setting tolerance count per absence
   *                 required: false
   *               systemSettingRestrictFutureVacation:
   *                 type: boolean
   *                 description: System setting restrict future vacation
   *                 required: false
   *                 default: true
   *               systemSettingMaxAbsencesBeforeAttendanceLock:
   *                 type: number
   *                 description: System setting max absences before attendance lock
   *                 required: false
   *               systemSettingMaxLateArrivalsBeforeAttendanceLock:
   *                 type: number
   *                 description: System setting max late arrivals before attendance lock
   *                 required: false
   *               systemSettingPeriodAbsencesBeforeAttendanceLock:
   *                 type: string
   *                 description: System setting period absences before attendance lock
   *                 required: false
   *                 default: 'monthly'
   *               systemSettingPeriodLateArrivalsBeforeAttendanceLock:
   *                 type: string
   *                 description: System setting period late arrivals before attendance lock
   *                 required: false
   *                 default: 'monthly'
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
  async store({ request, response, businessUnitScope }: HttpContext) {
    try {
      const systemSettingTradeName = request.input('systemSettingTradeName')
      const systemSettingSidebarColor = request.input('systemSettingSidebarColor')
      const systemSettingActive = request.input('systemSettingActive')
      const systemSettingToleranceCountPerAbsence = request.input('systemSettingToleranceCountPerAbsence')
      const systemSettingRestrictFutureVacation = request.input('systemSettingRestrictFutureVacation')
      const systemSettingMaxAbsencesBeforeAttendanceLock = request.input('systemSettingMaxAbsencesBeforeAttendanceLock')
      const systemSettingMaxLateArrivalsBeforeAttendanceLock = request.input('systemSettingMaxLateArrivalsBeforeAttendanceLock')
      const systemSettingPeriodAbsencesBeforeAttendanceLock = request.input('systemSettingPeriodAbsencesBeforeAttendanceLock')
      const systemSettingPeriodLateArrivalsBeforeAttendanceLock = request.input('systemSettingPeriodLateArrivalsBeforeAttendanceLock')
      const systemSettingMonthlyConversionFactorRaw = request.input('systemSettingMonthlyConversionFactor')
      const parseNullable = (value: any) =>
        value === 'null' || value === undefined ? null : value
      const parseConversionFactor = (value: any): number => {
        const parsed = Number.parseFloat(value)
        return Number.isNaN(parsed) ? 30.4 : parsed
      }
      const systemSettingMonthlyConversionFactor = parseConversionFactor(systemSettingMonthlyConversionFactorRaw)
      if (
        systemSettingMonthlyConversionFactorRaw !== undefined &&
        systemSettingMonthlyConversionFactorRaw !== null &&
        (systemSettingMonthlyConversionFactor <= 0 || systemSettingMonthlyConversionFactor > 31)
      ) {
        response.status(400)
        return {
          type: 'warning',
          title: 'Invalid monthly conversion factor',
          message: 'The monthly conversion factor must be greater than 0 and less than or equal to 31',
          data: { systemSettingMonthlyConversionFactor: systemSettingMonthlyConversionFactorRaw },
        }
      }

      const systemSetting = {
        systemSettingTradeName: systemSettingTradeName,
        systemSettingSidebarColor: systemSettingSidebarColor,
        systemSettingActive:
          systemSettingActive && (systemSettingActive === 'true' || systemSettingActive === '1')
            ? 1
            : 0,
        systemSettingToleranceCountPerAbsence: systemSettingToleranceCountPerAbsence,
        systemSettingRestrictFutureVacation:
        systemSettingRestrictFutureVacation && (systemSettingRestrictFutureVacation === 'true' || systemSettingRestrictFutureVacation === '1')
            ? 1
            : 0,
        systemSettingMaxAbsencesBeforeAttendanceLock: parseNullable(systemSettingMaxAbsencesBeforeAttendanceLock),
        systemSettingMaxLateArrivalsBeforeAttendanceLock: parseNullable(systemSettingMaxLateArrivalsBeforeAttendanceLock),
        systemSettingPeriodAbsencesBeforeAttendanceLock: systemSettingPeriodAbsencesBeforeAttendanceLock,
        systemSettingPeriodLateArrivalsBeforeAttendanceLock: systemSettingPeriodLateArrivalsBeforeAttendanceLock,
        systemSettingMonthlyConversionFactor: systemSettingMonthlyConversionFactor,
      } as SystemSetting
      const systemSettingService = new SystemSettingService()
      const buUnitsStore = businessUnitScope.length > 0
        ? await BusinessUnit.query().whereIn('business_unit_id', businessUnitScope).where('business_unit_active', 1)
        : []
      const businessSlugsStore = buUnitsStore.map((bu) => bu.businessUnitSlug)
      const data = await request.validateUsing(createSystemSettingValidator)
      const valid = await systemSettingService.verifyInfo(systemSetting)
      if (valid.status !== 200) {
        response.status(valid.status)
        return {
          type: valid.type,
          title: valid.title,
          message: valid.message,
          data: { ...data },
        }
      }
      // USRH1783712837584: valida por `business_unit_id`, no por el CSV de slugs.
      const validActive = await systemSettingService.verifyActiveStore(systemSetting, businessUnitScope[0])
      if (validActive.status !== 200) {
        response.status(validActive.status)
        return {
          type: validActive.type,
          title: validActive.title,
          message: validActive.message,
          data: { ...data },
        }
      }
      const validationOptions = {
        types: ['image'],
        size: '',
      }
      const systemSettingLogo = request.file('systemSettingLogo', validationOptions)
      if (systemSettingLogo) {
        const allowedExtensions = ['svg', 'png', 'webp']
        if (
          !allowedExtensions.includes(systemSettingLogo.extname ? systemSettingLogo.extname : '')
        ) {
          response.status(400)
          return {
            status: 400,
            type: 'warning',
            title: 'Missing data to process',
            message: 'Please upload a image valid',
            data: systemSettingLogo,
          }
        }
        const uploadService = new UploadService()
        const fileName = `${new Date().getTime()}_${systemSettingLogo.clientName}`
        const fileUrl = await uploadService.fileUpload(
          systemSettingLogo,
          'system-settings',
          fileName
        )
        systemSetting.systemSettingLogo = fileUrl
      }
      const systemSettingBanner = request.file('systemSettingBanner', validationOptions)
      if (systemSettingBanner) {
        const allowedExtensions = ['svg', 'png', 'webp']
        if (
          !allowedExtensions.includes(
            systemSettingBanner.extname ? systemSettingBanner.extname : ''
          )
        ) {
          response.status(400)
          return {
            status: 400,
            type: 'warning',
            title: 'Missing data to process',
            message: 'Please upload a image valid',
            data: systemSettingBanner,
          }
        }
        const uploadService = new UploadService()
        const fileName = `${new Date().getTime()}_${systemSettingBanner.clientName}`
        const fileUrl = await uploadService.fileUpload(
          systemSettingBanner,
          'system-settings',
          fileName
        )
        systemSetting.systemSettingBanner = fileUrl
      }
      const systemSettingFavicon = request.file('systemSettingFavicon', validationOptions)
      if (systemSettingFavicon) {
        const allowedExtensions = ['svg', 'png', 'webp']
        if (
          !allowedExtensions.includes(
            systemSettingFavicon.extname ? systemSettingFavicon.extname : ''
          )
        ) {
          response.status(400)
          return {
            status: 400,
            type: 'warning',
            title: 'Missing data to process',
            message: 'Please upload a image valid',
            data: systemSettingFavicon,
          }
        }
        const uploadService = new UploadService()
        const fileName = `${new Date().getTime()}_${systemSettingFavicon.clientName}`
        const fileUrl = await uploadService.fileUpload(
          systemSettingFavicon,
          'system-settings',
          fileName
        )
        systemSetting.systemSettingFavicon = fileUrl
      }
      const systemSettingEmployeeAplicationIcon = request.file(
        'systemSettingEmployeeAplicationIcon',
        validationOptions
      )
      if (systemSettingEmployeeAplicationIcon) {
        const validation = await this.validateEmployeeApplicationIcon(
          systemSettingEmployeeAplicationIcon
        )
        if (!validation.valid) {
          response.status(400)
          return {
            status: 400,
            type: 'warning',
            title: 'Invalid image',
            message: validation.message || 'Please upload a valid image',
            errorCode: validation.errorCode,
            data: {},
          }
        }
        const uploadService = new UploadService()
        const fileName = `${new Date().getTime()}_${systemSettingEmployeeAplicationIcon.clientName}`
        const fileUrl = await uploadService.fileUpload(
          systemSettingEmployeeAplicationIcon,
          'system-settings',
          fileName
        )
        if (fileUrl === 'S3Producer.fileUpload' || fileUrl === 'file_not_found') {
          response.status(500)
          return {
            status: 500,
            type: 'error',
            title: 'Upload error',
            message: SYSTEM_SETTING_ERROR_CODES.UPLOAD_ERROR.message,
            errorCode: SYSTEM_SETTING_ERROR_CODES.UPLOAD_ERROR.code,
            data: {},
          }
        }
        systemSetting.systemSettingEmployeeAplicationIcon = fileUrl
      }
      systemSetting.systemSettingBusinessUnits = businessSlugsStore.join(',')
      // USRH1783712837584: `create()` no asignaba `businessUnitId` — si un
      // admin crea manualmente desde la pantalla BO (empresa preexistente sin
      // backfill), la fila quedaría sin relación formal a su empresa.
      systemSetting.businessUnitId = businessUnitScope[0]
      const newSystemSetting = await systemSettingService.create(systemSetting)
      response.status(201)
      return {
        type: 'success',
        title: 'System settings',
        message: 'The system setting was created successfully',
        data: { systemSetting: newSystemSetting },
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
   * /api/system-settings/{systemSettingId}:
   *   put:
   *     tags:
   *       - System Settings
   *     summary: update system setting
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: systemSettingId
   *         schema:
   *           type: number
   *         description: System setting id
   *         required: true
   *     requestBody:
   *       content:
   *        multipart/form-data:
   *           schema:
   *             type: object
   *             properties:
   *               systemSettingLogo:
   *                 type: string
   *                 format: binary
   *                 description: System setting logo
   *                 required: false
   *               systemSettingBanner:
   *                 type: string
   *                 format: binary
   *                 description: System setting banner
   *                 required: false
   *               systemSettingFavicon:
   *                 type: string
   *                 format: binary
   *                 description: System setting favicon
   *               systemSettingEmployeeAplicationIcon:
   *                 type: string
   *                 format: binary
   *                 description: System setting employee application icon (512x512 PNG, white background, no transparency)
   *                 required: false
   *               systemSettingTradeName:
   *                 type: string
   *                 description: System setting trade name
   *                 required: true
   *                 default: ''
   *               systemSettingSidebarColor:
   *                 type: string
   *                 description: System setting sidebar color
   *                 required: true
   *                 default: ''
   *               systemSettingActive:
   *                 type: boolean
   *                 description: System setting status
   *                 required: false
   *                 default: true
   *               systemSettingToleranceCountPerAbsence:
   *                 type: number
   *                 description: System setting tolerance count per absence
   *                 required: false
   *               systemSettingRestrictFutureVacation:
   *                 type: boolean
   *                 description: System setting restrict future vacation
   *                 required: false
   *                 default: true
   *               systemSettingMaxAbsencesBeforeAttendanceLock:
   *                 type: number
   *                 description: System setting max absences before attendance lock
   *                 required: false
   *               systemSettingMaxLateArrivalsBeforeAttendanceLock:
   *                 type: number
   *                 description: System setting max late arrivals before attendance lock
   *                 required: false
   *               systemSettingPeriodAbsencesBeforeAttendanceLock:
   *                 type: string
   *                 description: System setting period absences before attendance lock
   *                 required: false
   *                 default: 'monthly'
   *               systemSettingPeriodLateArrivalsBeforeAttendanceLock:
   *                 type: string
   *                 description: System setting period late arrivals before attendance lock
   *                 required: false
   *                 default: 'monthly'
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
  async update({ request, response, businessUnitScope }: HttpContext) {
    try {
      const systemSettingId = request.param('systemSettingId')
      const systemSettingTradeName = request.input('systemSettingTradeName')
      const systemSettingSidebarColor = request.input('systemSettingSidebarColor')
      const systemSettingActive = request.input('systemSettingActive')
      const systemSettingToleranceCountPerAbsence = request.input('systemSettingToleranceCountPerAbsence')
      const systemSettingRestrictFutureVacation = request.input('systemSettingRestrictFutureVacation')
      const systemSettingMaxAbsencesBeforeAttendanceLock = request.input('systemSettingMaxAbsencesBeforeAttendanceLock')
      const systemSettingMaxLateArrivalsBeforeAttendanceLock = request.input('systemSettingMaxLateArrivalsBeforeAttendanceLock')
      const systemSettingPeriodAbsencesBeforeAttendanceLock = request.input('systemSettingPeriodAbsencesBeforeAttendanceLock')
      const systemSettingPeriodLateArrivalsBeforeAttendanceLock = request.input('systemSettingPeriodLateArrivalsBeforeAttendanceLock')
      const systemSettingMonthlyConversionFactorRaw = request.input('systemSettingMonthlyConversionFactor')
      const parseNullable = (value: any) =>
        value === 'null' || value === undefined ? null : value
      const parseConversionFactor = (value: any): number | undefined => {
        if (value === undefined || value === null) return undefined
        const parsed = Number.parseFloat(value)
        return Number.isNaN(parsed) ? undefined : parsed
      }
      const systemSettingMonthlyConversionFactor = parseConversionFactor(systemSettingMonthlyConversionFactorRaw)
      if (
        systemSettingMonthlyConversionFactor !== undefined &&
        (systemSettingMonthlyConversionFactor <= 0 || systemSettingMonthlyConversionFactor > 31)
      ) {
        response.status(400)
        return {
          type: 'warning',
          title: 'Invalid monthly conversion factor',
          message: 'The monthly conversion factor must be greater than 0 and less than or equal to 31',
          data: { systemSettingMonthlyConversionFactor: systemSettingMonthlyConversionFactorRaw },
        }
      }

      const systemSetting = {
        systemSettingId: systemSettingId,
        systemSettingTradeName: systemSettingTradeName,
        systemSettingSidebarColor: systemSettingSidebarColor,
        systemSettingActive:
          systemSettingActive && (systemSettingActive === 'true' || systemSettingActive === '1')
            ? 1
            : 0,
        systemSettingToleranceCountPerAbsence: systemSettingToleranceCountPerAbsence,
        systemSettingRestrictFutureVacation:
        systemSettingRestrictFutureVacation && (systemSettingRestrictFutureVacation === 'true' || systemSettingRestrictFutureVacation === '1')
            ? 1
            : 0,
        systemSettingMaxAbsencesBeforeAttendanceLock: parseNullable(systemSettingMaxAbsencesBeforeAttendanceLock),
        systemSettingMaxLateArrivalsBeforeAttendanceLock: parseNullable(systemSettingMaxLateArrivalsBeforeAttendanceLock),
        systemSettingPeriodAbsencesBeforeAttendanceLock: systemSettingPeriodAbsencesBeforeAttendanceLock,
        systemSettingPeriodLateArrivalsBeforeAttendanceLock: systemSettingPeriodLateArrivalsBeforeAttendanceLock,
        systemSettingMonthlyConversionFactor: systemSettingMonthlyConversionFactor,
      } as SystemSetting
      if (!systemSettingId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'Missing data to process',
          message: 'The system setting id was not found',
          data: { ...systemSetting },
        }
      }
      const currentSystemSetting = await SystemSetting.query()
        .whereNull('system_setting_deleted_at')
        .where('system_setting_id', systemSettingId)
        .first()
      if (!currentSystemSetting) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The system setting was not found',
          message: 'The system setting was not found with the entered ID',
          data: { ...systemSetting },
        }
      }
      const systemSettingService = new SystemSettingService()
      const buUnitsUpdate = businessUnitScope.length > 0
        ? await BusinessUnit.query().whereIn('business_unit_id', businessUnitScope).where('business_unit_active', 1)
        : []
      const businessSlugsUpdate = buUnitsUpdate.map((bu) => bu.businessUnitSlug)
      const valid = await systemSettingService.verifyInfo(systemSetting)
      if (valid.status !== 200) {
        response.status(valid.status)
        return {
          type: valid.type,
          title: valid.title,
          message: valid.message,
          data: { ...systemSetting },
        }
      }
      // USRH1783712837584: valida por `business_unit_id`, no por el CSV de slugs.
      const validActive = await systemSettingService.verifyActiveUpdate(
        systemSetting,
        currentSystemSetting,
        businessUnitScope[0]
      )
      if (validActive.status !== 200) {
        response.status(validActive.status)
        return {
          type: validActive.type,
          title: validActive.title,
          message: validActive.message,
          data: { ...systemSetting },
        }
      }
      systemSetting.systemSettingBusinessUnits = businessSlugsUpdate.join(',')
      const validationOptions = {
        types: ['image'],
        size: '',
      }
      const systemSettingLogo = request.file('systemSettingLogo', validationOptions)
      systemSetting.systemSettingLogo = currentSystemSetting.systemSettingLogo
      if (systemSettingLogo) {
        const allowedExtensions = ['svg', 'png', 'webp']
        if (
          !allowedExtensions.includes(systemSettingLogo.extname ? systemSettingLogo.extname : '')
        ) {
          response.status(400)
          return {
            status: 400,
            type: 'warning',
            title: 'Missing data to process',
            message: 'Please upload a image valid',
            data: systemSettingLogo,
          }
        }
        const uploadService = new UploadService()
        if (currentSystemSetting.systemSettingLogo) {
          const fileNameWithExt = path.basename(currentSystemSetting.systemSettingLogo)
          const fileKey = `${Env.get('AWS_ROOT_PATH')}/system-settings/${fileNameWithExt}`
          await uploadService.deleteFile(fileKey)
        }
        const fileName = `${new Date().getTime()}_${systemSettingLogo.clientName}`
        const fileUrl = await uploadService.fileUpload(
          systemSettingLogo,
          'system-settings',
          fileName
        )
        systemSetting.systemSettingLogo = fileUrl
      }
      const systemSettingBanner = request.file('systemSettingBanner', validationOptions)
      if (systemSettingBanner) {
        const allowedExtensions = ['svg', 'png', 'webp']
        if (
          !allowedExtensions.includes(
            systemSettingBanner.extname ? systemSettingBanner.extname : ''
          )
        ) {
          response.status(400)
          return {
            status: 400,
            type: 'warning',
            title: 'Missing data to process',
            message: 'Please upload a image valid',
            data: systemSettingBanner,
          }
        }
        const uploadService = new UploadService()
        if (currentSystemSetting.systemSettingBanner) {
          const fileNameWithExt = path.basename(currentSystemSetting.systemSettingBanner)
          const fileKey = `${Env.get('AWS_ROOT_PATH')}/system-settings/${fileNameWithExt}`
          await uploadService.deleteFile(fileKey)
        }
        const fileName = `${new Date().getTime()}_${systemSettingBanner.clientName}`
        const fileUrl = await uploadService.fileUpload(
          systemSettingBanner,
          'system-settings',
          fileName
        )
        systemSetting.systemSettingBanner = fileUrl
      }
      const systemSettingFavicon = request.file('systemSettingFavicon', validationOptions)
      systemSetting.systemSettingFavicon = currentSystemSetting.systemSettingFavicon
      if (systemSettingFavicon) {
        const allowedExtensions = ['svg', 'png', 'webp']
        if (
          !allowedExtensions.includes(
            systemSettingFavicon.extname ? systemSettingFavicon.extname : ''
          )
        ) {
          response.status(400)
          return {
            status: 400,
            type: 'warning',
            title: 'Missing data to process',
            message: 'Please upload a image valid',
            data: systemSettingFavicon,
          }
        }
        const uploadService = new UploadService()
        if (currentSystemSetting.systemSettingFavicon) {
          const fileNameWithExt = path.basename(currentSystemSetting.systemSettingFavicon)
          const fileKey = `${Env.get('AWS_ROOT_PATH')}/system-settings/${fileNameWithExt}`
          await uploadService.deleteFile(fileKey)
        }
        const fileName = `${new Date().getTime()}_${systemSettingFavicon.clientName}`
        const fileUrl = await uploadService.fileUpload(
          systemSettingFavicon,
          'system-settings',
          fileName
        )
        systemSetting.systemSettingFavicon = fileUrl
      }
      const systemSettingEmployeeAplicationIcon = request.file(
        'systemSettingEmployeeAplicationIcon',
        validationOptions
      )
      systemSetting.systemSettingEmployeeAplicationIcon =
        currentSystemSetting.systemSettingEmployeeAplicationIcon
      if (systemSettingEmployeeAplicationIcon) {
        const validation = await this.validateEmployeeApplicationIcon(
          systemSettingEmployeeAplicationIcon
        )
        if (!validation.valid) {
          response.status(400)
          return {
            status: 400,
            type: 'warning',
            title: 'Invalid image',
            message: validation.message || 'Please upload a valid image',
            errorCode: validation.errorCode,
            data: {},
          }
        }
        const uploadService = new UploadService()
        if (currentSystemSetting.systemSettingEmployeeAplicationIcon) {
          const fileNameWithExt = path.basename(
            currentSystemSetting.systemSettingEmployeeAplicationIcon
          )
          const fileKey = `${Env.get('AWS_ROOT_PATH')}/system-settings/${fileNameWithExt}`
          const deleteResult = await uploadService.deleteFile(fileKey)
          if (deleteResult.status !== 200 && deleteResult.status !== 404) {
            response.status(500)
            return {
              status: 500,
              type: 'error',
              title: 'Delete error',
              message: SYSTEM_SETTING_ERROR_CODES.DELETE_ERROR.message,
              errorCode: SYSTEM_SETTING_ERROR_CODES.DELETE_ERROR.code,
              data: {},
            }
          }
        }
        const fileName = `${new Date().getTime()}_${systemSettingEmployeeAplicationIcon.clientName}`
        const fileUrl = await uploadService.fileUpload(
          systemSettingEmployeeAplicationIcon,
          'system-settings',
          fileName
        )
        if (fileUrl === 'S3Producer.fileUpload' || fileUrl === 'file_not_found') {
          response.status(500)
          return {
            status: 500,
            type: 'error',
            title: 'Upload error',
            message: SYSTEM_SETTING_ERROR_CODES.UPLOAD_ERROR.message,
            errorCode: SYSTEM_SETTING_ERROR_CODES.UPLOAD_ERROR.code,
            data: {},
          }
        }
        systemSetting.systemSettingEmployeeAplicationIcon = fileUrl
      }
      const updateSystemSetting = await systemSettingService.update(
        currentSystemSetting,
        systemSetting
      )
      response.status(200)
      return {
        type: 'success',
        title: 'System settings',
        message: 'The system setting was updated successfully',
        data: { systemSetting: updateSystemSetting },
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
   * /api/system-settings/{systemSettingId}:
   *   delete:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - System Settings
   *     summary: delete system setting
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: systemSettingId
   *         schema:
   *           type: number
   *         description: System setting id
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
  async delete({ request, response }: HttpContext) {
    try {
      const systemSettingId = request.param('systemSettingId')
      if (!systemSettingId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'The system setting Id was not found',
          message: 'Missing data to process',
          data: { systemSettingId },
        }
      }
      const currentSystemSetting = await SystemSetting.query()
        .whereNull('system_setting_deleted_at')
        .where('system_setting_id', systemSettingId)
        .first()
      if (!currentSystemSetting) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The system setting was not found',
          message: 'The system setting was not found with the entered ID',
          data: { systemSettingId },
        }
      }
      const systemSettingService = new SystemSettingService()
      const deleteSystemSetting = await systemSettingService.delete(currentSystemSetting)
      if (deleteSystemSetting) {
        response.status(200)
        return {
          type: 'success',
          title: 'System settings',
          message: 'The system settinglot was deleted successfully',
          data: { systemSetting: deleteSystemSetting },
        }
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
   * /api/system-settings/{systemSettingId}:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - System Settings
   *     summary: get system setting by id
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: systemSettingId
   *         schema:
   *           type: number
   *         description: System setting id
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
  /**
   * Crea la relación system setting ↔ proceeding file (igual que POST /api/employees-proceeding-files).
   * POST /api/system-settings-proceeding-files — application/json:
   * { systemSettingId, proceedingFileId } o { systemSettingId, proceedingFileIds: number[] }
   * Subir el archivo antes: POST /api/proceeding-files (tipo system-setting; systemSettingId opcional).
   */
  async storeProceedingFile({ request, response }: HttpContext) {
    try {
      const service = new SystemSettingProceedingFileService()
      const data = await request.validateUsing(createSystemSettingProceedingFileValidator)
      const normalizedProceedingFileIds = Array.from(
        new Set(
          [data.proceedingFileId, ...(data.proceedingFileIds || [])].filter(
            (proceedingFileId): proceedingFileId is number =>
              typeof proceedingFileId === 'number' && proceedingFileId > 0
          )
        )
      )

      if (normalizedProceedingFileIds.length === 0) {
        response.status(400)
        return {
          type: 'warning',
          title: 'Validation error',
          message: 'Se requiere proceedingFileId o proceedingFileIds con al menos un id válido',
          data: { ...data },
        }
      }

      const created: unknown[] = []
      const duplicates: number[] = []
      const failed: { proceedingFileId: number; status: number; title: string; message: string }[] = []

      for (const proceedingFileId of normalizedProceedingFileIds) {
        const exist = await service.verifyInfoExist({
          systemSettingId: data.systemSettingId,
          proceedingFileId,
        })
        if (exist.status !== 200) {
          failed.push({
            proceedingFileId,
            status: exist.status,
            title: exist.title,
            message: exist.message,
          })
          continue
        }

        const verify = await service.verifyInfo({
          systemSettingId: data.systemSettingId,
          proceedingFileId,
        })
        if (verify.status !== 200) {
          if (verify.title === 'Relation already exists') {
            duplicates.push(proceedingFileId)
            continue
          }
          failed.push({
            proceedingFileId,
            status: verify.status,
            title: verify.title,
            message: verify.message,
          })
          continue
        }

        const relation = await service.create({
          systemSettingId: data.systemSettingId,
          proceedingFileId,
        })
        created.push(relation)
      }

      if (created.length === 0 && duplicates.length > 0 && failed.length === 0) {
        response.status(200)
        return {
          type: 'success',
          title: 'System settings proceeding files',
          message: 'Las relaciones ya existían previamente',
          data: {
            systemSettingId: data.systemSettingId,
            created,
            duplicates,
            failed,
          },
        }
      }

      if (created.length === 0) {
        response.status(400)
        return {
          type: 'warning',
          title: 'No relations were created',
          message: 'No se pudo crear ninguna relación con los IDs enviados',
          data: {
            systemSettingId: data.systemSettingId,
            proceedingFileIds: normalizedProceedingFileIds,
            duplicates,
            failed,
          },
        }
      }

      response.status(201)
      return {
        type: 'success',
        title: 'System settings proceeding files',
        message: 'Las relaciones system-setting-proceedingfile se crearon correctamente',
        data: {
          created,
          duplicates,
          failed,
        },
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
   * Lista proceeding files vinculados a un system setting.
   * GET /api/system-settings-proceeding-files?systemSettingId=…&type=… (type opcional).
   */
  async proceedingFiles({ request, response }: HttpContext) {
    try {
      const systemSettingIdParam = request.param('systemSettingId') ?? request.input('systemSettingId')
      const systemSettingId = Number(systemSettingIdParam)
      if (
        systemSettingIdParam === undefined ||
        systemSettingIdParam === null ||
        String(systemSettingIdParam).trim() === '' ||
        Number.isNaN(systemSettingId) ||
        systemSettingId <= 0
      ) {
        response.status(400)
        return {
          type: 'warning',
          title: 'The system setting Id was not found',
          message: 'Se requiere systemSettingId en query, por ejemplo ?systemSettingId=3',
          data: { systemSettingId: systemSettingIdParam },
        }
      }

      const typeRaw = request.input('type')
      let proceedingFileTypeId: number | null = null
      if (typeRaw !== undefined && typeRaw !== null && String(typeRaw).trim() !== '') {
        proceedingFileTypeId = Number(typeRaw)
        if (Number.isNaN(proceedingFileTypeId) || proceedingFileTypeId <= 0) {
          response.status(400)
          return {
            type: 'warning',
            title: 'Invalid query parameter',
            message: 'type must be a positive number (proceedingFileTypeId)',
            data: { type: typeRaw },
          }
        }
      }

      const systemSetting = await SystemSetting.query()
        .whereNull('deletedAt')
        .where('systemSettingId', systemSettingId)
        .first()

      if (!systemSetting) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The system setting was not found',
          message: 'The system setting was not found with the entered ID',
          data: { systemSettingId },
        }
      }

      const query = SystemSettingProceedingFile.query()
        .whereNull('system_setting_proceeding_file_deleted_at')
        .where('system_setting_id', systemSettingId)
        .if(proceedingFileTypeId !== null, (q) => {
          q.whereHas('proceedingFile', (sub) => {
            sub
              .whereNull('proceeding_file_deleted_at')
              .where('proceeding_file_type_id', proceedingFileTypeId!)
          })
        })
        .preload('proceedingFile', (q) => {
          q.whereNull('proceeding_file_deleted_at').preload('proceedingFileType')
        })
        .orderBy('system_setting_proceeding_file_id', 'desc')

      const systemSettingProceedingFiles = await query

      response.status(200)
      return {
        type: 'success',
        title: 'System setting proceeding files',
        message: 'Proceeding files were found successfully',
        data: { systemSettingProceedingFiles },
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
   * Obtiene archivos vencidos y por vencer de un system setting por rango de fechas.
   * GET /api/system-settings-proceeding-files/get-expired-and-expiring/:systemSettingId?dateStart=YYYY-MM-DD&dateEnd=YYYY-MM-DD
   */
  async getExpiresAndExpiringProceedingFiles({ request, response }: HttpContext) {
    try {
      const systemSettingIdParam = request.param('systemSettingId')
      const systemSettingId = Number(systemSettingIdParam)
      if (!systemSettingIdParam || Number.isNaN(systemSettingId) || systemSettingId <= 0) {
        response.status(400)
        return {
          type: 'warning',
          title: 'Invalid system setting id',
          message: 'Se requiere systemSettingId numérico en la ruta',
          data: { systemSettingId: systemSettingIdParam },
        }
      }

      const dateStart = request.input('dateStart')
      const dateEnd = request.input('dateEnd')
      const validDateStart = typeof dateStart === 'string' && DateTime.fromISO(dateStart).isValid
      const validDateEnd = typeof dateEnd === 'string' && DateTime.fromISO(dateEnd).isValid
      if (!validDateStart || !validDateEnd) {
        response.status(400)
        return {
          type: 'warning',
          title: 'Invalid date filters',
          message: 'dateStart y dateEnd son obligatorios y deben tener formato YYYY-MM-DD',
          data: { dateStart, dateEnd },
        }
      }

      const systemSetting = await SystemSetting.query()
        .whereNull('deletedAt')
        .where('systemSettingId', systemSettingId)
        .first()
      if (!systemSetting) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The system setting was not found',
          message: 'The system setting was not found with the entered ID',
          data: { systemSettingId },
        }
      }

      const service = new SystemSettingProceedingFileService()
      const result = await service.getExpiredAndExpiringBySystemSetting(systemSettingId, {
        dateStart,
        dateEnd,
      })

      response.status(200)
      return {
        type: 'success',
        title: 'System setting proceeding files',
        message: 'Proceeding files expired and expiring were found successfully',
        data: {
          systemSettingId,
          systemSettingProceedingFiles: result,
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

  /**
   * Obtiene una relación system setting ↔ proceeding file por id del pivote.
   * GET /api/system-settings-proceeding-files/:systemSettingProceedingFileId
   */
  async showProceedingFile({ request, response }: HttpContext) {
    try {
      const idParam = request.param('systemSettingProceedingFileId')
      const systemSettingProceedingFileId = Number(idParam)
      if (!idParam || Number.isNaN(systemSettingProceedingFileId) || systemSettingProceedingFileId <= 0) {
        response.status(400)
        return {
          type: 'warning',
          title: 'Invalid id',
          message: 'Se requiere systemSettingProceedingFileId numérico en la ruta',
          data: { systemSettingProceedingFileId: idParam },
        }
      }

      const service = new SystemSettingProceedingFileService()
      const link = await service.show(systemSettingProceedingFileId)

      if (!link) {
        response.status(404)
        return {
          type: 'warning',
          title: 'Relation not found',
          message: 'No se encontró la relación con el id indicado',
          data: { systemSettingProceedingFileId },
        }
      }

      response.status(200)
      return {
        type: 'success',
        title: 'System setting proceeding files',
        message: 'La relación se encontró correctamente',
        data: { systemSettingProceedingFile: link },
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
   * Actualiza systemSettingId y proceedingFileId del pivote.
   * PUT /api/system-settings-proceeding-files/:systemSettingProceedingFileId
   * Body JSON: { "systemSettingId": number, "proceedingFileId": number }
   */
  async updateProceedingFile({ request, response }: HttpContext) {
    try {
      const idParam = request.param('systemSettingProceedingFileId')
      const systemSettingProceedingFileId = Number(idParam)
      if (!idParam || Number.isNaN(systemSettingProceedingFileId) || systemSettingProceedingFileId <= 0) {
        response.status(400)
        return {
          type: 'warning',
          title: 'Invalid id',
          message: 'Se requiere systemSettingProceedingFileId numérico en la ruta',
          data: { systemSettingProceedingFileId: idParam },
        }
      }

      const current = await SystemSettingProceedingFile.query()
        .whereNull('system_setting_proceeding_file_deleted_at')
        .where('systemSettingProceedingFileId', systemSettingProceedingFileId)
        .first()

      if (!current) {
        response.status(404)
        return {
          type: 'warning',
          title: 'Relation not found',
          message: 'No se encontró la relación con el id indicado',
          data: { systemSettingProceedingFileId },
        }
      }

      const data = await request.validateUsing(updateSystemSettingProceedingFileValidator)
      const payload = {
        systemSettingId: data.systemSettingId,
        proceedingFileId: data.proceedingFileId,
      }

      const service = new SystemSettingProceedingFileService()
      const exist = await service.verifyInfoExist(payload)
      if (exist.status !== 200) {
        response.status(exist.status)
        return {
          type: exist.type,
          title: exist.title,
          message: exist.message,
          data: exist.data,
        }
      }

      const verify = await service.verifyInfo(payload, systemSettingProceedingFileId)
      if (verify.status !== 200) {
        response.status(verify.status)
        return {
          type: verify.type,
          title: verify.title,
          message: verify.message,
          data: verify.data,
        }
      }

      const updated = await service.update(current, payload)

      response.status(200)
      return {
        type: 'success',
        title: 'System setting proceeding files',
        message: 'La relación se actualizó correctamente',
        data: { systemSettingProceedingFile: updated },
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
   * Elimina la relación system setting ↔ proceeding file (soft delete del pivote).
   * DELETE /api/system-settings-proceeding-files/:systemSettingProceedingFileId
   */
  async deleteProceedingFile({ request, response }: HttpContext) {
    try {
      const idParam = request.param('systemSettingProceedingFileId')
      const systemSettingProceedingFileId = Number(idParam)
      if (!idParam || Number.isNaN(systemSettingProceedingFileId) || systemSettingProceedingFileId <= 0) {
        response.status(400)
        return {
          type: 'warning',
          title: 'Invalid id',
          message: 'Se requiere systemSettingProceedingFileId numérico en la ruta',
          data: { systemSettingProceedingFileId: idParam },
        }
      }

      const link = await SystemSettingProceedingFile.query()
        .whereNull('system_setting_proceeding_file_deleted_at')
        .where('systemSettingProceedingFileId', systemSettingProceedingFileId)
        .first()

      if (!link) {
        response.status(404)
        return {
          type: 'warning',
          title: 'Relation not found',
          message: 'No se encontró la relación con el id indicado',
          data: { systemSettingProceedingFileId },
        }
      }

      await link.delete()

      response.status(200)
      return {
        type: 'success',
        title: 'System setting proceeding files',
        message: 'La relación system setting — proceeding file se eliminó correctamente',
        data: { systemSettingProceedingFile: link },
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

  async show({ request, response }: HttpContext) {
    try {
      const systemSettingId = request.param('systemSettingId')
      if (!systemSettingId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'The system setting Id was not found',
          message: 'Missing data to process',
          data: { systemSettingId },
        }
      }
      const systemSettingService = new SystemSettingService()
      const showSystemSetting = await systemSettingService.show(systemSettingId)
      if (!showSystemSetting) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The system setting was not found',
          message: 'The system setting was not found with the entered ID',
          data: { systemSettingId },
        }
      } else {
        response.status(200)
        return {
          type: 'success',
          title: 'System settings',
          message: 'The system setting was found successfully',
          data: { systemSetting: showSystemSetting },
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
   * /api/system-settings-active:
   *   get:
   *     security: []
   *     tags:
   *       - System Settings
   *     summary: get system setting active
   *     description: >
   *       Ruta pública (sin `bearerAuth` obligatorio): la consumen tanto
   *       pantallas SIN usuario (branding de login/registro en gsti-rh-bo)
   *       como pantallas CON usuario y unidad de negocio ya seleccionada.
   *
   *
   *       **Resolución "split por contexto" (USRH1783712837584):**
   *       - **Sin header `X-Business-Unit-Id` o sin sesión autenticada
   *         válida** (pre-login): devuelve el comportamiento global previo,
   *         la configuración "activa" del sistema sin filtrar por empresa.
   *       - **Con header + sesión autenticada, pero la unidad de negocio no
   *         existe o está fuera del alcance del usuario**: `404` con
   *         `key: BU.NOT.001`.
   *       - **Con header + sesión autenticada y unidad de negocio válida**:
   *         resuelve la configuración de ESA empresa por su
   *         `business_unit_id` vía `resolveByBusinessUnitId` (fail-closed).
   *         Si la empresa no tiene su propia configuración: `404` con
   *         `code: SETTINGS.RESOLVE.NOT_FOUND_TENANT`. Nunca devuelve la
   *         configuración de otra empresa como sustituto.
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: header
   *         name: X-Business-Unit-Id
   *         schema:
   *           type: string
   *           format: uuid
   *         description: >
   *           Código público (`businessUnitPublicId`) de la unidad de negocio
   *           seleccionada. Opcional: solo se usa para resolver por empresa
   *           cuando además hay una sesión autenticada válida; sin sesión se
   *           ignora y se conserva el comportamiento global (pre-login).
   *         required: false
   *     responses:
   *       '200':
   *         description: >
   *           Configuración obtenida correctamente. `data.systemSetting` es
   *           el registro global (sin `businessUnitId`) cuando no hay
   *           header/sesión, o el registro propio de la empresa del usuario
   *           cuando sí los hay.
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                   example: success
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                   example: System settings
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                   example: The system setting active was found successfully
   *                 data:
   *                   type: object
   *                   description: Objeto con la configuración resuelta
   *                   properties:
   *                     systemSetting:
   *                       type: object
   *                       description: Registro de System Settings resuelto (global o por empresa)
   *                       properties:
   *                         systemSettingId:
   *                           type: integer
   *                         businessUnitId:
   *                           type: integer
   *                           nullable: true
   *                           description: Id de la unidad de negocio dueña del registro; null en el registro global fundacional
   *                         systemSettingTradeName:
   *                           type: string
   *                         systemSettingLogo:
   *                           type: string
   *                         systemSettingBanner:
   *                           type: string
   *                         systemSettingSidebarColor:
   *                           type: string
   *                         systemSettingFavicon:
   *                           type: string
   *                         systemSettingActive:
   *                           type: integer
   *                         systemSettingToleranceCountPerAbsence:
   *                           type: integer
   *                         systemSettingTolerances:
   *                           type: array
   *                           description: Tolerancias de asistencia asociadas
   *                           items:
   *                             type: object
   *             examples:
   *               sinSesionONoTenant:
   *                 summary: Pre-login o sin header (comportamiento global)
   *                 value:
   *                   type: success
   *                   title: System settings
   *                   message: The system setting active was found successfully
   *                   data:
   *                     systemSetting:
   *                       systemSettingId: 1
   *                       businessUnitId: null
   *                       systemSettingTradeName: Valanserh
   *                       systemSettingActive: 1
   *               conSesionYTenant:
   *                 summary: Con header + sesión (resuelto por business_unit_id)
   *                 value:
   *                   type: success
   *                   title: System settings
   *                   message: The system setting active was found successfully
   *                   data:
   *                     systemSetting:
   *                       systemSettingId: 42
   *                       businessUnitId: 7
   *                       systemSettingTradeName: Empresa Cliente S.A.
   *                       systemSettingActive: 1
   *       '404':
   *         description: >
   *           No encontrado. Dos causas posibles y mutuamente excluyentes
   *           (USRH1783712837584), distinguibles por la presencia de `key`
   *           vs `code`:
   *           1. `key: BU.NOT.001` — la unidad de negocio del header no
   *           existe o no está en el alcance del usuario autenticado
   *           (mismo criterio que el middleware `businessScope`).
   *           2. `code: SETTINGS.RESOLVE.NOT_FOUND_TENANT` — la unidad de
   *           negocio es válida y está en el alcance del usuario, pero no
   *           tiene su propia configuración de System Settings (fail-closed;
   *           nunca cae a la configuración de otra empresa).
   *         content:
   *           application/json:
   *             schema:
   *               oneOf:
   *                 - type: object
   *                   description: Unidad de negocio inválida o fuera de alcance
   *                   properties:
   *                     type:
   *                       type: string
   *                     title:
   *                       type: string
   *                     message:
   *                       type: string
   *                     key:
   *                       type: string
   *                       description: Clave estable del error
   *                       example: BU.NOT.001
   *                     data:
   *                       type: object
   *                 - type: object
   *                   description: Empresa válida sin System Settings propio
   *                   properties:
   *                     type:
   *                       type: string
   *                     title:
   *                       type: string
   *                     message:
   *                       type: string
   *                     key:
   *                       type: string
   *                       description: Clave i18n del error de resolución
   *                       example: configuracion-no-encontrada
   *                     code:
   *                       type: string
   *                       description: Código estable del error de resolución
   *                       example: SETTINGS.RESOLVE.NOT_FOUND_TENANT
   *                     data:
   *                       type: object
   *             examples:
   *               unidadNegocioNoEncontrada:
   *                 summary: BU.NOT.001 — header inválido o fuera de alcance
   *                 value:
   *                   type: error
   *                   title: Unidad de negocio no encontrada
   *                   message: El recurso solicitado no existe o no tienes acceso a él.
   *                   key: BU.NOT.001
   *                   data: {}
   *               empresaSinConfiguracion:
   *                 summary: SETTINGS.RESOLVE.NOT_FOUND_TENANT — fail-closed
   *                 value:
   *                   type: error
   *                   title: Configuración no encontrada
   *                   message: La empresa no tiene una configuración de System Settings propia.
   *                   key: configuracion-no-encontrada
   *                   code: SETTINGS.RESOLVE.NOT_FOUND_TENANT
   *                   data: {}
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
   *                   example: error
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                   example: Server error
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                   example: An unexpected error has occurred on the server
   *                 error:
   *                   type: string
   *                   description: Detalle técnico del error inesperado (message de la excepción)
   */
  /**
   * USRH1783712837584 — "split por contexto": esta ruta (`GET /api/system-settings-active`)
   * es pública (sin `auth()`/`businessScope()`) porque la consumen tanto páginas
   * SIN usuario (branding de login/registro en gsti-rh-bo, antes de autenticar)
   * como pantallas CON usuario y unidad de negocio ya seleccionada.
   *
   * Este helper solo resuelve el tenant si hay evidencia real de sesión + BU
   * seleccionada (header `X-Business-Unit-Id` + usuario autenticado válido):
   *  - Sin header → `{ businessUnitId: null }` (pre-login, comportamiento intacto).
   *  - Header pero sin sesión válida → `{ businessUnitId: null }` (igual que pre-login).
   *  - Header + sesión, pero unidad fuera de scope/inválida → `{ notInScope: true }`
   *    (mismo criterio que el middleware `businessScope`, sin distinguir el motivo).
   *  - Header + sesión + unidad válida → `{ businessUnitId }`.
   */
  private async resolveOptionalTenantBusinessUnitId(
    ctx: HttpContext
  ): Promise<{ businessUnitId: number | null; notInScope?: boolean }> {
    const headerValue = ctx.request.header('x-business-unit-id')
    if (!headerValue) return { businessUnitId: null }

    let authenticated = false
    try {
      authenticated = await ctx.auth.check()
    } catch {
      authenticated = false
    }
    if (!authenticated || !ctx.auth.user) return { businessUnitId: null }

    const user = ctx.auth.user
    if (!user.role) await user.load('role')
    const scopeService = new BusinessAccessScopeService()
    const fullScope = await scopeService.getAccessibleIds(user)
    const resolvedId = await scopeService.resolveInternalId(headerValue, fullScope)
    if (resolvedId === null) return { businessUnitId: null, notInScope: true }
    return { businessUnitId: resolvedId }
  }

  async getActive(ctx: HttpContext) {
    const { response } = ctx
    try {
      const systemSettingService = new SystemSettingService()
      const { businessUnitId, notInScope } = await this.resolveOptionalTenantBusinessUnitId(ctx)

      if (notInScope) {
        response.status(404)
        return {
          type: 'error',
          title: 'Unidad de negocio no encontrada',
          message: 'El recurso solicitado no existe o no tienes acceso a él.',
          key: 'BU.NOT.001',
          data: {},
        }
      }

      if (businessUnitId) {
        try {
          const showSystemSetting = await systemSettingService.resolveByBusinessUnitId(businessUnitId)
          response.status(200)
          return {
            type: 'success',
            title: 'System settings',
            message: 'The system setting active was found successfully',
            data: { systemSetting: showSystemSetting },
          }
        } catch (error) {
          if (!(error instanceof SystemSettingResolutionError)) throw error
          const resolved = resolveSystemSettingApiError(error, 404, ctx.i18n)
          response.status(resolved.status)
          return {
            type: 'error',
            title: resolved.title,
            message: resolved.message,
            key: resolved.key,
            code: resolved.code,
            data: {},
          }
        }
      }

      // Sin tenant resuelto (pre-login o header ausente): comportamiento global intacto.
      const showSystemSetting = await systemSettingService.getActive()
      response.status(200)
      return {
        type: 'success',
        title: 'System settings',
        message: 'The system setting active was found successfully',
        data: { systemSetting: showSystemSetting },
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
   * /api/system-settings/{systemSettingId}/birthday-emails:
   *   put:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - System Settings
   *     summary: update birthday emails status for system setting
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: systemSettingId
   *         schema:
   *           type: number
   *         description: System setting id
   *         required: true
   *     requestBody:
   *       content:
   *          application/json:
   *           schema:
   *             type: object
   *             properties:
   *               systemSettingBirthdayEmails:
   *                 type: boolean
   *                 description: Enable or disable birthday emails
   *                 required: true
   *                 default: false
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
  async updateBirthdayEmailsStatus({ request, response }: HttpContext) {
    try {
      const systemSettingId = request.param('systemSettingId')
      const systemSettingBirthdayEmails = request.input('systemSettingBirthdayEmails')

      if (!systemSettingId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'Missing data to process',
          message: 'The system setting id was not found',
          data: { systemSettingId },
        }
      }

      if (systemSettingBirthdayEmails === undefined || systemSettingBirthdayEmails === null) {
        response.status(400)
        return {
          type: 'warning',
          title: 'Missing data to process',
          message: 'The systemSettingBirthdayEmails field is required',
          data: { systemSettingBirthdayEmails },
        }
      }

      const systemSettingService = new SystemSettingService()
      const result = await systemSettingService.updateBirthdayEmailsStatus(
        systemSettingId,
        systemSettingBirthdayEmails
      )

      response.status(result.status)
      return {
        type: result.type,
        title: result.title,
        message: result.message,
        data: result.data,
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
   * /api/system-settings/{systemSettingId}/anniversary-emails:
   *   put:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - System Settings
   *     summary: update anniversary emails status for system setting
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: systemSettingId
   *         schema:
   *           type: number
   *         description: System setting id
   *         required: true
   *     requestBody:
   *       content:
   *          application/json:
   *           schema:
   *             type: object
   *             properties:
   *               systemSettingAnniversaryEmails:
   *                 type: boolean
   *                 description: Enable or disable anniversary emails
   *                 required: true
   *                 default: false
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
  async updateAnniversaryEmailsStatus({ request, response }: HttpContext) {
    try {
      const systemSettingId = request.param('systemSettingId')
      const systemSettingAnniversaryEmails = request.input('systemSettingAnniversaryEmails')

      if (!systemSettingId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'Missing data to process',
          message: 'The system setting id was not found',
          data: { systemSettingId },
        }
      }

      if (systemSettingAnniversaryEmails === undefined || systemSettingAnniversaryEmails === null) {
        response.status(400)
        return {
          type: 'warning',
          title: 'Missing data to process',
          message: 'The systemSettingAnniversaryEmails field is required',
          data: { systemSettingAnniversaryEmails },
        }
      }

      const systemSettingService = new SystemSettingService()
      const result = await systemSettingService.updateAnniversaryEmailsStatus(
        systemSettingId,
        systemSettingAnniversaryEmails
      )

      response.status(result.status)
      return {
        type: result.type,
        title: result.title,
        message: result.message,
        data: result.data,
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
   * /api/system-settings/{systemSettingId}/attendance-fault-hr-emails:
   *   put:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - System Settings
   *     summary: Activar o desactivar correos a RH por falta de registro de asistencia
   *     parameters:
   *       - in: path
   *         name: systemSettingId
   *         required: true
   *         schema:
   *           type: integer
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - systemSettingAttendanceFaultHrEmails
   *             properties:
   *               systemSettingAttendanceFaultHrEmails:
   *                 type: boolean
   *                 description: Si es true, se envían notificaciones (comando notify:attendance-fault-hr)
   *     responses:
   *       '200':
   *         description: Actualizado correctamente
   */
  async updateAttendanceFaultHrEmailsStatus({ request, response }: HttpContext) {
    try {
      const systemSettingId = request.param('systemSettingId')
      const systemSettingAttendanceFaultHrEmails = request.input('systemSettingAttendanceFaultHrEmails')

      if (!systemSettingId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'Missing data to process',
          message: 'The system setting id was not found',
          data: { systemSettingId },
        }
      }

      if (
        systemSettingAttendanceFaultHrEmails === undefined ||
        systemSettingAttendanceFaultHrEmails === null
      ) {
        response.status(400)
        return {
          type: 'warning',
          title: 'Missing data to process',
          message: 'The systemSettingAttendanceFaultHrEmails field is required',
          data: { systemSettingAttendanceFaultHrEmails },
        }
      }

      const systemSettingService = new SystemSettingService()
      const result = await systemSettingService.updateAttendanceFaultHrEmailsStatus(
        systemSettingId,
        systemSettingAttendanceFaultHrEmails
      )

      response.status(result.status)
      return {
        type: result.type,
        title: result.title,
        message: result.message,
        data: result.data,
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
   * /api/system-settings/:systemSettingId/employee-application-icon:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - System Settings
   *     summary: Upload employee application icon
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: systemSettingId
   *         schema:
   *           type: number
   *         description: System setting id
   *         required: true
   *     requestBody:
   *       content:
   *        multipart/form-data:
   *           schema:
   *             type: object
   *             properties:
   *               systemSettingEmployeeAplicationIcon:
   *                 type: string
   *                 format: binary
   *                 description: Employee application icon (512x512 PNG, white background, no transparency, max 5MB)
   *                 required: true
   *     responses:
   *       '200':
   *         description: Employee application icon uploaded successfully
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
   *                   properties:
   *                     fileUrl:
   *                       type: string
   *                       description: URL of the uploaded icon
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
   *                   description: Brief hint message about what failed
   *                 errorCode:
   *                   type: string
   *                   description: Error code for employee application icon validation
   *                   enum:
   *                     - SYS.CNFG.VAL.010
   *                     - SYS.CNFG.VAL.011
   *                     - SYS.CNFG.VAL.012
   *                     - SYS.CNFG.VAL.013
   *                     - SYS.CNFG.PRSS.014
   *                     - SYS.CNFG.PRSS.015
   *                     - SYS.CNFG.PRSS.018
   *                   example: SYS.CNFG.PRSS.018
   *                 data:
   *                   type: object
   *                   description: Error details
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
   *       '500':
   *         description: Server error during file upload or processing
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
   *                   description: Brief hint message about what failed
   *                 errorCode:
   *                   type: string
   *                   description: Error code for upload/delete operations
   *                   enum:
   *                     - SYS.CNFG.PRSS.016
   *                     - SYS.CNFG.PRSS.017
   *                   example: SYS.CNFG.PRSS.016
   *                 data:
   *                   type: object
   *                   description: Error details
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
  async uploadEmployeeApplicationIcon({ request, response }: HttpContext) {
    try {
      const systemSettingId = request.param('systemSettingId')
      if (!systemSettingId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'Missing data to process',
          message: 'The system setting id was not found',
          data: {},
        }
      }

      const currentSystemSetting = await SystemSetting.query()
        .whereNull('system_setting_deleted_at')
        .where('system_setting_id', systemSettingId)
        .first()

      if (!currentSystemSetting) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The system setting was not found',
          message: 'The system setting was not found with the entered ID',
          data: { systemSettingId },
        }
      }

      const validationOptions = {
        types: ['image'],
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
          title: 'Invalid image',
          message: SYSTEM_SETTING_ERROR_CODES.FILE_NOT_FOUND.message,
          errorCode: SYSTEM_SETTING_ERROR_CODES.FILE_NOT_FOUND.code,
          data: {},
        }
      }

      const validation = await this.validateEmployeeApplicationIcon(
        systemSettingEmployeeAplicationIcon
      )

      if (!validation.valid) {
        response.status(400)
        return {
          status: 400,
          type: 'warning',
          title: 'Invalid image',
          message: validation.message || 'Please upload a valid image',
          errorCode: validation.errorCode,
          data: {},
        }
      }

      const uploadService = new UploadService()

      if (currentSystemSetting.systemSettingEmployeeAplicationIcon) {
        const fileNameWithExt = path.basename(
          currentSystemSetting.systemSettingEmployeeAplicationIcon
        )
        const fileKey = `${Env.get('AWS_ROOT_PATH')}/system-settings/${fileNameWithExt}`
        const deleteResult = await uploadService.deleteFile(fileKey)
        if (deleteResult.status !== 200 && deleteResult.status !== 404) {
          response.status(500)
          return {
            status: 500,
            type: 'error',
            title: 'Delete error',
            message: SYSTEM_SETTING_ERROR_CODES.DELETE_ERROR.message,
            errorCode: SYSTEM_SETTING_ERROR_CODES.DELETE_ERROR.code,
            data: {},
          }
        }
      }

      const fileName = `${new Date().getTime()}_${systemSettingEmployeeAplicationIcon.clientName}`
      const fileUrl = await uploadService.fileUpload(
        systemSettingEmployeeAplicationIcon,
        'system-settings',
        fileName
      )

      if (fileUrl === 'S3Producer.fileUpload' || fileUrl === 'file_not_found') {
        response.status(500)
        return {
          status: 500,
          type: 'error',
          title: 'Upload error',
          message: SYSTEM_SETTING_ERROR_CODES.UPLOAD_ERROR.message,
          errorCode: SYSTEM_SETTING_ERROR_CODES.UPLOAD_ERROR.code,
          data: {},
        }
      }

      currentSystemSetting.systemSettingEmployeeAplicationIcon = fileUrl
      await currentSystemSetting.save()

      response.status(200)
      return {
        type: 'success',
        title: 'System settings',
        message: 'The employee application icon was uploaded successfully',
        data: {
          fileUrl: fileUrl,
          systemSetting: currentSystemSetting,
        },
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
   * /api/system-settings-get-payroll-config:
   *   get:
   *     security: []
   *     tags:
   *       - System Settings
   *     summary: get system setting get payroll config
   *     description: >
   *       Ruta pública. Mismo diseño "split por contexto" que
   *       `/api/system-settings-active` (USRH1783712837584): con header
   *       `X-Business-Unit-Id` + sesión válida, resuelve primero el
   *       System Setting de ESA empresa vía `resolveByBusinessUnitId`
   *       (fail-closed) y luego su configuración de nómina vigente; sin
   *       header o sin sesión, conserva el comportamiento global previo
   *       (`getActive()` sin filtrar por empresa).
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: header
   *         name: X-Business-Unit-Id
   *         schema:
   *           type: string
   *           format: uuid
   *         description: >
   *           Código público (`businessUnitPublicId`) de la unidad de negocio
   *           seleccionada. Opcional: solo se usa para resolver por empresa
   *           cuando además hay una sesión autenticada válida.
   *         required: false
   *     responses:
   *       '200':
   *         description: >
   *           Configuración de nómina vigente a la fecha (la de
   *           `system_setting_payroll_config_apply_since` más reciente que
   *           no sea futura) para el System Setting resuelto.
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   example: success
   *                 title:
   *                   type: string
   *                   example: System settings
   *                 message:
   *                   type: string
   *                   example: The system setting payroll config was found successfully
   *                 data:
   *                   type: object
   *                   properties:
   *                     systemSettingPayrollConfig:
   *                       type: object
   *                       nullable: true
   *                       description: Null si el System Setting resuelto no tiene ninguna configuración de nómina vigente
   *                       properties:
   *                         systemSettingPayrollConfigId:
   *                           type: integer
   *                         systemSettingId:
   *                           type: integer
   *                         systemSettingPayrollConfigPaymentType:
   *                           type: string
   *                         systemSettingPayrollConfigFixedDay:
   *                           type: string
   *                         systemSettingPayrollConfigFixedEveryNWeeks:
   *                           type: integer
   *                         systemSettingPayrollConfigNumberOfDaysToBePaid:
   *                           type: integer
   *                         systemSettingPayrollConfigApplySince:
   *                           type: string
   *                           format: date
   *             examples:
   *               conConfiguracionVigente:
   *                 summary: Configuración de nómina encontrada
   *                 value:
   *                   type: success
   *                   title: System settings
   *                   message: The system setting payroll config was found successfully
   *                   data:
   *                     systemSettingPayrollConfig:
   *                       systemSettingPayrollConfigId: 3
   *                       systemSettingId: 42
   *                       systemSettingPayrollConfigPaymentType: weekly
   *                       systemSettingPayrollConfigApplySince: '2026-01-01'
   *       '404':
   *         description: >
   *           No encontrado. Tres causas posibles, distinguibles por `type`
   *           y por la presencia de `key`/`code` (USRH1783712837584):
   *           1. `type: error`, `key: BU.NOT.001` — la unidad de negocio del
   *           header no existe o no está en el alcance del usuario.
   *           2. `type: error`, `code: SETTINGS.RESOLVE.NOT_FOUND_TENANT` —
   *           la empresa es válida pero no tiene su propio System Setting
   *           (fail-closed).
   *           3. `type: warning`, sin `key`/`code` — comportamiento global
   *           previo (sin header/sesión) cuando no existe ningún System
   *           Setting activo en el sistema.
   *         content:
   *           application/json:
   *             schema:
   *               oneOf:
   *                 - type: object
   *                   description: Unidad de negocio inválida o fuera de alcance
   *                   properties:
   *                     type:
   *                       type: string
   *                     title:
   *                       type: string
   *                     message:
   *                       type: string
   *                     key:
   *                       type: string
   *                       example: BU.NOT.001
   *                     data:
   *                       type: object
   *                 - type: object
   *                   description: Empresa válida sin System Setting propio
   *                   properties:
   *                     type:
   *                       type: string
   *                     title:
   *                       type: string
   *                     message:
   *                       type: string
   *                     key:
   *                       type: string
   *                       example: configuracion-no-encontrada
   *                     code:
   *                       type: string
   *                       example: SETTINGS.RESOLVE.NOT_FOUND_TENANT
   *                     data:
   *                       type: object
   *                 - type: object
   *                   description: Sin System Setting activo (comportamiento global previo)
   *                   properties:
   *                     type:
   *                       type: string
   *                       example: warning
   *                     title:
   *                       type: string
   *                     message:
   *                       type: string
   *                     data:
   *                       type: object
   *             examples:
   *               unidadNegocioNoEncontrada:
   *                 summary: BU.NOT.001 — header inválido o fuera de alcance
   *                 value:
   *                   type: error
   *                   title: Unidad de negocio no encontrada
   *                   message: El recurso solicitado no existe o no tienes acceso a él.
   *                   key: BU.NOT.001
   *                   data: {}
   *               empresaSinConfiguracion:
   *                 summary: SETTINGS.RESOLVE.NOT_FOUND_TENANT — fail-closed
   *                 value:
   *                   type: error
   *                   title: Configuración no encontrada
   *                   message: La empresa no tiene una configuración de System Settings propia.
   *                   key: configuracion-no-encontrada
   *                   code: SETTINGS.RESOLVE.NOT_FOUND_TENANT
   *                   data: {}
   *               sinSystemSettingActivo:
   *                 summary: Sin header/sesión y sin ningún System Setting activo
   *                 value:
   *                   type: warning
   *                   title: The system setting was not found
   *                   message: 'The system setting active was not found '
   *                   data: {}
   *       default:
   *         description: Unexpected error
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   example: error
   *                 title:
   *                   type: string
   *                   example: Server error
   *                 message:
   *                   type: string
   *                   example: An unexpected error has occurred on the server
   *                 error:
   *                   type: string
   *                   description: Detalle técnico del error inesperado (message de la excepción)
   */
  /**
   * USRH1783712837584: mismo diseño "split por contexto" que `getActive()` —
   * ver el helper `resolveOptionalTenantBusinessUnitId` para el detalle. Esta
   * ruta tampoco tiene `auth()`/`businessScope()` hoy; se mantiene así.
   */
  async getPayrollConfig(ctx: HttpContext) {
    const { response } = ctx
    try {
      const systemSettingService = new SystemSettingService()
      const { businessUnitId, notInScope } = await this.resolveOptionalTenantBusinessUnitId(ctx)

      if (notInScope) {
        response.status(404)
        return {
          type: 'error',
          title: 'Unidad de negocio no encontrada',
          message: 'El recurso solicitado no existe o no tienes acceso a él.',
          key: 'BU.NOT.001',
          data: {},
        }
      }

      let systemSetting: SystemSetting | null
      if (businessUnitId) {
        try {
          systemSetting = await systemSettingService.resolveByBusinessUnitId(businessUnitId)
        } catch (error) {
          if (!(error instanceof SystemSettingResolutionError)) throw error
          const resolved = resolveSystemSettingApiError(error, 404, ctx.i18n)
          response.status(resolved.status)
          return {
            type: 'error',
            title: resolved.title,
            message: resolved.message,
            key: resolved.key,
            code: resolved.code,
            data: {},
          }
        }
      } else {
        systemSetting = await systemSettingService.getActive()
      }

      if (!systemSetting) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The system setting was not found',
          message: 'The system setting active was not found ',
          data: { },
        }
      }
      const systemSettingPayrollConfig = await systemSettingService.getPayrollConfig(systemSetting.systemSettingId)
      response.status(200)
      return {
        type: 'success',
        title: 'System settings',
        message: 'The system setting payroll config was found successfully',
        data: { systemSettingPayrollConfig: systemSettingPayrollConfig },
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
