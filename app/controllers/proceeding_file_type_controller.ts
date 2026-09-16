import { HttpContext } from '@adonisjs/core/http'
import BusinessUnit from '#models/business_unit'
import { ProceedingFileTypeFilterSearchInterface } from '../interfaces/proceeding_file_type_filter_search_interface.js'
import ProceedingFileTypeService from '#services/proceeding_file_type_service'
import ProceedingFileType from '#models/proceeding_file_type'
import {
  createProceedingFileTypeValidator,
  createEmployeeProceedingFileTypeValidator,
  createSystemSettingProceedingFileTypeValidator,
} from '#validators/proceeding_file_type'
import { ensureSecondaryPermission } from '#helpers/permission_gate_secondary'
import {
  EMPLOYEES_PROCEEDING_FILE_EMPLOYEE_AREA_WRITE_PERMISSION,
  EMPLOYEES_PROCEEDING_FILE_EMPLOYEE_AREA_DELETE_PERMISSION,
} from '#constants/employees_write_permission_declarations'
import { SYSTEM_SETTINGS_PROCEEDING_FILE_TYPE_WRITE_PERMISSION } from '#constants/system_settings_permission_declarations'

/** Área de expedientes del colaborador, tal como se guarda en la columna. */
const EMPLOYEE_AREA = 'employee'

/**
 * Vocabulario cerrado de áreas. Son las dos que el producto escribe hoy
 * (`ProceedingFileTypeService.createEmployeeType` y `createSystemSettingType`).
 */
const PROCEEDING_FILE_TYPE_AREAS = [EMPLOYEE_AREA, 'system-setting'] as const

/**
 * Normaliza el área antes de decidir y antes de escribirla.
 *
 * El área se comparaba en JS con `===` (sensible a mayúsculas) pero se consulta
 * en MySQL con `=` sobre una columna `utf8mb4_0900_ai_ci`, que NO lo es:
 * mandar `Employee` caía en la rama de empresa —pedía `system-settings:update`—
 * mientras `getByArea('employee')` sí devolvía la carpeta en el expediente del
 * COLABORADOR. Era la vía para colgar una carpeta de un expediente que no se
 * puede tocar, con solo el permiso del otro.
 *
 * @returns El área canónica, o `null` si no pertenece al vocabulario.
 */
function normalizeProceedingFileTypeArea(
  areaToUse: string | null | undefined
): (typeof PROCEEDING_FILE_TYPE_AREAS)[number] | null {
  const area = String(areaToUse ?? '')
    .trim()
    .toLowerCase()
  return PROCEEDING_FILE_TYPE_AREAS.find((candidate) => candidate === area) ?? null
}

/** Negativa 422 ante un área que no pertenece al vocabulario cerrado. */
const UNKNOWN_AREA_RESPONSE = {
  type: 'warning',
  title: 'Área de expediente inválida',
  message: `El área debe ser una de: ${PROCEEDING_FILE_TYPE_AREAS.join(', ')}.`,
  detail: `El área debe ser una de: ${PROCEEDING_FILE_TYPE_AREAS.join(', ')}.`,
  key: 'area-de-expediente-desconocida',
} as const

