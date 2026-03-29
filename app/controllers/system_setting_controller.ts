import { HttpContext } from '@adonisjs/core/http'
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
  async index({ response }: HttpContext) {
    try {
      // const search = request.input('search')
      // const page = request.input('page', 1)
      // const limit = request.input('limit', 100)
      // const filters = {
      //   search: search,
      //   page: page,
      //   limit: limit,
      // } as SystemSettingFilterSearchInterface
      const systemSettingService = new SystemSettingService()
      const systemSettings = await systemSettingService.index()
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
  async store({ request, response }: HttpContext) {
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
      const parseNullable = (value: any) =>
        value === 'null' || value === undefined ? null : value
      
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
      } as SystemSetting
      const systemSettingService = new SystemSettingService()
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
      const validActive = await systemSettingService.verifyActiveStore(systemSetting)
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
      const businessConf = `${Env.get('SYSTEM_BUSINESS')}`
      systemSetting.systemSettingBusinessUnits = businessConf
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
  async update({ request, response }: HttpContext) {
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
      const parseNullable = (value: any) =>
        value === 'null' || value === undefined ? null : value
      
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
      const validActive = await systemSettingService.verifyActiveUpdate(
        systemSetting,
        currentSystemSetting
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
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - System Settings
   *     summary: get system setting active
   *     produces:
   *       - application/json
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
  async getActive({ response }: HttpContext) {
    try {
      const systemSettingService = new SystemSettingService()
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
   * /api/system-settings/assign-system-modules/{systemSettingId}:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - System Settings
   *     summary: assign system modules to system setting
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: systemSettingId
   *         schema:
   *           type: number
   *         description: SystemSetting Id
   *         required: true
   *     requestBody:
   *       content:
   *          application/json:
   *           schema:
   *             type: object
   *             properties:
   *               systemModules:
   *                 type: array
   *                 description: System modules
   *                 required: true
   *                 default: []
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
  async assignSystemModules({ request, response }: HttpContext) {
    try {
      const systemSettingId = request.param('systemSettingId')
      const data = request.all()
      const systemSetting = await SystemSetting.query()
        .whereNull('system_setting_deleted_at')
        .where('system_setting_id', systemSettingId)
        .first()
      if (!systemSetting) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The system setting was not found',
          message: 'The system setting was not found with the entered ID',
          data: { ...request.all() },
        }
      }
      const systemSettingService = new SystemSettingService()
      const systemSettingModules = await systemSettingService.assignSystemModules(
        systemSettingId,
        data.systemModules
      )
      response.status(201)
      return {
        type: 'success',
        title: 'System setting system modules',
        message: 'The system setting modules were assigned successfully',
        data: { systemSettingModules: systemSettingModules },
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
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - System Settings
   *     summary: get system setting get payroll config
   *     produces:
   *       - application/json
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
  async getPayrollConfig({ response }: HttpContext) {
    try {
      const systemSettingService = new SystemSettingService()
      const systemSetting = await systemSettingService.getActive()
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
