/**
 * Tipos de correo de la credencial de acceso (USRH1789698261612). Espejo EXACTO
 * del ENUM de `1771254280625_create_add_user_email_type_to_users_table.ts`:
 * ENUM('institutional','personal') NOT NULL DEFAULT 'institutional'.
 * `institutional` → el espejo escribe `employees.employee_business_email`.
 * `personal`      → el espejo escribe `people.person_email`.
 */
export const USER_EMAIL_TYPES = ['institutional', 'personal'] as const
export type UserEmailTypeValue = (typeof USER_EMAIL_TYPES)[number]
/** Solo para el ALTA. En la edición, sin campo, se conserva el tipo guardado. */
export const USER_EMAIL_TYPE_DEFAULT: UserEmailTypeValue = 'institutional'
