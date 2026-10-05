# Prueba manual API — Blindar el espejo entre el correo de la persona y la credencial de acceso

**Problema:** el correo de la persona y el correo con el que entra al sistema deberían ser el mismo cuando la cuenta es personal, y el correo de trabajo del colaborador cuando la cuenta es institucional. Hoy se copian entre sí por seis caminos distintos, cada uno con reglas propias: unos no copian, otros copian al registro equivocado, otros guardan un correo que ya usa otra persona, y si algo falla a medias queda guardada una mitad sí y otra no.

**Solución:** los seis caminos siguen la misma regla. La cuenta personal se copia con el correo personal y la institucional con el de trabajo; antes de guardar se revisa que el correo esté libre y que quien edita administre esa cuenta; y las dos mitades se guardan juntas o ninguna.

Ejemplo: es como la credencial de la biblioteca y la ficha del alumno en la dirección: si cambias el correo en una y no en la otra, los avisos llegan a un buzón viejo. Ahora las dos se cambian juntas, y si el correo nuevo ya es de otro alumno no se cambia ninguna.

Se prueba con un cliente de API (Postman, Insomnia, Bruno). La autenticación se asume resuelta por tu cliente: se envía el token del usuario en el header `Authorization: Bearer <token>`.

**URL base:** `http://127.0.0.1:3333`

**Headers obligatorios.** Cada petición lleva, además del token, el header `X-Business-Unit-Id` con el identificador público de la empresa del administrador (resuelto en Preparar). Sin ese header el sistema responde error antes de llegar al caso que se prueba.

## 1. Preparar

Ejecutar el seeder compartido:

```bash
node ace db:seed --files=database/seeders/_tmp_do_not_commit_qa_seeder.ts
```

| | Correo | Contraseña | Variante |
|---|---|---|---|
| **A** | `qa-espejo-admin@gsti-tests.local` | `password` | Administra usuarios y el expediente del colaborador, con permiso de cambiar datos de contacto |
| **B** | `qa-espejo-limitado@gsti-tests.local` | `password` | Solo administra usuarios; sin permiso de cambiar datos de contacto |

Ids por consulta, nunca escritos a mano:

```sql
SELECT person_id, person_lastname FROM people WHERE person_firstname = 'QAEspejo' ORDER BY person_lastname;
SELECT user_id, user_email, person_id, role_id FROM users WHERE user_email LIKE 'qa-espejo-%' AND user_deleted_at IS NULL ORDER BY user_email;
SELECT employee_id, employee_code, employee_first_name, employee_last_name, employee_second_last_name, company_id, department_id, position_id, employee_type_id, business_unit_id, payroll_business_unit_id
FROM employees WHERE employee_code LIKE 'QA-ESPEJO-EMP-%';
SELECT role_id FROM roles WHERE role_slug = 'qa-espejo-limitado' AND role_deleted_at IS NULL;
SELECT b.business_unit_public_id
FROM business_units b
JOIN business_unit_users bu ON bu.business_unit_id = b.business_unit_id
JOIN users u ON u.user_id = bu.user_id
WHERE u.user_email = 'qa-espejo-admin@gsti-tests.local' AND u.user_deleted_at IS NULL;
```

No se provocan aquí la negativa de datos sensibles que llega después de haber guardado la cuenta, dos ediciones simultáneas del mismo correo ni el reverso del salario cuando el correo de trabajo choca.

## 2. Escenarios

Cada escenario usa un `Nombre` (el `person_lastname` de la primera consulta, p. ej. `Personal01`). Los ids de las rutas y de los bodies se escriben `<Nombre.personId>`, `<Nombre.userId>` o `<Nombre.employeeId>`:

