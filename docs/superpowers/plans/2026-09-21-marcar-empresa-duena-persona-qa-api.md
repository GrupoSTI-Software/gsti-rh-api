# Prueba manual API — Cada expediente personal pertenece a una empresa y solo ella lo ve

**Problema:** Valanserh promete que cada empresa cliente trabaja sobre sus propios datos y no ve los de otra. Eso se cumplía en casi todo el producto salvo en el expediente personal —donde viven nombre, RFC, CURP, número de seguro social, fecha de nacimiento y teléfonos—: esa parte no sabía de qué empresa era cada registro, así que un usuario de cualquier empresa podía consultar, editar y borrar expedientes de todas las demás.

**Solución:** Desde esta historia cada expediente registra por sí solo a qué empresa pertenece en el momento de crearse: quien lo captura no llena ningún campo nuevo ni ve nada distinto. Las consultas hechas desde una empresa solo traen sus propios expedientes; los de otra empresa y los que no tienen empresa (los del personal de la plataforma) responden como si no existieran. El dueño de una cuenta nueva que se registra por su cuenta nace ya dentro de su empresa. Este manual no cubre a los empleados que llegan desde el reloj checador: esa vía sigue creando expedientes sin empresa y se atiende en otra historia.

Ejemplo: es como los casilleros de una escuela: cada alumno tiene el suyo y, aunque todos los casilleros estén en el mismo pasillo, tu llave solo abre el tuyo. Antes, la llave de cualquier alumno abría todos; ahora, si intentas abrir el de otro, el casillero se comporta como si no existiera.

Se prueba con un cliente de API (Postman, Insomnia, Bruno). La autenticación se asume resuelta por tu cliente: se envía el token del usuario en el header `Authorization: Bearer <token>`.

**URL base:** `http://127.0.0.1:3333`

**Header obligatorio.** Además del token, cada petición a `/api/persons` lleva el header `X-Business-Unit-Id` con el identificador público de la empresa desde la que se consulta. Es lo único que cambia hacia fuera con esta historia: antes ese endpoint no lo pedía.

## 1. Preparar (una sola vez)

```bash
cd gsti-rh-api
node ace db:seed --files=database/seeders/_tmp_do_not_commit_qa_seeder.ts
```

Deja listas dos empresas (A y B), un capturista en cada una, un expediente en cada empresa, un expediente sin empresa y el administrador de la plataforma. Volver a correr el seeder restaura cualquier expediente que un escenario haya modificado.

| | Correo | Contraseña | Variante |
|---|---|---|---|
| **A** | `qa-duena-capturista-a@gsti-tests.local` | `password` | Capturista de la empresa A |
| **B** | `qa-duena-capturista-b@gsti-tests.local` | `password` | Capturista de la empresa B |
| **P** | `qa-dashboard-platform-admin@gsti-tests.local` | `password` | Administrador de la plataforma (no pertenece a ninguna empresa) |

Identificadores públicos de las dos empresas, para el header `X-Business-Unit-Id`:

```sql
SELECT business_unit_slug, business_unit_public_id, business_unit_id FROM business_units WHERE business_unit_slug IN ('qa-duena-a', 'qa-duena-b');
```

Identificadores de los tres expedientes sembrados (el correo no sirve de filtro porque se guarda cifrado; el apellido sí):

```sql
SELECT person_id, person_lastname, business_unit_id FROM people WHERE person_second_lastname = 'Duena' AND person_lastname IN ('PersonaA', 'PersonaB', 'SinMarca');
```

## 2. Escenario 1 — Alta desde la empresa A: el expediente nace marcado sin que el capturista haga nada distinto

Usuario: **A**.

**Endpoint:** `POST /api/persons`

Headers: `Authorization: Bearer <token de A>`, `X-Business-Unit-Id: <identificador público de la empresa A>`