export default class ProceedingFileTypeController {
  /**
   * Exige el permiso del área a la que pertenece el tipo de expediente.
   *
   * El módulo `proceeding-file-types` está retirado y no tiene permisos: quien
   * es dueño de la operación es la pantalla que la dispara. Una carpeta del
   * expediente del colaborador la gobierna Empleados (`tab-expediente-write` /
   * `tab-expediente-delete`, los mismos que ya rigen sus archivos) y una del
   * expediente de la empresa la gobierna Ajustes Generales (`update`, como el
   * resto de los subrecursos de la ficha).
   *
   * Responde la negativa por su cuenta y devuelve `false`: quien llama solo
   * tiene que cortar.
   */
  private async ensureAreaPermission(
    ctx: HttpContext,
    areaToUse: string | null | undefined,
    intent: 'write' | 'delete'
  ): Promise<boolean> {
    // Se decide sobre el área NORMALIZADA: la columna es insensible a
    // mayúsculas, así que `Employee` y `employee` son la misma carpeta para la
    // consulta que arma el árbol del expediente y deben pedir el mismo permiso.
    if (normalizeProceedingFileTypeArea(areaToUse) === EMPLOYEE_AREA) {
      return ensureSecondaryPermission(
        ctx,
        intent === 'delete'
          ? EMPLOYEES_PROCEEDING_FILE_EMPLOYEE_AREA_DELETE_PERMISSION
          : EMPLOYEES_PROCEEDING_FILE_EMPLOYEE_AREA_WRITE_PERMISSION
      )
    }
    // Cualquier otra área es de la empresa. Fail-closed por omisión: un área
    // desconocida (incluida una fila legada con un área que ya no se escribe)
    // pide el permiso de Ajustes Generales, no pasa de largo.
    return ensureSecondaryPermission(ctx, SYSTEM_SETTINGS_PROCEEDING_FILE_TYPE_WRITE_PERMISSION)
  }

