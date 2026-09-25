# Prueba manual API — Cerrar las consecuencias del cambio de credencial

**Problema:** corregir el correo del expediente de un colaborador le cambia en los hechos el correo con el que entra, y hoy ocurre en silencio: sigue con sesiones abiertas, nadie le avisa y no queda registro.

**Solución:** al cambiar ese correo se cierran sus sesiones abiertas, le llega aviso al correo anterior y al nuevo, queda registrado quién/cuándo/de cuál a cuál, y hace falta un permiso propio.

Ejemplo: es como si en la escuela te cambiaran el correo del salón sin decirte: al día siguiente tu llave vieja ya no abre y nadie te avisó cuál es la nueva. Ahora te avisan a las dos direcciones y anotan quién hizo el cambio.

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
| **A** | `qa-cred-admin@gsti-tests.local` | `password` | Administra usuarios y el expediente del colaborador, con permiso de cambio de credencial |
| **B** | `qa-cred-limitado@gsti-tests.local` | `password` | Solo edita expediente; sin permiso de cambio de credencial |

Ids por consulta, nunca escritos a mano:

```sql
SELECT person_id, person_lastname FROM people WHERE person_firstname = 'QACred' ORDER BY person_lastname;
SELECT user_id, user_email, person_id FROM users WHERE user_email LIKE 'qa-cred-%' AND user_deleted_at IS NULL ORDER BY user_email;
SELECT b.business_unit_public_id FROM business_units b JOIN business_unit_users bu ON bu.business_unit_id = b.business_unit_id JOIN users u ON u.user_id = bu.user_id WHERE u.user_email = 'qa-cred-admin@gsti-tests.local' AND u.user_deleted_at IS NULL;
SELECT tokenable_id FROM api_tokens WHERE tokenable_id = <titular.userId>;
```

Cada escenario usa un `Nombre` (el `person_lastname` de la primera consulta, p. ej. `Cred01`). Los ids de las rutas se escriben `<Nombre.personId>` o `<Nombre.userId>`:
- **`<Nombre.personId>`:** columna `person_id` de la **primera** consulta, en el renglón de ese `Nombre`.
- **`<Nombre.userId>`:** en la **segunda** consulta, el renglón cuya columna `person_id` coincida con el `<Nombre.personId>` anotado.
- **`<titular.userId>`:** para la consulta de `api_tokens`, es el `user_id` de `qa-cred-titular01@gsti-tests.local` (asociado a `Cred01`).

No se provocan aquí el doble cambio simultáneo ni la conservación de sesión del titular cuando se edita a sí mismo (quedan cubiertos en las pruebas automatizadas).

## 2. Escenarios

### Escenario 1 — Expediente con permiso: cambia y dispara las cuatro consecuencias

Usuario: **A**.

**Endpoint:** `PUT /api/persons/<Cred01.personId>`

```json
{
  "personFirstname": "QACred",
  "personLastname": "Cred01",
  "personEmail": "qa-cred-titular01-nuevo@gsti-tests.local"
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
    "emailMirror": {
      "status": "written",
      "target": "users"
    }
  }
}
```

Confirmación de las cuatro consecuencias (una por una, con su endpoint o consulta):

1. Sesiones cerradas. Consulta SQL:
   `SELECT tokenable_id FROM api_tokens WHERE tokenable_id = <titular.userId>;`
   Resultado: 0 filas (las sesiones anteriores fueron cerradas).

2. Con qué correo se entra ahora. Sin headers de autenticación:
   **Endpoint:** `POST /api/auth/login`
```json
{
  "userEmail": "qa-cred-titular01@gsti-tests.local",
  "userPassword": "password"
}
```
   **Response exacto:** `404`
```json
{
  "type": "warning",
  "title": "Login",
  "message": "Incorrect email or password",
  "data": { "user": {} }
}
```
   **Endpoint:** `POST /api/auth/login`
```json
{
  "userEmail": "qa-cred-titular01-nuevo@gsti-tests.local",
  "userPassword": "password"
}
```
   **Response exacto:** `200`
```json
{
  "type": "success",
  "title": "Login",
  "message": "You have successfully logged in",
  "data": {
    "user": "...",
    "token": "...",
    "refreshToken": "..."
  }
}
```