```json
{
  "personFirstname": "Alta",
  "personLastname": "EmpresaA",
  "personSecondLastname": "Duena",
  "personEmail": "qa-duena-alta-a@gsti-tests.local"
}
```

**Response exacto:** `201`

```json
{
  "type": "success",
  "title": "Persons",
  "message": "The person was created successfully",
  "data": { "person": { "personId": 123, "personFirstname": "Alta", "personLastname": "EmpresaA", "...": "..." } }
}
```

El cuerpo no trae ningún campo nuevo: la marca de empresa no se muestra. Comprobar en la base que quedó puesta:

```sql
SELECT person_id, business_unit_id FROM people WHERE person_lastname = 'EmpresaA' AND person_second_lastname = 'Duena';
```

Debe traer el `business_unit_id` de la empresa A, nunca vacío.

Qué significa cada dato:
- `type`: qué tan bien salió la petición. Puede valer `success` (sí se hizo lo pedido) o `warning` (no se hizo; el mensaje dice por qué — se ve en el Escenario 3).
- `title` / `message`: el encabezado y la frase del resultado.
- `data.person.personId`: el número con el que el sistema identifica al expediente recién creado.
- El número que devuelve la consulta: la empresa dueña del expediente; el sistema la puso solo, a partir de la empresa desde la que se capturó. Si viniera vacío, el expediente habría nacido sin dueño.

## 3. Escenario 2 — Desde la empresa A solo se ven los expedientes de A

Usuario: **A**.

**Endpoint:** `GET /api/persons?page=1&limit=100`

Headers: `Authorization: Bearer <token de A>`, `X-Business-Unit-Id: <identificador público de la empresa A>`

**Response exacto:** `200`

```json
{
  "type": "success",
  "title": "Persons",
  "message": "The persons were found successfully",
  "data": { "persons": { "meta": { "total": 3, "...": "..." }, "data": [ { "personId": "...", "personLastname": "DuenaCapturistaA" }, { "personLastname": "PersonaA" }, { "personLastname": "EmpresaA" } ] } }
}
```

Deben aparecer únicamente el capturista A, `PersonaA` y la persona creada en el Escenario 1. **No** aparecen `PersonaB`, `DuenaCapturistaB` ni `SinMarca`. Repetir con el usuario **B** y su header: aparecen solo `DuenaCapturistaB` y `PersonaB`.

Qué significa cada dato:
- `data.persons.meta.total`: cuántos expedientes alcanza esta empresa en total.
- `data.persons.data`: la lista de esos expedientes; ninguno pertenece a otra empresa ni está sin empresa.

## 4. Escenario 3 — El expediente de otra empresa no existe para A: ni leer, ni editar, ni borrar

Usuario: **A**. Identificador: el `person_id` de `PersonaB` (resuelto en Preparar).

**Endpoint:** `GET /api/persons/<person_id de PersonaB>`

Headers: `Authorization: Bearer <token de A>`, `X-Business-Unit-Id: <identificador público de la empresa A>`

**Response exacto:** `404`

```json
{
  "type": "warning",
  "title": "The person was not found",
  "message": "The person was not found with the entered ID",
  "data": { "personId": "<person_id de PersonaB>" }
}
```

**Endpoint:** `PUT /api/persons/<person_id de PersonaB>`

```json
{
  "personFirstname": "Intruso",
  "personLastname": "PersonaB",
  "personSecondLastname": "Duena"
}
```

**Response exacto:** `404`

```json
{
  "type": "warning",
  "title": "The person was not found",
  "message": "The person was not found with the entered ID",
  "data": {
    "personId": "<person_id de PersonaB>",
    "personFirstname": "Intruso",
    "personLastname": "PersonaB",
    "personSecondLastname": "Duena",
    "personBirthday": null
  }
}
```

Mismo `title` y `message` que el `GET`, pero aquí `data` no es solo el identificador: es un eco de lo que se intentó guardar (por eso trae los tres campos del cuerpo enviado, más `personBirthday` en blanco aunque no se haya mandado). Si se envía un cuerpo distinto, `data` cambia para reflejarlo — el `title` y el `message` no.