- **`<Nombre.personId>`:** columna `person_id` de la **primera** consulta, en el renglón de ese `Nombre`.
- **`<Nombre.userId>`:** en la **segunda** consulta, el renglón cuya columna `person_id` sea igual al `<Nombre.personId>` que ya anotaste. Búscalo por `person_id`, no por correo: varios escenarios cambian el correo de la cuenta a la mitad del recorrido.
- **`<Nombre.employeeId>`:** en la **tercera** consulta, el renglón cuyo `employee_code` es el que indica el escenario (p. ej. `QA-ESPEJO-EMP-03`). Es la columna `employee_id` (numérica) la que va en la URL — el código nunca va en la URL, solo dentro del body como `employeeCode`.

`<role_id_limitado>` es el `role_id` de `qa-espejo-limitado`, de la cuarta consulta.

### Escenario 1 — Expediente con cuenta personal: el correo nuevo se copia a la cuenta

Usuario: **A**.

**Endpoint:** `PUT /api/persons/<Personal01.personId>`

```json
{
  "personFirstname": "QAEspejo",
  "personLastname": "Personal01",
  "personEmail": "qa-espejo-personal01-nuevo@gsti-tests.local"
}
```

**Response exacto:** `201`

```json
{
  "type": "success",
  "title": "Persons",
  "message": "The person was updated successfully",
  "data": {
    "person": "...",
    "emailMirror": { "status": "written", "target": "users" }
  }
}
```

Consulta de confirmación: `GET /api/users/<Personal01.userId>` → `userEmail` es `qa-espejo-personal01-nuevo@gsti-tests.local`.

Qué significa cada dato:
- `type`: cómo salió la petición; aquí vale `success` (se guardó lo pedido).
- `title` / `message`: resumen del resultado, en el formato que ya usa el endpoint.
- `data.person`: el expediente tal como quedó guardado; aquí no importa el detalle, lo que se verifica es `emailMirror`.
- `data.emailMirror`: lo que pasó con la cuenta de acceso al guardar el expediente.
- `data.emailMirror.status`: puede valer `written` (sí, el correo se copió al otro lado) o `skipped` (no se copió nada).
- `data.emailMirror.target`: a quién se le copió el correo cuando `status` es `written`; puede valer `users` (la cuenta con la que la persona entra al sistema), `people` (el correo personal del expediente) o `employees` (el correo de trabajo del colaborador).
- Del `GET` de confirmación, `userEmail`: el correo con el que esa cuenta entra al sistema.

### Escenario 2 — Expediente con cuenta institucional: el correo de acceso no se toca

Usuario: **A**.

**Endpoint:** `PUT /api/persons/<Institucional02.personId>`

```json
{
  "personFirstname": "QAEspejo",
  "personLastname": "Institucional02",
  "personEmail": "qa-espejo-personal02-nuevo@gsti-tests.local"
}
```

**Response exacto:** `201`

```json
{
  "type": "success",
  "title": "Persons",
  "message": "The person was updated successfully",
  "data": {
    "person": "...",
    "emailMirror": { "status": "skipped", "reason": "email-type-mismatch" }
  }
}
```

Consulta de confirmación: `GET /api/users/<Institucional02.userId>` → `userEmail` sigue en `qa-espejo-empresa02@gsti-tests.local`.

Qué significa lo nuevo aquí — `data.emailMirror.reason`, con todos sus valores (los cuatro se provocan en este manual, así que no hay línea de "no observable"):
- `email-type-mismatch`: la cuenta es de otro tipo de correo y no le corresponde este cambio.
- `no-live-counterpart`: no hay una cuenta ni un colaborador activo a quién copiarle (Escenario 13).
- `already-in-sync`: los dos lados ya tenían el mismo correo (Escenario 14).
- `source-email-empty`: la petición no trajo un correo nuevo, así que no hay nada que copiar (Escenario 15).

### Escenario 3 — Colaborador con cuenta institucional: el correo de trabajo se copia a la cuenta

Usuario: **A**.

