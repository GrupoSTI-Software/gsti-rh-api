/**
 * Schemas OpenAPI del módulo de asignaciones de trabajadores a contratos REPSE.
 */
export {}

/**
 * @swagger
 * components:
 *   schemas:
 *     AsignacionContratoAdvertencia:
 *       type: object
 *       required: [key, detail]
 *       properties:
 *         key:
 *           type: string
 *           example: porcentaje-dedicacion-excedido
 *         detail:
 *           type: string
 *           example: El empleado suma 120.00% de dedicación en contratos vigentes solapados
 *
 *     AsignacionContratoEmpleado:
 *       type: object
 *       required: [id, nombre, nss]
 *       properties:
 *         id:
 *           type: integer
 *         nombre:
 *           type: string
 *         nss:
 *           type: string
 *           nullable: true
 *
 *     AsignacionContratoEspecializadoListItem:
 *       type: object
 *       required:
 *         - id
 *         - contratoServicioEspecializadoId
 *         - empleado
 *         - fechaInicio
 *         - fechaFin
 *         - porcentajeTiempo
 *       properties:
 *         id:
 *           type: integer
 *         contratoServicioEspecializadoId:
 *           type: integer
 *         empleado:
 *           $ref: '#/components/schemas/AsignacionContratoEmpleado'
 *         fechaInicio:
 *           type: string
 *           format: date
 *         fechaFin:
 *           type: string
 *           format: date
 *           nullable: true
 *         porcentajeTiempo:
 *           type: string
 *           example: '100.00'
 *
 *     AsignacionContratoEspecializadoResource:
 *       allOf:
 *         - $ref: '#/components/schemas/AsignacionContratoEspecializadoListItem'
 *         - type: object
 *           required: [advertencias]
 *           properties:
 *             advertencias:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/AsignacionContratoAdvertencia'
 *
 *     AsignacionesContratoBulkCreate:
 *       type: object
 *       required: [asignaciones]
 *       properties:
 *         asignaciones:
 *           type: array
 *           minItems: 1
 *           items:
 *             type: object
 *             required: [employeeId, fechaInicio]
 *             properties:
 *               employeeId:
 *                 type: integer
 *                 minimum: 1
 *               fechaInicio:
 *                 type: string
 *                 format: date
 *               fechaFin:
 *                 type: string
 *                 format: date
 *                 nullable: true
 *               porcentajeTiempo:
 *                 type: number
 *                 minimum: 0.01
 *                 maximum: 100
 *
 *     AsignacionContratoUpdate:
 *       type: object
 *       properties:
 *         fechaInicio:
 *           type: string
 *           format: date
 *         fechaFin:
 *           type: string
 *           format: date
 *           nullable: true
 *         porcentajeTiempo:
 *           type: number
 *           minimum: 0.01
 *           maximum: 100
 *
 *     AsignacionesContratoCreateSuccess:
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
 *           properties:
 *             asignaciones:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/AsignacionContratoEspecializadoResource'
 *
 *     AsignacionesContratoListSuccess:
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
 *           properties:
 *             asignaciones:
 *               type: object
 *               properties:
 *                 meta:
 *                   $ref: '#/components/schemas/ComplianceRepsePaginationMeta'
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/AsignacionContratoEspecializadoListItem'
 *
 *     AsignacionContratoUpdateSuccess:
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
 *           properties:
 *             asignacion:
 *               $ref: '#/components/schemas/AsignacionContratoEspecializadoResource'
 */