3. Los dos avisos en Mailpit. El ambiente local envía el correo a Mailpit: abre `http://localhost:8025` (si tu Mailpit vive en otra dirección, usa la tuya) y busca `qa-cred-titular01`. Deben aparecer 2 mensajes (alternativa por API: `GET http://localhost:8025/api/v1/search?query=qa-cred-titular01` → `200` con esos 2 mensajes en la lista):
   - Mensaje 1, `Para: qa-cred-titular01@gsti-tests.local`, asunto `Tu correo de acceso a Valanserh cambió`. El cuerpo dice que esa dirección ya no sirve para entrar y muestra el correo nuevo enmascarado: `q•••1@gsti-tests.local`. No trae botón de inicio de sesión, solo contacto de soporte.
   - Mensaje 2, `Para: qa-cred-titular01-nuevo@gsti-tests.local`, asunto `Así entras ahora a Valanserh`. El cuerpo muestra la dirección nueva completa, dice `Tu contraseña no cambió`, avisa que las sesiones anteriores se cerraron y sí trae botón de inicio de sesión.

4. Registro del cambio. En el mismo Mongo del ambiente, colección `log_users`:
   `db.log_users.find({ action: 'credential-change' }).sort({ $natural: -1 }).limit(1)`
   El documento trae `user_id` (quién lo hizo: el id de A), `record_previous.user_email` (el correo anterior), `record_current.user_email` (el nuevo) y `record_current.mirror_origin` con valor `person-file` (el cambio entró por el expediente).

Qué significa cada dato:
- `type`: cómo resultó la operación; aquí vale `success` (la solicitud se completó exitosamente).
- `title` / `message`: resumen descriptivo del resultado devuelto por el servicio.
- `data.person`: los datos de la ficha personal tal como quedaron guardados; el detalle no importa aquí, lo relevante para este caso es `emailMirror`.
- `data.emailMirror`: el resultado de sincronizar el correo con la cuenta de acceso.
- `data.emailMirror.status`: puede valer `written` (sí, el correo se copió a la cuenta de acceso) o `skipped` (no se copió nada a la cuenta).
- `data.emailMirror.target`: a qué destino se copió el correo cuando `status` es `written`; puede valer `users` (la cuenta con la que la persona entra al sistema), `people` (el correo particular del expediente) o `employees` (el correo de trabajo del colaborador). Los valores `people` y `employees` corresponden a otros flujos de sincronización no observables en este escenario.

### Escenario 2 — Expediente sin permiso: se rechaza y nada cambia

Usuario: **B**.

**Endpoint:** `PUT /api/persons/<Cred02.personId>`

```json
{
  "personFirstname": "QACred",
  "personLastname": "Cred02",
  "personEmail": "qa-cred-titular02-intento@gsti-tests.local"
}
```

**Response exacto:** `403`

```json
{
  "title": "Sin permiso",
  "detail": "No tienes permiso para realizar esta operación.",
  "key": "PERM.DENIED"
}
```

Confirmación:
`SELECT person_email FROM people WHERE person_id = <Cred02.personId>;` → el correo personal sigue siendo `qa-cred-titular02@gsti-tests.local`.
`SELECT user_email FROM users WHERE person_id = <Cred02.personId>;` → la cuenta de acceso conserva `qa-cred-titular02@gsti-tests.local`.

Qué significa lo nuevo aquí:
- `title`: encabezado de notificación que indica que la acción fue denegada por falta de autorización.
- `detail`: motivo del rechazo en palabras claras; indica que el usuario autenticado no cuenta con el permiso requerido para modificar credenciales de acceso.
- `key`: clave fija del sistema para identificar este tipo de error de permisos; aquí vale `PERM.DENIED` (permiso denegado).

### Escenario 3 — Edición que no toca el correo: sin efectos

Usuario: **A**.

**Endpoint:** `PUT /api/persons/<Cred01.personId>`

```json
{
  "personFirstname": "QACred",
  "personLastname": "Cred01",
  "personPhone": "5512345678"
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
    "emailMirror": {
      "status": "skipped",
      "reason": "source-email-empty"
    }
  }
}
```

Confirmación:
`SELECT user_email FROM users WHERE person_id = <Cred01.personId>;` → conserva el correo `qa-cred-titular01-nuevo@gsti-tests.local`.
No se revoca ninguna sesión adicional ni se envían correos de advertencia.

Qué significa lo nuevo aquí:
- `data.emailMirror.reason`: motivo por el cual no se modificó la cuenta de acceso; puede valer `source-email-empty` (la petición no envió un correo nuevo para actualizar), `already-in-sync` (el correo enviado ya era igual al que tenía la cuenta), `email-type-mismatch` (la cuenta es de un tipo distinto de correo) o `no-live-counterpart` (la persona no tiene una cuenta de acceso activa). Los valores `already-in-sync`, `email-type-mismatch` y `no-live-counterpart` corresponden a otros casos no observables en este escenario.
- (Los demás datos son los ya explicados en el Escenario 1.)

## 3. Checklist

- [x] Escenario 1 revoca + avisa x2 + registra
- [x] Escenario 2 da 403 PERM.DENIED sin cambiar nada
- [x] Escenario 3 no exige permiso ni efectos