Antes de editar, consulta `GET /api/employees/<Colaborador03.employeeId>` y copia los valores que traiga de `employeeFirstName`, `employeeLastName`, `employeeSecondLastName`, `employeePayrollCode` y `employeeHireDate` en el body de abajo (donde dice `"<lo que trajo el GET>"`), sin cambiarlos. El endpoint de edición trata estos campos como reemplazo total si vienen en el body: mandarlos tal cual evita que la edición borre datos del colaborador que no tienen nada que ver con este caso.

**Endpoint:** `PUT /api/employees/<Colaborador03.employeeId>`

```json
{
  "employeeCode": "QA-ESPEJO-EMP-03",
  "employeeFirstName": "<lo que trajo el GET>",
  "employeeLastName": "<lo que trajo el GET>",
  "employeeSecondLastName": "<lo que trajo el GET>",
  "employeePayrollCode": "<lo que trajo el GET>",
  "employeeHireDate": "<lo que trajo el GET>",
  "companyId": 1,
  "employeeTypeId": 1,
  "employeeWorkScheduleHybridConfig": null,
  "employeeBusinessEmail": "qa-espejo-empresa03-nuevo@gsti-tests.local"
}
```

**Response exacto:** `201`

```json
{
  "type": "success",
  "title": "Employees",
  "message": "The employee was updated successfully",
  "data": {
    "employee": "...",
    "emailMirror": { "status": "written", "target": "users" }
  }
}
```

Consulta de confirmación: `GET /api/users/<Colaborador03.userId>` → `userEmail` es `qa-espejo-empresa03-nuevo@gsti-tests.local`.

(Los datos son los ya explicados en el Escenario 1.)

### Escenario 4 — Cuenta personal editada desde Usuarios: el correo se copia al expediente

Usuario: **A**.

**Endpoint:** `PUT /api/users/<Personal04.userId>`

```json
{
  "userEmail": "qa-espejo-personal04-nuevo@gsti-tests.local",
  "userActive": true,
  "roleId": "<role_id_limitado>",
  "personId": "<Personal04.personId>",
  "userEmailType": "personal"
}
```

**Response exacto:** `201`

```json
{
  "type": "success",
  "title": "Users",
  "message": "The user was updated successfully",
  "data": {
    "user": "...",
    "emailMirror": { "status": "written", "target": "people" }
  }
}
```

Consulta de confirmación: `GET /api/persons/<Personal04.personId>` → `personEmail` es `qa-espejo-personal04-nuevo@gsti-tests.local`.

Qué significa lo nuevo aquí — del `GET` de confirmación, `personEmail`: el correo particular de la persona en su expediente.

### Escenario 5 — Cuenta institucional editada sin mandar el tipo: el tipo guardado se conserva y el correo se copia al colaborador

Usuario: **A**.

**Endpoint:** `PUT /api/users/<Colaborador05.userId>`

```json
{
  "userEmail": "qa-espejo-empresa05-nuevo@gsti-tests.local",
  "userActive": true,
  "roleId": "<role_id_limitado>",
  "personId": "<Colaborador05.personId>"
}
```

(Sin `userEmailType` en el body: la cuenta ya era `institutional` y debe seguir siéndolo aunque no se mande.)

**Response exacto:** `201`

```json
{
  "type": "success",
  "title": "Users",
  "message": "The user was updated successfully",
  "data": {
    "user": "...",
    "emailMirror": { "status": "written", "target": "employees" }
  }
}
```

Consulta de confirmación: `GET /api/users/<Colaborador05.userId>` → `userEmailType` sigue en `institutional`; `GET /api/employees/<Colaborador05.employeeId>` → `employeeBusinessEmail` es `qa-espejo-empresa05-nuevo@gsti-tests.local`.

Qué significa lo nuevo aquí:
- `userEmailType`, con todos sus valores: `personal` (el correo particular de la persona) o `institutional` (el correo de trabajo que da la empresa).
- Del `GET` de confirmación, `employeeBusinessEmail`: el correo de trabajo del colaborador.

### Escenario 6 — Alta de cuenta con un tipo de correo que no existe: se rechaza antes de guardar

Usuario: **A**. Persona: `Libre06` (sin cuenta viva).