**Endpoint:** `DELETE /api/persons/<person_id de PersonaB>`

**Response exacto:** `404`, con el mismo `title`, `message` y forma de `data` (solo `personId`) que el `GET`.

Comprobar en la base que el expediente de B sigue intacto:

```sql
SELECT person_firstname, person_deleted_at FROM people WHERE person_id = <person_id de PersonaB>;
```

Debe traer `QA` y `person_deleted_at` vacío. Repetir los tres con un identificador inexistente (por ejemplo `999999999`): el `404` es idéntico en `title` y `message` en los tres casos (el `data` de `PUT` cambia según lo que se haya enviado, como se explicó arriba), así que la respuesta no revela si el expediente existe en otra empresa.

Qué significa lo nuevo aquí:
- `type` con valor `warning` y ese `title` / `message`: el sistema responde "no encontrado" tanto para un expediente ajeno como para uno que no existe; no distingue entre ambos a propósito.
- `data.personId`: el identificador que se pidió, devuelto tal cual.
- Lo que devuelve la consulta: el nombre sigue siendo `QA` (nadie lo editó) y la segunda columna viene vacía (nadie lo dio de baja).

## 5. Escenario 4 — El expediente sin empresa es invisible para cualquier empresa

Usuario: **A**. Identificador: el `person_id` de `SinMarca`.

**Endpoint:** `GET /api/persons/<person_id de SinMarca>`

Headers: `Authorization: Bearer <token de A>`, `X-Business-Unit-Id: <identificador público de la empresa A>`

**Response exacto:** `404` (los datos son los ya explicados en el Escenario 3). Repetir con el usuario **B** y su header: también `404`.

## 6. Escenario 5 — El header manipulado no abre la puerta

Usuario: **A**.

**Endpoint:** `GET /api/persons?page=1&limit=100` con `X-Business-Unit-Id: <identificador público de la empresa B>`

**Response exacto:** `404`

```json
{
  "title": "Unidad de negocio no encontrada",
  "detail": "El recurso solicitado no existe o no tienes acceso a él.",
  "key": "BU.NOT.001"
}
```

**Endpoint:** `GET /api/persons?page=1&limit=100` **sin** el header `X-Business-Unit-Id`

**Response exacto:** `400`

```json
{
  "title": "Header requerido",
  "detail": "El header x-business-unit-id es obligatorio.",
  "key": "BU.VAL.000"
}
```

**Endpoint:** `GET /api/persons?page=1&limit=100` con `X-Business-Unit-Id: <business_unit_id entero de la empresa A>` (el número interno en vez del identificador público)

**Response exacto:** `404` con `key: "BU.NOT.001"`.

Qué significa cada dato:
- `key`: puede valer `BU.VAL.000` (falta el header que dice desde qué empresa se consulta) o `BU.NOT.001` (la empresa indicada no existe o el usuario no tiene acceso a ella; el sistema no dice cuál de las dos).

## 7. Escenario 6 — El dueño de una cuenta nueva nace dentro de su empresa

Sin usuario: son los tres pasos públicos del registro. El registro admite **5 peticiones por minuto por dirección**: si aparece `429`, esperar un minuto.

**Endpoint:** `POST /api/auth/signup/start`

```json
{
  "firstName": "Duena",
  "lastName": "Signup",
  "businessUnitName": "QA Duena Signup",
  "email": "qa-duena-signup@gsti-tests.local",
  "billingPlanId": <id de un plan publicado>,
  "contractedEmployees": 10
}
```

El plan: `SELECT billing_plan_id FROM billing_plans WHERE billing_plan_published_at IS NOT NULL AND billing_plan_deleted_at IS NULL LIMIT 1;`

**Response exacto:** `200` con `data.signupDraftId`.

