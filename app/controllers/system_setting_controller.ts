import { HttpContext } from '@adonisjs/core/http'
import SystemSetting from '#models/system_setting'
import SystemSettingService from '#services/system_setting_service'
import { createSystemSettingValidator } from '#validators/system_setting'
import UploadService from '#services/upload_service'
import path from 'node:path'
import Env from '#start/env'
export default class SystemSettingController {
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