**Endpoint:** `POST /api/users`

```json
{
  "userEmail": "qa-espejo-libre06@gsti-tests.local",
  "userActive": true,
  "roleId": "<role_id_limitado>",
  "personId": "<Libre06.personId>",
  "userEmailType": "Personal"
}
```

**Response exacto:** `422`

```json
{
  "type": "validation_error",
  "title": "Validation error",
  "message": "The provided data is invalid",
  "error": "...",
  "errors": ["..."]
}
```

Qué significa lo nuevo aquí:
- `type`: aquí vale `validation_error`, es decir, el body no pasó las reglas del campo y no se guardó nada.
- `error` / `errors`: el detalle de qué campo falló y por qué (aquí, `userEmailType` solo acepta `personal` o `institutional`, sin mayúsculas).

### Escenario 7 — Expediente con cuenta personal que choca con otra cuenta viva: se rechaza y nada cambia

Usuario: **A**.

**Endpoint:** `PUT /api/persons/<Personal07.personId>`

```json
{
  "personFirstname": "Cambiado",
  "personLastname": "Personal07",
  "personEmail": "qa-espejo-ocupado-cuenta@gsti-tests.local"
}
```

**Response exacto:** `400`

```json
{
  "title": "Este correo de acceso ya está en uso",
  "detail": "Otra cuenta activa usa este correo de acceso; usa uno distinto o da de baja la cuenta que lo tiene. No se guardó ningún cambio.",
  "key": "correo-de-acceso-ya-registrado",
  "code": "USR.MAIL.002"
}
```

Consulta de confirmación: `GET /api/persons/<Personal07.personId>` → `personFirstname` sigue en `QAEspejo` y `personEmail` sin cambio; `GET /api/users/<Personal07.userId>` → `userEmail` sin cambio.

Qué significa lo nuevo aquí:
- `title`: el encabezado corto del rechazo: ese correo ya tiene dueña entre las cuentas vivas.
- `detail`: la explicación y qué hacer: usar otro correo o dar de baja la cuenta que lo ocupa; nada se guardó, ni siquiera el nombre que también venía en el body.
- `key`: la clave fija del rechazo en español con guiones; no cambia con el idioma.
- `code`: el identificador punteado del rechazo del catálogo.

### Escenario 8 — Alta de cuenta con el correo personal de otra persona: se rechaza

Usuario: **A**. Persona: `Libre08` (sin cuenta viva).

**Endpoint:** `POST /api/users`

```json
{
  "userEmail": "qa-espejo-ocupado-personal@gsti-tests.local",
  "userActive": true,
  "roleId": "<role_id_limitado>",
  "personId": "<Libre08.personId>",
  "userEmailType": "personal"
}
```

**Response exacto:** `400`

```json
{
  "title": "Este correo personal ya está en uso",
  "detail": "Otra persona registrada usa este correo personal; usa uno distinto. No se guardó ningún cambio.",
  "key": "correo-personal-ya-registrado",
  "code": "USR.MAIL.003"
}
```

Qué significa lo nuevo aquí:
- `key`/`code`: `correo-personal-ya-registrado` / `USR.MAIL.003` — aquí el que ya está ocupado es el correo particular de otra persona del expediente, no el de una cuenta de acceso.

### Escenario 9 — Cuenta institucional editada con el correo de trabajo de otro colaborador: se rechaza

Usuario: **A**.

**Endpoint:** `PUT /api/users/<Colaborador09.userId>`

```json
{
  "userEmail": "qa-espejo-ocupado-empresa@gsti-tests.local",
  "userActive": true,
  "roleId": "<role_id_limitado>",
  "personId": "<Colaborador09.personId>",
  "userEmailType": "institutional"
}
```

**Response exacto:** `400`

```json
{
  "title": "Este correo institucional ya está en uso",
  "detail": "Otro colaborador activo usa este correo institucional; usa uno distinto. No se guardó ningún cambio.",
  "key": "correo-institucional-ya-registrado",
  "code": "USR.MAIL.004"
}
```