**Endpoint:** `POST /api/auth/signup/verify-otp` con `{ "signupDraftId": <el de arriba>, "pinCode": "<pin>" }`; el pin: `SELECT signup_draft_pin_code FROM signup_drafts WHERE signup_draft_email = 'qa-duena-signup@gsti-tests.local';`

**Response exacto:** `200` con `data.signupToken`.

**Endpoint:** `POST /api/auth/signup/complete` con `{ "signupDraftId": <id>, "signupToken": "<token>", "password": "DuenaSignup123!", "passwordConfirm": "DuenaSignup123!" }`

**Response exacto:** `200` con `data.user.personId`.

Comprobar en la base:

```sql
SELECT p.business_unit_id, b.business_unit_name FROM people p JOIN business_units b ON b.business_unit_id = p.business_unit_id WHERE p.person_id = <data.user.personId>;
```

Debe traer `QA Duena Signup`. Después, con el token que devolvió `complete` y el `business_unit_public_id` de esa empresa en el header, `GET /api/persons/<data.user.personId>` responde `200` con el propio expediente: el dueño se ve a sí mismo desde el primer momento.

Qué significa lo nuevo aquí:
- `data.signupDraftId`: el número del registro a medio hacer, que se usa en los dos pasos siguientes.
- `data.signupToken`: la llave de un solo uso que confirma que el correo fue verificado.
- `data.user.personId`: el expediente del dueño de la cuenta nueva.
- Lo que devuelve la consulta: el nombre de la empresa que acaba de crear; el expediente del dueño quedó dentro de ella.

## 8. Escenario 7 — La plataforma sigue creando su gente sin empresa

Usuario: **P**.

**Endpoint:** `POST /api/platform/users`

Headers: `Authorization: Bearer <token de P>` (sin `X-Business-Unit-Id`: la plataforma no trabaja desde una empresa)

```json
{
  "personFirstname": "Landlord",
  "personLastname": "Duena",
  "userEmail": "qa-duena-landlord@gsti-tests.local",
  "userPassword": "LandlordDuena123!"
}
```

**Response exacto:** `201`

```json
{
  "type": "success",
  "title": "Usuario interno creado",
  "message": "El administrador de plataforma fue creado correctamente.",
  "data": { "user": { "userId": 45, "userEmail": "qa-duena-landlord@gsti-tests.local", "isPlatformAdmin": true, "roleId": 1, "personId": 456 } }
}
```

Comprobar en la base:

```sql
SELECT business_unit_id FROM people WHERE person_id = <data.user.personId>;
```

Debe venir vacío: el personal de la plataforma no pertenece a ninguna empresa, y crearlo no falla. Después, con el usuario **A** y su header, `GET /api/persons/<data.user.personId>` responde `404` (los datos son los ya explicados en el Escenario 3): ese expediente es invisible para cualquier empresa.

Qué significa lo nuevo aquí:
- `data.user.isPlatformAdmin`: puede valer `true` (la cuenta opera la plataforma para todos los clientes) o `false` (es una cuenta de empresa; no se puede provocar en este endpoint).
- `data.user.roleId`: el número del rol interno que se le asignó.
- Lo que devuelve la consulta, vacío: el expediente no tiene empresa dueña, a propósito.

## 9. Checklist

- [ ] Escenario 1 — Alta desde A queda marcada con A y la respuesta no trae campo nuevo
- [ ] Escenario 2 — A lista solo lo suyo; B lista solo lo suyo
- [ ] Escenario 3 — GET/PUT/DELETE de un expediente de B desde A: 404 idéntico al inexistente y fila intacta
- [ ] Escenario 4 — El expediente sin empresa es invisible para A y para B
- [ ] Escenario 5 — Header de B, header ausente y header entero: rechazados
- [ ] Escenario 6 — El dueño de la cuenta nueva queda dentro de su empresa y se ve a sí mismo
- [ ] Escenario 7 — La plataforma crea su gente sin empresa, sin error, y ninguna empresa la ve
