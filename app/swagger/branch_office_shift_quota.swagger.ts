/**
 * Schemas OpenAPI del módulo de cuotas de plantilla por sucursal y turno.
 */
export {}

/**
 * @swagger
 * components:
 *   schemas:
 *     BranchOfficeShiftQuotaShiftRef:
 *       type: object
 *       required: [shiftId, shiftName]
 *       properties:
 *         shiftId:
 *           type: integer
 *           example: 3
 *         shiftName:
 *           type: string
 *           example: Nocturno
 *
 *     BranchOfficeShiftQuotaItem:
 *       type: object
 *       required: [branchOfficeShiftQuotaId, shift, required, minimum]
 *       properties:
 *         branchOfficeShiftQuotaId:
 *           type: integer
 *           example: 1
 *         shift:
 *           $ref: '#/components/schemas/BranchOfficeShiftQuotaShiftRef'
 *         required:
 *           type: integer
 *           minimum: 1
 *           example: 3
 *         minimum:
 *           type: integer
 *           minimum: 1
 *           example: 2
 *
 *     BranchOfficeShiftQuotaInputItem:
 *       type: object
 *       required: [shiftId, required, minimum]
 *       properties:
 *         shiftId:
 *           type: integer
 *           minimum: 1
 *           example: 3
 *         required:
 *           type: integer
 *           minimum: 1
 *           example: 3
 *         minimum:
 *           type: integer
 *           minimum: 1
 *           example: 2
 *
 *     BranchOfficeShiftQuotasReplace:
 *       type: object
 *       properties:
 *         quotas:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/BranchOfficeShiftQuotaInputItem'
 *       example:
 *         quotas:
 *           - shiftId: 3
 *             required: 3
 *             minimum: 2
 *
 *     BranchOfficeShiftQuotasSuccess:
 *       type: object
 *       required: [type, title, message, data]
 *       properties:
 *         type:
 *           type: string
 *           enum: [success]
 *         title:
 *           type: string
 *         message:
 *           type: string
 *         data:
 *           type: object
 *           required: [quotas]
 *           properties:
 *             quotas:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/BranchOfficeShiftQuotaItem'
 *       example:
 *         type: success
 *         title: Branch Office Shift Quotas
 *         message: Cuotas guardadas correctamente
 *         data:
 *           quotas:
 *             - branchOfficeShiftQuotaId: 1
 *               shift:
 *                 shiftId: 3
 *                 shiftName: Nocturno
 *               required: 3
 *               minimum: 2
 *
 *     BranchOfficeShiftQuotaApiError:
 *       type: object
 *       required: [type, title, message, errorCode, data]
 *       properties:
 *         type:
 *           type: string
 *           enum: [error]
 *         title:
 *           type: string
 *         message:
 *           type: string
 *         detail:
 *           type: string
 *         key:
 *           type: string
 *         errorCode:
 *           type: string
 *         data:
 *           nullable: true
 *
 *     BranchOfficeShiftQuotaErrorSucursalNoEncontrada:
 *       allOf:
 *         - $ref: '#/components/schemas/BranchOfficeShiftQuotaApiError'
 *       example:
 *         type: error
 *         title: Sucursal no encontrada
 *         message: Sucursal no encontrada o no disponible para esta instancia del sistema
 *         detail: Sucursal no encontrada o no disponible para esta instancia del sistema
 *         key: sucursal-no-encontrada
 *         errorCode: BRCH.SQ.NF.BRCH.001
 *         data: null
 *
 *     BranchOfficeShiftQuotaErrorTurnoNoEncontrado:
 *       allOf:
 *         - $ref: '#/components/schemas/BranchOfficeShiftQuotaApiError'
 *       example:
 *         type: error
 *         title: Turno no encontrado
 *         message: No se encontró el turno del item 1 (id 99999) para esta unidad
 *         detail: No se encontró el turno del item 1 (id 99999) para esta unidad
 *         key: turno-no-encontrado
 *         errorCode: BRCH.SQ.NF.SHIFT.001
 *         data: null
 *
 *     BranchOfficeShiftQuotaErrorCuotaInvalida:
 *       allOf:
 *         - $ref: '#/components/schemas/BranchOfficeShiftQuotaApiError'
 *       example:
 *         type: error
 *         title: Cuota inválida
 *         message: "El item 1 (turno 3): el mínimo no puede superar la plantilla requerida y ambos deben ser al menos 1"
 *         detail: "El item 1 (turno 3): el mínimo no puede superar la plantilla requerida y ambos deben ser al menos 1"
 *         key: cuota-invalida
 *         errorCode: BRCH.SQ.VAL.QUOTA.001
 *         data: null
 *
 *     BranchOfficeShiftQuotaErrorShiftIdDuplicado:
 *       allOf:
 *         - $ref: '#/components/schemas/BranchOfficeShiftQuotaApiError'
 *       example:
 *         type: error
 *         title: Turno repetido en el lote
 *         message: "shiftId repetido en los items: 1, 2"
 *         detail: "Los items 1, 2 repiten el mismo shiftId"
 *         errorCode: BRCH.SQ.VAL.DUP.001
 *         data: null
 *
 *     BranchOfficeShiftQuotaErrorValInput:
 *       allOf:
 *         - $ref: '#/components/schemas/BranchOfficeShiftQuotaApiError'
 *       example:
 *         type: error
 *         title: Datos inválidos
 *         message: El parámetro branchOfficeId debe ser un entero positivo
 *         detail: 'Valor recibido: "a". Use un número entero mayor o igual a 1.'
 *         errorCode: BRCH.SQ.VAL.BRCH.001
 *         data: null
 *
 *     BranchOfficeShiftQuotaErrorUnauthorized:
 *       allOf:
 *         - $ref: '#/components/schemas/BranchOfficeShiftQuotaApiError'
 *       example:
 *         type: error
 *         title: Error
 *         message: Unauthorized access
 *         errorCode: BRCH.SQ.SYS.001
 *         data: null
 */