Consulta de confirmación: `GET /api/users/<Colaborador09.userId>` y `GET /api/employees/<Colaborador09.employeeId>` → los dos siguen en `qa-espejo-empresa09@gsti-tests.local`.

Qué significa lo nuevo aquí:
- `key`/`code`: `correo-institucional-ya-registrado` / `USR.MAIL.004` — aquí el que ya está ocupado es el correo de trabajo de otro colaborador activo.

### Escenario 10 — Persona cuya cuenta vive en otra empresa: se rechaza sin decir el correo

Usuario: **A**.

**Endpoint:** `PUT /api/persons/<Fuera10.personId>`

```json
{
  "personFirstname": "QAEspejo",
  "personLastname": "Fuera10",
  "personEmail": "qa-espejo-fuera10-nuevo@gsti-tests.local"
}
```

**Response exacto:** `403`

```json
{
  "title": "No puedes cambiar el correo de acceso de esta persona",
  "detail": "La cuenta de acceso de esta persona no pertenece a las empresas que administras. No se guardó ningún cambio.",
  "key": "cuenta-de-acceso-fuera-de-alcance",
  "code": "USR.MAIL.005"
}
```

Consulta de confirmación: `GET /api/persons/<Fuera10.personId>` → `personEmail` sin cambio.

Qué significa lo nuevo aquí:
- `title`/`detail`: la cuenta de acceso de esta persona pertenece a una empresa que A no administra; el rechazo no dice a cuál, ni el correo que tenía.
- `key`/`code`: `cuenta-de-acceso-fuera-de-alcance` / `USR.MAIL.005`. El mismo cuerpo se usaría si A no estuviera autenticado en absoluto: el rechazo no distingue un caso del otro.

### Escenario 11 — Persona con dos cuentas vivas: se rechaza sin decir cuántas hay

Usuario: **A**.

**Endpoint:** `PUT /api/persons/<Doble11.personId>`

```json
{
  "personFirstname": "QAEspejo",
  "personLastname": "Doble11",
  "personEmail": "qa-espejo-doble11-nuevo@gsti-tests.local"
}
```

**Response exacto:** `400`

```json
{
  "title": "No fue posible actualizar el correo de acceso",
  "detail": "No se pudo determinar cuál es la cuenta de acceso de esta persona. Contacta a soporte. No se guardó ningún cambio.",
  "key": "cuenta-de-acceso-no-determinada",
  "code": "USR.MAIL.006"
}
```

Consulta de confirmación: `GET /api/persons/<Doble11.personId>` → `personEmail` sin cambio.

Qué significa lo nuevo aquí:
- `title`/`detail`: la persona tiene más de una cuenta viva y el sistema no adivina a cuál le corresponde el cambio; el mensaje no dice cuántas cuentas hay ni cuáles.
- `key`/`code`: `cuenta-de-acceso-no-determinada` / `USR.MAIL.006`.

### Escenario 12 — Cuenta personal editada por quien no administra datos de contacto: se rechaza

Usuario: **B**.

**Endpoint:** `PUT /api/users/<Personal12.userId>`

```json
{
  "userEmail": "qa-espejo-personal12-nuevo@gsti-tests.local",
  "userActive": true,
  "roleId": "<role_id_limitado>",
  "personId": "<Personal12.personId>",
  "userEmailType": "personal"
}
```

**Response exacto:** `403`

```json
{
  "title": "Sin permiso para modificar datos sensibles",
  "detail": "No tienes permiso para modificar datos de contacto. Ningún dato de la petición se guardó.",
  "key": "sin-permiso-para-modificar-datos-sensibles",
  "code": "EMP.SENS.WRITE.FORBIDDEN"
}
```

Consulta de confirmación (con **A**): `GET /api/users/<Personal12.userId>` → `userEmail` sin cambio; `GET /api/persons/<Personal12.personId>` → `personEmail` sin cambio.

