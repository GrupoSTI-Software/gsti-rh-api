/**
 * Schemas OpenAPI del endpoint GET /api/v1/attendance-stats/coverage.
 */
export {}

/**
 * @swagger
 * components:
 *   schemas:
 *     AttendanceCoverageCandidate:
 *       type: object
 *       required:
 *         - employeeId
 *         - name
 *         - source
 *         - originLeftBelowMin
 *       properties:
 *         employeeId:
 *           type: integer
 *           example: 7
 *         name:
 *           type: string
 *           example: Gloria Planta Siete
 *         source:
 *           type: string
 *           enum: [rest_same_site, loan_other_site]
 *           example: rest_same_site
 *         originLeftBelowMin:
 *           type: boolean
 *           example: false
 *         originBranchOfficeId:
 *           type: integer
 *           nullable: true
 *           example: 1
 *         originBranchOfficeName:
 *           type: string
 *           nullable: true
 *           description: Nombre del sitio de origen (sitio efectivo del candidato).
 *           example: Planta Monterrey
 *
 *     AttendanceCoverageShift:
 *       type: object
 *       required:
 *         - shiftId
 *         - label
 *         - required
 *         - min
 *         - assigned
 *         - present
 *         - missing
 *         - status
 *         - candidates
 *       properties:
 *         shiftId:
 *           type: integer
 *           example: 3
 *         label:
 *           type: string
 *           example: Turno Nocturno
 *         required:
 *           type: integer
 *           example: 4
 *         min:
 *           type: integer
 *           example: 3
 *         assigned:
 *           type: integer
 *           example: 4
 *         present:
 *           type: integer
 *           example: 3
 *         missing:
 *           type: integer
 *           example: 1
 *         status:
 *           type: string
 *           enum: [green, amber, red, no_quota]
 *           example: amber
 *         candidates:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/AttendanceCoverageCandidate'
 *
 *     AttendanceCoverageSite:
 *       type: object
 *       required:
 *         - branchOfficeId
 *         - name
 *         - shifts
 *       properties:
 *         branchOfficeId:
 *           type: integer
 *           example: 1
 *         name:
 *           type: string
 *           example: Planta Monterrey
 *         shifts:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/AttendanceCoverageShift'
 *
 *     AttendanceCoverageData:
 *       type: object
 *       required:
 *         - day
 *         - sites
 *       properties:
 *         day:
 *           type: string
 *           format: date
 *           example: "2026-06-14"
 *         sites:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/AttendanceCoverageSite'
 *
 *     AttendanceCoverageSuccess:
 *       type: object
 *       required:
 *         - type
 *         - title
 *         - message
 *         - data
 *       properties:
 *         type:
 *           type: string
 *           enum: [success]
 *         title:
 *           type: string
 *         message:
 *           type: string
 *         data:
 *           $ref: '#/components/schemas/AttendanceCoverageData'
 *       example:
 *         type: success
 *         title: Recursos
 *         message: Los recursos fueron encontrados con exito
 *         data:
 *           day: "2026-06-14"
 *           sites:
 *             - branchOfficeId: 1
 *               name: Demo Cobertura Planta Monterrey
 *               shifts:
 *                 - shiftId: 2
 *                   label: Turno Matutino
 *                   required: 2
 *                   min: 2
 *                   assigned: 2
 *                   present: 2
 *                   missing: 0
 *                   status: green
 *                   candidates: []
 *
 *     AttendanceCoverageApiError:
 *       type: object
 *       required:
 *         - type
 *         - title
 *         - message
 *       properties:
 *         type:
 *           type: string
 *           enum: [error]
 *         title:
 *           type: string
 *         message:
 *           type: string
 *         key:
 *           type: string
 *         details:
 *           type: object
 *           nullable: true
 *         data:
 *           nullable: true
 *       example:
 *         type: error
 *         title: Error de validacion
 *         message: La cobertura requiere un unico dia
 *         key: dia-unico-requerido
 *         data: null
 */