  /**
   * @swagger
   * /api/proceeding-file-types:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Proceeding File Types
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
  async index({ request, response, businessUnitScope }: HttpContext) {
    try {
      const search = request.input('search')
      const page = request.input('page', 1)
      const limit = request.input('limit', 100)
      const filters = {
        search: search,
        page: page,
        limit: limit,
      } as ProceedingFileTypeFilterSearchInterface
      const buUnits = businessUnitScope.length > 0
        ? await BusinessUnit.query().whereIn('business_unit_id', businessUnitScope).where('business_unit_active', 1)
        : []
      const businessSlugs = buUnits.map((bu) => bu.businessUnitSlug)
      const proceedingFileTypeService = new ProceedingFileTypeService()
      const proceedingFileTypes = await proceedingFileTypeService.index(filters, businessSlugs)
      response.status(200)
      return {
        type: 'success',
        title: 'Proceeding file types',
        message: 'The proceeding file types were found successfully',
        data: {
          proceedingFileTypes,
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
   * /api/proceeding-file-types/by-area/{areaToUse}:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Proceeding File Types
   *     summary: get proceeding file types by area to use
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: areaToUse
   *         schema:
   *           type: string
   *         description: Proceeding file type area to use
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
  async indexByArea({ request, response, businessUnitScope }: HttpContext) {
    try {
      const areaToUse = request.param('areaToUse')
      if (!areaToUse) {
        response.status(400)
        return {
          type: 'warning',
          title: 'Missing data to process',
          message: 'The proceeding file type area to use was not found',
          data: { areaToUse },
        }
      }
      const buUnits = businessUnitScope.length > 0
        ? await BusinessUnit.query().whereIn('business_unit_id', businessUnitScope).where('business_unit_active', 1)
        : []
      const businessSlugs = buUnits.map((bu) => bu.businessUnitSlug)
      const proceedingFileTypeService = new ProceedingFileTypeService()
      const proceedingFileTypes = await proceedingFileTypeService.indexByArea(areaToUse, businessSlugs)
      response.status(200)
      return {
        type: 'success',
        title: 'Proceeding file types',
        message: 'The proceeding file types were found successfully',
        data: {
          proceedingFileTypes,
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
   * @swagger
   * /api/proceeding-file-types:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Proceeding File Types
   *     summary: create new proceeding file type
   *     produces:
   *       - application/json
   *     requestBody:
   *       content:
   *        multipart/form-data:
   *           schema:
   *             type: object
   *             properties:
   *               proceedingFileTypeName:
   *                 type: string
   *                 description: Proceeding file type name
   *                 required: true
   *                 default: ''
   *               proceedingFileTypeSlug:
   *                 type: string
   *                 description: Proceeding file type slug
   *                 required: true
   *                 default: ''
   *               proceedingFileTypeAreaToUse:
   *                 type: string
   *                 description: Proceeding file type area to use
   *                 required: true
   *                 default: ''
   *                 enum: [employee, pilot, customer, aircraft, flight-attendant]
   *               proceedingFileTypeActive:
   *                 type: boolean
   *                 description: Proceeding file type status
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
  async store(ctx: HttpContext) {
    const { request, response, businessUnitScope } = ctx
    try {
      const proceedingFileTypeName = request.input('proceedingFileTypeName')
      const proceedingFileTypeSlug = request.input('proceedingFileTypeSlug')
      const proceedingFileTypeAreaToUse = request.input('proceedingFileTypeAreaToUse')
      const proceedingFileTypeActive = request.input('proceedingFileTypeActive')
      const buUnits = businessUnitScope.length > 0
        ? await BusinessUnit.query().whereIn('business_unit_id', businessUnitScope).where('business_unit_active', 1)
        : []
      const businessSlugs = buUnits.map((bu) => bu.businessUnitSlug)
      // El área se cierra al vocabulario ANTES de decidir y de escribir: así no
      // se puede fijar a mano una variante (`Employee`) que la consulta del
      // árbol sí trataría como del colaborador.
      const areaSolicitada = normalizeProceedingFileTypeArea(proceedingFileTypeAreaToUse)
      const proceedingFileType = {
        proceedingFileTypeName: proceedingFileTypeName,
        proceedingFileTypeSlug: proceedingFileTypeSlug,
        proceedingFileTypeAreaToUse: areaSolicitada,
        proceedingFileTypeActive:
          proceedingFileTypeActive &&
          (proceedingFileTypeActive === 'true' || Number.parseInt(proceedingFileTypeActive) === 1)
            ? 1
            : 0,
        proceedingFileTypeBusinessUnits: businessSlugs.join(','),
      } as ProceedingFileType
      // El área la trae el cuerpo: se exige el permiso de la que se pide crear.
      if (!(await this.ensureAreaPermission(ctx, proceedingFileTypeAreaToUse, 'write'))) {
        return
      }
      if (!areaSolicitada) {
        response.status(422)
        return { ...UNKNOWN_AREA_RESPONSE, data: { proceedingFileTypeAreaToUse } }
      }
      const proceedingFileTypeService = new ProceedingFileTypeService()
      const data = await request.validateUsing(createProceedingFileTypeValidator)
      const valid = await proceedingFileTypeService.verifyInfo(proceedingFileType)
      if (valid && valid.status !== 200) {
        response.status(valid.status)
        return {
          type: valid.type,
          title: valid.title,
          message: valid.message,
          data: { ...data },
        }
      }
      const newProceedingFileType = await proceedingFileTypeService.store(proceedingFileType)
      response.status(201)
      return {
        type: 'success',
        title: 'Proceeding file types',
        message: 'The proceeding file type was created successfully',
        data: { proceedingFileType: newProceedingFileType },
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
   * /api/proceeding-file-types/create-employee-type:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Proceeding File Types
   *     summary: create new employee proceeding file type with automatic slug generation and business units
   *     produces:
   *       - application/json
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               proceedingFileTypeName:
   *                 type: string
   *                 description: Proceeding file type name (slug will be auto-generated)
   *                 required: true
   *                 example: "Documentos de Contratación"
   *               proceedingFileTypeBusinessUnits:
   *                 type: string
   *                 description: Business units for the proceeding file type (automatically set from the user's accessible business units)
   *                 required: false
   *                 example: "sae,sae-siler,sae-quorum"
   *               parentId:
   *                 type: number
   *                 description: Parent proceeding file type ID (optional)
   *                 required: false
   *                 example: 1
   *               proceedingFileTypeActive:
   *                 type: boolean
   *                 description: Proceeding file type status
   *                 required: false
   *                 default: true
   *               proceedingFileTypeIsExclusive:
   *                 type: boolean
   *                 description: Indicates if the proceeding file type is exclusive to an employee
   *                 required: false
   *                 default: false
   *               employeeId:
   *                 type: number
   *                 description: Employee ID (required when proceedingFileTypeIsExclusive is true)
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
   *                   properties:
   *                     proceedingFileType:
   *                       $ref: '#/components/schemas/ProceedingFileType'
   *                     proceedingFileTypeProperty:
   *                       $ref: '#/components/schemas/ProceedingFileTypeProperty'
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
   *       '404':
   *         description: Parent proceeding file type not found
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
  async createEmployeeType({ request, response, businessUnitScope }: HttpContext) {
    try {
      // Validar los datos de entrada
      const data = await request.validateUsing(createEmployeeProceedingFileTypeValidator)

      // Convertir proceedingFileTypeIsExclusive a booleano si viene como número
      const isExclusive = request.input('proceedingFileTypeIsExclusive')
      const proceedingFileTypeIsExclusive = isExclusive === true || isExclusive === 'true' || isExclusive === 1 || isExclusive === '1'

      const buUnits = businessUnitScope.length > 0
        ? await BusinessUnit.query().whereIn('business_unit_id', businessUnitScope).where('business_unit_active', 1)
        : []
      const businessSlugs = buUnits.map((bu) => bu.businessUnitSlug)
      const proceedingFileTypeService = new ProceedingFileTypeService()
      const result = await proceedingFileTypeService.createEmployeeType({
        proceedingFileTypeName: data.proceedingFileTypeName,
        parentId: data.parentId,
        proceedingFileTypeActive: data.proceedingFileTypeActive,
        proceedingFileTypeIsExclusive: proceedingFileTypeIsExclusive,
        employeeId: data.employeeId || request.input('employeeId'),
      }, businessSlugs)

      if (result.status !== 201) {
        response.status(result.status)
        return {
          type: result.type,
          title: result.title,
          message: result.message,
          data: result.data,
        }
      }

      response.status(201)
      return {
        type: 'success',
        title: 'Proceeding file type created',
        message: 'The employee proceeding file type was created successfully with its default property',
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
   * /api/proceeding-file-types/create-system-setting-type:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Proceeding File Types
   *     summary: Crear tipo de archivo de procedimiento para configuración del sistema (área system-setting)
   *     produces:
   *       - application/json
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               proceedingFileTypeName:
   *                 type: string
   *                 description: Nombre del tipo (el slug se genera automáticamente)
   *               proceedingFileTypeBusinessUnits:
   *                 type: string
   *                 description: Opcional; se asignan automáticamente desde las unidades de negocio accesibles del usuario
   *               parentId:
   *                 type: number
   *                 description: ID del tipo padre (debe ser también system-setting)
   *               proceedingFileTypeActive:
   *                 type: boolean
   *                 default: true
   *     responses:
   *       '201':
   *         description: Creado correctamente
   *       '400':
   *         description: Validación o slug duplicado
   *       '404':
   *         description: Tipo padre no encontrado
   */
  async createSystemSettingType({ request, response, businessUnitScope }: HttpContext) {
    try {
      const data = await request.validateUsing(createSystemSettingProceedingFileTypeValidator)
      const buUnits = businessUnitScope.length > 0
        ? await BusinessUnit.query().whereIn('business_unit_id', businessUnitScope).where('business_unit_active', 1)
        : []
      const businessSlugs = buUnits.map((bu) => bu.businessUnitSlug)
      const proceedingFileTypeService = new ProceedingFileTypeService()
      const result = await proceedingFileTypeService.createSystemSettingType({
        proceedingFileTypeName: data.proceedingFileTypeName,
        parentId: data.parentId,
        proceedingFileTypeActive: data.proceedingFileTypeActive,
      }, businessSlugs)

      if (result.status !== 201) {
        response.status(result.status)
        return {
          type: result.type,
          title: result.title,
          message: result.message,
          data: result.data,
        }
      }

      response.status(201)
      return {
        type: 'success',
        title: 'Proceeding file type created',
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
   * /api/proceeding-file-types/{proceedingFileTypeId}:
   *   put:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Proceeding File Types
   *     summary: update proceeding file types
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: proceedingFileTypeId
   *         schema:
   *           type: number
   *         description: proceeding file type id
   *         required: true
   *     requestBody:
   *       content:
   *        multipart/form-data:
   *           schema:
   *             type: object
   *             properties:
   *               proceedingFileTypeName:
   *                 type: string
   *                 description: Proceeding file type name
   *                 required: true
   *                 default: ''
   *               proceedingFileTypeSlug:
   *                 type: string
   *                 description: Proceeding file type slug
   *                 required: true
   *                 default: ''
   *               proceedingFileTypeAreaToUse:
   *                 type: string
   *                 description: Proceeding file type area to use
   *                 required: true
   *                 default: ''
   *                 enum: [employee, pilot, customer, aircraft, flight-attendant]
   *               proceedingFileTypeActive:
   *                 type: boolean
   *                 description: Proceeding file type status
   *                 required: true
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
  async update(ctx: HttpContext) {
    const { request, response, businessUnitScope } = ctx
    try {
      const proceedingFileTypeId = request.param('proceedingFileTypeId')
      const proceedingFileTypeName = request.input('proceedingFileTypeName')
      const proceedingFileTypeSlug = request.input('proceedingFileTypeSlug')
      const proceedingFileTypeAreaToUse = request.input('proceedingFileTypeAreaToUse')
      const proceedingFileTypeActive = request.input('proceedingFileTypeActive')
      const buUnits = businessUnitScope.length > 0
        ? await BusinessUnit.query().whereIn('business_unit_id', businessUnitScope).where('business_unit_active', 1)
        : []
      const businessSlugs = buUnits.map((bu) => bu.businessUnitSlug)
      // Igual que en el alta: el área del cuerpo se cierra al vocabulario antes
      // de decidir el permiso del destino y antes de persistirla.
      const areaSolicitada = normalizeProceedingFileTypeArea(proceedingFileTypeAreaToUse)
      const proceedingFileType = {
        proceedingFileTypeId: proceedingFileTypeId,
        proceedingFileTypeName: proceedingFileTypeName,
        proceedingFileTypeSlug: proceedingFileTypeSlug,
        proceedingFileTypeAreaToUse: areaSolicitada,
        proceedingFileTypeActive:
          proceedingFileTypeActive &&
          (proceedingFileTypeActive === 'true' || Number.parseInt(proceedingFileTypeActive) === 1)
            ? 1
            : 0,
        proceedingFileTypeBusinessUnits: businessSlugs.join(','),
      } as ProceedingFileType
      if (!proceedingFileTypeId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'Missing data to process',
          message: 'The proceeding file type Id was not found',
          data: { ...proceedingFileType },
        }
      }
      const currentProceedingFileType = await ProceedingFileType.query()
        .whereNull('proceeding_file_type_deleted_at')
        .where('proceeding_file_type_id', proceedingFileTypeId)
        .first()
      if (!currentProceedingFileType) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The proceeding file type was not found',
          message: 'The proceeding file type was not found with the entered ID',
          data: { ...proceedingFileType },
        }
      }
      // Manda el área GUARDADA, que es la del expediente al que la carpeta
      // pertenece hoy. Si además se pide moverla a otra área, se exige también
      // el permiso del destino: mover no puede ser la vía para escribir en un
      // expediente que no se puede tocar.
      if (
        !(await this.ensureAreaPermission(
          ctx,
          currentProceedingFileType.proceedingFileTypeAreaToUse,
          'write'
        ))
      ) {
        return
      }
      if (proceedingFileTypeAreaToUse && !areaSolicitada) {
        response.status(422)
        return { ...UNKNOWN_AREA_RESPONSE, data: { proceedingFileTypeAreaToUse } }
      }
      // La comparación va entre áreas NORMALIZADAS: `Employee` sobre una carpeta
      // de empresa ES un movimiento al expediente del colaborador y debe pedir
      // su permiso, aunque las cadenas crudas difieran solo en mayúsculas.
      if (
        areaSolicitada &&
        areaSolicitada !==
          normalizeProceedingFileTypeArea(currentProceedingFileType.proceedingFileTypeAreaToUse) &&
        !(await this.ensureAreaPermission(ctx, areaSolicitada, 'write'))
      ) {
        return
      }
      const proceedingFileTypeService = new ProceedingFileTypeService()
      const data = await request.validateUsing(createProceedingFileTypeValidator)
      const valid = await proceedingFileTypeService.verifyInfo(proceedingFileType)
      if (valid && valid.status !== 200) {
        response.status(valid.status)
        return {
          type: valid.type,
          title: valid.title,
          message: valid.message,
          data: { ...data },
        }
      }
      const updateProceedingFileType = await proceedingFileTypeService.update(
        currentProceedingFileType,
        proceedingFileType
      )
      response.status(200)
      return {
        type: 'success',
        title: 'Proceeding file types',
        message: 'The proceeding file type was updated successfully',
        data: { proceedingFileType: updateProceedingFileType },
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
   * /api/proceeding-file-types/{proceedingFileTypeId}:
   *   delete:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Proceeding File Types
   *     summary: delete proceeding file type
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: proceedingFileTypeId
   *         schema:
   *           type: number
   *         description: proceeding file type id
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
      const proceedingFileTypeId = request.param('proceedingFileTypeId')
      if (!proceedingFileTypeId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'Missing data to process',
          message: 'The proceeding file type Id was not found',
          data: { proceedingFileTypeId },
        }
      }
      const currentProceedingFileType = await ProceedingFileType.query()
        .whereNull('proceeding_file_type_deleted_at')
        .where('proceeding_file_type_id', proceedingFileTypeId)
        .first()
      if (!currentProceedingFileType) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The proceeding file type was not found',
          message: 'The proceeding file type was not found with the entered ID',
          data: { proceedingFileTypeId },
        }
      }
      if (
        !(await this.ensureAreaPermission(
          ctx,
          currentProceedingFileType.proceedingFileTypeAreaToUse,
          'delete'
        ))
      ) {
        return
      }
      const proceedingFileTypeService = new ProceedingFileTypeService()
      const deleteProceedingFileType =
        await proceedingFileTypeService.delete(currentProceedingFileType)
      if (deleteProceedingFileType) {
        response.status(200)
        return {
          type: 'success',
          title: 'Proceeding file types',
          message: 'The proceeding file type was deleted successfully',
          data: { proceedingFileType: deleteProceedingFileType },
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
   * /api/proceeding-file-types/{proceedingFileTypeId}:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Proceeding File Types
   *     summary: get proceeding file type by id
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: proceedingFileTypeId
   *         schema:
   *           type: number
   *         description: proceeding file type id
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
      const proceedingFileTypeId = request.param('proceedingFileTypeId')
      if (!proceedingFileTypeId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'Missing data to process',
          message: 'The proceeding file type Id was not found',
          data: { proceedingFileTypeId },
        }
      }
      const proceedingFileTypeService = new ProceedingFileTypeService()
      const showProceedingFileType = await proceedingFileTypeService.show(proceedingFileTypeId)
      if (!showProceedingFileType) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The proceeding file type was not found',
          message: 'The proceeding file type was not found with the entered ID',
          data: { proceedingFileTypeId },
        }
      } else {
        response.status(200)
        return {
          type: 'success',
          title: 'Proceeding file types',
          message: 'The proceeding file type was found successfully',
          data: { proceedingFileType: showProceedingFileType },
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
   * /api/proceeding-file-types/{proceedingFileTypeId}/get-legacy-emails:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Proceeding File Types
   *     summary: get legacy emails to proceeding file type by id
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: proceedingFileTypeId
   *         schema:
   *           type: number
   *         description: proceeding file type id
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
  async getLegacyEmails({ request, response }: HttpContext) {
    try {
      const proceedingFileTypeId = request.param('proceedingFileTypeId')
      if (!proceedingFileTypeId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'Missing data to process',
          message: 'The proceeding file type Id was not found',
          data: { proceedingFileTypeId },
        }
      }
      const proceedingFileTypeService = new ProceedingFileTypeService()
      const proceedingFileTypeEmails =
        await proceedingFileTypeService.getLegacyEmails(proceedingFileTypeId)
      response.status(200)
      return {
        type: 'success',
        title: 'Proceeding file types',
        message: 'The proceeding file type email were found successfully',
        data: { proceedingFileTypeEmails: proceedingFileTypeEmails },
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