Qué significa lo nuevo aquí:
- `title`/`detail`: B puede editar cuentas, pero cambiar el correo de acceso también movería el correo personal del expediente, y B no tiene permiso sobre datos de contacto; no se guardó nada, ni el correo de la cuenta ni el del expediente.
- `key`/`code`: `sin-permiso-para-modificar-datos-sensibles` / `EMP.SENS.WRITE.FORBIDDEN`.

### Escenario 13 — Persona sin cuenta: no hay a quién copiarle

Usuario: **A**.

**Endpoint:** `PUT /api/persons/<SinCuenta13.personId>`

```json
{
  "personFirstname": "QAEspejo",
  "personLastname": "SinCuenta13",
  "personEmail": "qa-espejo-sincuenta13-nuevo@gsti-tests.local"
}
```

**Response exacto:** `201`

```json
{
  "type": "success",
  "title": "Persons",
  "message": "The person was updated successfully",
  "data": {
    "person": "...",
    "emailMirror": { "status": "skipped", "reason": "no-live-counterpart" }
  }
}
```

(Los datos son los ya explicados en el Escenario 2.)

### Escenario 14 — Expediente guardado con el mismo correo que ya tenía: no hay nada que copiar

Usuario: **A**.

**Endpoint:** `PUT /api/persons/<Sincronizada14.personId>`

```json
{
  "personFirstname": "Sincronizada",
  "personLastname": "Sincronizada14",
  "personEmail": "qa-espejo-sincronizada14@gsti-tests.local"
}
```

**Response exacto:** `201`

```json
{
  "type": "success",
  "title": "Persons",
  "message": "The person was updated successfully",
  "data": {
    "person": "...",
    "emailMirror": { "status": "skipped", "reason": "already-in-sync" }
  }
}
```

(Los datos son los ya explicados en el Escenario 2.)

### Escenario 15 — Expediente guardado sin mandar el correo: no hay nada que copiar

Usuario: **A**.

**Endpoint:** `PUT /api/persons/<Vacio15.personId>`

```json
{
  "personFirstname": "QAEspejo",
  "personLastname": "Vacio15",
  "personEmail": null
}
```

**Response exacto:** `201`

```json
{
  "type": "success",
  "title": "Persons",
  "message": "The person was updated successfully",
  "data": {
    "person": "...",
    "emailMirror": { "status": "skipped", "reason": "source-email-empty" }
  }
}
```

Consulta de confirmación: `GET /api/users/<Vacio15.userId>` → `userEmail` sigue en `qa-espejo-vacio15@gsti-tests.local`.

(Los datos son los ya explicados en el Escenario 2.)

## 3. Checklist

- [x] Escenario 1 — Personal edita expediente: se copia a la cuenta
- [x] Escenario 2 — Institucional edita expediente: la cuenta no se toca
- [x] Escenario 3 — Colaborador edita correo de trabajo: se copia a la cuenta
- [x] Escenario 4 — Personal edita cuenta: se copia al expediente
- [x] Escenario 5 — Institucional edita cuenta sin mandar el tipo: el tipo se conserva y se copia al colaborador
- [x] Escenario 6 — Alta con tipo de correo inválido: 422
- [x] Escenario 7 — Expediente con correo de otra cuenta viva: 400, nada cambia
- [x] Escenario 8 — Alta con correo personal de otra persona: 400
- [x] Escenario 9 — Cuenta con correo de trabajo de otro colaborador: 400
- [x] Escenario 10 — Cuenta fuera del alcance del actor: 403 sin decir el correo
- [x] Escenario 11 — Persona con dos cuentas vivas: 400 sin decir cuántas
- [x] Escenario 12 — Sin permiso de datos de contacto: 403, nada cambia
- [x] Escenario 13 — Persona sin cuenta: se omite
- [x] Escenario 14 — Correo ya sincronizado: se omite
- [x] Escenario 15 — Correo sin mandar: se omite
