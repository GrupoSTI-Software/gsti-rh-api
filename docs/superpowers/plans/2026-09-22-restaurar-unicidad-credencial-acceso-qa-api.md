# Prueba manual API — Dos cuentas vivas nunca comparten el correo de acceso

**Problema:** El correo con el que una persona entra al sistema es su credencial, no un dato de contacto más. Hoy el sistema deja guardar dos cuentas vivas con el mismo correo de acceso, y al entrar comprueba la contraseña contra una cuenta pero deja entrar a otra: una persona puede terminar dentro de la cuenta de otra, con sus permisos y su empresa, y la segunda persona se queda sin poder entrar con su contraseña correcta sin que ninguna pantalla explique por qué.

**Solución:** Desde esta historia dos cuentas vivas no pueden guardar el mismo correo de acceso: dar de alta o editar una cuenta con el correo de otra cuenta viva se rechaza con un mensaje claro, y el correo de una cuenta dada de baja queda libre para reusarse. Quien hoy entra con un correo único sigue entrando igual.

Ejemplo: es como si en la escuela dos alumnos compartieran el número de casillero.
La llave de uno abre el casillero del otro.
Ahora cada número es de un solo alumno, y cuando uno se va su número queda libre para el siguiente.

Se prueba con un cliente de API (Postman, Insomnia, Bruno). La autenticación se asume resuelta por tu cliente: se envía el token del usuario en el header `Authorization: Bearer <token>`.

**URL base:** `http://127.0.0.1:3333`

## 1. Preparar (una sola vez)

```bash
cd gsti-rh-api
node ace db:seed --files=database/seeders/_tmp_do_not_commit_qa_seeder.ts
```

| | Correo | Contraseña | Variante |
|---|---|---|---|
| **A** | `qa-credencial-admin@gsti-tests.local` | `password` | Administrador con permiso de crear y editar usuarios |

Los ids no se inventan: se resuelven con estas consultas (los correos de acceso se guardan y se buscan tal cual):

```sql
SELECT role_id FROM roles WHERE role_slug = 'qa-credencial-admin' AND role_deleted_at IS NULL;
SELECT user_id FROM users WHERE user_email = 'qa-credencial-titular@gsti-tests.local' AND user_deleted_at IS NULL;
SELECT user_id FROM users WHERE user_email = 'qa-credencial-vecino@gsti-tests.local' AND user_deleted_at IS NULL;
SELECT person_id FROM people WHERE person_firstname = 'QACred' AND person_lastname = 'Persona01';
SELECT person_id FROM people WHERE person_firstname = 'QACred' AND person_lastname = 'Persona02';
SELECT person_id FROM people WHERE person_firstname = 'QACred' AND person_lastname = 'Persona03';
SELECT person_id FROM people WHERE person_firstname = 'QACred' AND person_lastname = 'Persona04';
```

Casos que no se pueden provocar en este ambiente y no se recorren aquí: la revisión previa que aborta la migración ante duplicados, la convivencia de varias cuentas dadas de baja con el mismo correo, el correo de una cuenta desactivada pero no dada de baja, los espacios alrededor del correo sembrados directo en base, el ingreso con dos cuentas que ya comparten correo y dos altas simultáneas con el mismo correo.

## 2. Escenario 1 — Alta con el correo de otra cuenta viva: se rechaza con mensaje claro

Usuario: **A**.

**Endpoint:** `POST /api/users`

```json
{
  "userEmail": "qa-credencial-titular@gsti-tests.local",
  "userActive": true,
  "roleId": "<role_id>",
  "personId": "<person_id>",
  "userEmailType": "institutional"
}
```

(`<role_id>`: el `role_id` del rol `qa-credencial-admin` resuelto en Preparar. `<person_id>`: el `person_id` de `QACred/Persona01` resuelto en Preparar. `userEmailType` puede valer `institutional` o `personal`.)

**Response exacto:** `400`

```json
{
  "title": "Este correo de acceso ya está en uso",
  "detail": "Otra cuenta activa usa este correo de acceso; usa uno distinto o da de baja la cuenta que lo tiene. No se guardó ningún cambio.",
  "key": "correo-de-acceso-ya-registrado",
  "code": "USR.MAIL.002"
}
```

Qué significa cada dato:
- `title`: el encabezado corto del rechazo: ese correo ya tiene dueña entre las cuentas vivas.
- `detail`: la explicación y qué hacer: usar otro correo o dar de baja la cuenta que lo ocupa; nada se guardó.
- `key`: la clave fija del rechazo en español con guiones; siempre vale `correo-de-acceso-ya-registrado` y no cambia con el idioma.
- `code`: el identificador punteado del rechazo; siempre vale `USR.MAIL.002`.
- `userEmailType`: qué clase de correo es la cuenta: puede valer `institutional` (el correo de trabajo que da la empresa) o `personal` (el correo particular de la persona).

## 3. Escenario 2 — Editar una cuenta para ponerle el correo de otra cuenta viva: se rechaza igual

Usuario: **A**. Identificador: el `user_id` de `qa-credencial-vecino@gsti-tests.local` (resuelto en Preparar).

**Endpoint:** `PUT /api/users/<user_id del vecino>`

```json
{
  "userEmail": "qa-credencial-titular@gsti-tests.local",
  "userActive": true,
  "roleId": "<role_id>",
  "userEmailType": "institutional"
}
```

(`<role_id>`: el `role_id` del rol `qa-credencial-admin` resuelto en Preparar.)

**Response exacto:** `400`

