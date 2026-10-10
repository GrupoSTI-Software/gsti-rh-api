/**
 * Nombre con el que nace el departamento raíz de una empresa nueva.
 *
 * Es solo el nombre inicial: el tenant puede renombrarlo o reorganizar su
 * estructura debajo. Existe para que el organigrama de una empresa recién
 * creada no arranque vacío.
 */
export const DEFAULT_DEPARTMENT_NAME = 'Dirección General'

/** Código del departamento raíz sembrado (`department_code` es obligatorio). */
export const DEFAULT_DEPARTMENT_CODE = 'DG'