```json
{
  "title": "Este correo de acceso ya está en uso",
  "detail": "Otra cuenta activa usa este correo de acceso; usa uno distinto o da de baja la cuenta que lo tiene. No se guardó ningún cambio.",
  "key": "correo-de-acceso-ya-registrado",
  "code": "USR.MAIL.002"
}
```

(Los datos son los ya explicados en el Escenario 1.) Comprobar en la base que ninguna de las dos cuentas cambió:

```sql
SELECT user_email FROM users WHERE user_email IN ('qa-credencial-titular@gsti-tests.local','qa-credencial-vecino@gsti-tests.local') AND user_deleted_at IS NULL;
```

Deben seguir las dos filas con su correo de antes.

## 4. Escenario 3 — Editar una cuenta conservando su propio correo: procede

Usuario: **A**. Identificador: el `user_id` de `qa-credencial-vecino@gsti-tests.local`.

**Endpoint:** `PUT /api/users/<user_id del vecino>`

```json
{
  "userEmail": "qa-credencial-vecino@gsti-tests.local",
  "userActive": true,
  "roleId": "<role_id>",
  "userEmailType": "institutional"
}
```

(`<role_id>`: el `role_id` del rol `qa-credencial-admin` resuelto en Preparar.)

**Response exacto:** `201` con la cuenta actualizada:

```json
{
  "type": "success",
  "title": "Users",
  "message": "The user was updated successfully",
  "data": {
    "user": "..."
  }
}
```

Qué significa lo nuevo aquí:
- `type`: cómo salió la petición; vale `success` (todo salió bien).
- `title`: aquí nombra la sección a la que pertenece la cuenta, `Users` (cuentas de acceso).
- `message`: lo que hizo el sistema, en inglés: la cuenta se actualizó.
- `data.user`: la cuenta tal como quedó guardada (aquí no importa el detalle: lo que se verifica es que la petición procedió).

(El sistema reconoce el correo propio y no se autobloquea.)

## 5. Escenario 4 — Alta con el correo de una cuenta dada de baja: procede, el correo quedó libre

Usuario: **A**.

**Endpoint:** `POST /api/users`

```json
{
  "userEmail": "qa-credencial-reingreso@gsti-tests.local",
  "userActive": true,
  "roleId": "<role_id>",
  "personId": "<person_id>",
  "userEmailType": "institutional"
}
```

(`<role_id>`: el `role_id` del rol `qa-credencial-admin` resuelto en Preparar. `<person_id>`: el `person_id` de `QACred/Persona02` resuelto en Preparar.)

**Response exacto:** `201` con la cuenta creada:

```json
{
  "type": "success",
  "title": "Users",
  "message": "The user was created successfully",
  "data": {
    "user": "..."
  }
}
```

Qué significa lo nuevo aquí:
- El `201`: la baja liberó el correo y puede reusarse, incluida la misma persona al reincorporarse.
- (El sobre de respuesta —`type`, `title`, `data.user`— es el ya explicado en el Escenario 3; aquí `message` confirma que la cuenta se creó.)

## 6. Escenario 5 — Alta con el mismo correo en mayúsculas: se rechaza igual

Usuario: **A**.

**Endpoint:** `POST /api/users`

```json
{
  "userEmail": "QA-CREDENCIAL-JUAN@gsti-tests.local",
  "userActive": true,
  "roleId": "<role_id>",
  "personId": "<person_id>",
  "userEmailType": "institutional"
}
```

(`<role_id>`: el `role_id` del rol `qa-credencial-admin` resuelto en Preparar. `<person_id>`: el `person_id` de `QACred/Persona03` resuelto en Preparar.)

**Response exacto:** `400`

```json
{
  "title": "Este correo de acceso ya está en uso",
  "detail": "Otra cuenta activa usa este correo de acceso; usa uno distinto o da de baja la cuenta que lo tiene. No se guardó ningún cambio.",
  "key": "correo-de-acceso-ya-registrado",
  "code": "USR.MAIL.002"
}
```

(Los datos son los ya explicados en el Escenario 1: para el sistema las mayúsculas no distinguen un correo de otro.)

## 7. Escenario 6 — Alta con el mismo correo con acento: se rechaza igual

Usuario: **A**.

**Endpoint:** `POST /api/users`

```json
{
  "userEmail": "qa-credencial-josé@gsti-tests.local",
  "userActive": true,
  "roleId": "<role_id>",
  "personId": "<person_id>",
  "userEmailType": "institutional"
}
```

(`<role_id>`: el `role_id` del rol `qa-credencial-admin` resuelto en Preparar. `<person_id>`: el `person_id` de `QACred/Persona04` resuelto en Preparar.)

**Response exacto:** `400`

```json
{
  "title": "Este correo de acceso ya está en uso",
  "detail": "Otra cuenta activa usa este correo de acceso; usa uno distinto o da de baja la cuenta que lo tiene. No se guardó ningún cambio.",
  "key": "correo-de-acceso-ya-registrado",
  "code": "USR.MAIL.002"
}
```

(Los datos son los ya explicados en el Escenario 1: para el sistema los acentos tampoco distinguen un correo de otro.)

## 8. Checklist

- [ ] Escenario 1 — Alta con correo de otra viva: 400 con título, detalle, clave y código
- [ ] Escenario 2 — Edición con correo de otra viva: 400 igual y ninguna cuenta cambia
- [ ] Escenario 3 — Edición con el propio correo: 201
- [ ] Escenario 4 — Alta con correo de baja: 201
- [ ] Escenario 5 — Alta en mayúsculas: 400 igual
- [ ] Escenario 6 — Alta con acento: 400 igual

Sin paso de limpieza: el recorrido no enciende ningún interruptor global (no toca banderas de instancia; lo sembrado se restaura recorriendo el seeder).
