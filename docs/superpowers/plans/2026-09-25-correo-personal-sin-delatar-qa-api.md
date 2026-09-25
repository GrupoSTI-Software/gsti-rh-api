# Prueba manual API — El correo ocupado se rechaza igual en alta y edición, sin confirmar que existe

**Problema:** cuando una empresa da de alta a un trabajador con un correo personal que otra empresa ya registró, el sistema lo rechaza, y el rechazo de hoy confirma que ese correo está registrado en algún lado. Además el alta y la edición responden distinto: uno señala el campo y el otro enumera qué dato está repetido, así que quien prueba correos se va por el camino que más le dice.

**Solución:** los dos momentos responden exactamente lo mismo, palabra por palabra: que ese correo no puede registrarse por política de la plataforma y que se use otro, sin decir que exista, ni en qué empresa, ni desde cuándo. El correo personal sigue único en toda la plataforma; el RFC sigue acotado por empresa.

Ejemplo: es como si en la tienda de la esquina te dijeran "esa tarjeta no pasa aquí, usa otra" tanto en caja como en devoluciones, sin decirte si la tarjeta existe ni de quién es.

(Se prueba con Postman, Insomnia o Bruno. URL base `http://127.0.0.1:3333`. La autenticación se asume resuelta por tu cliente.)

## 1. Preparar

```bash
cd gsti-rh-api
node ace db:seed --files=database/seeders/_tmp_do_not_commit_qa_seeder.ts
```

Deja listas dos empresas (A y B), un capturista en cada una, en A el expediente dueño del correo ocupado `qa-correo-ocupado@gsti-tests.local` y otro expediente en A con el RFC `QAID800101AAA`, y en B un expediente propio con un correo libre. Volver a correr el seeder restaura A y borra los expedientes que los escenarios crearon en B, para que todo se pueda repetir.

| | Correo | Contraseña | Variante |
|---|---|---|---|
| **A** | `qa-correo-capturista-a@gsti-tests.local` | `password` | Empresa que ya tiene el correo ocupado |
| **B** | `qa-correo-capturista-b@gsti-tests.local` | `password` | Capturista que prueba |

Identificadores públicos de las dos empresas, para el header `X-Business-Unit-Id`:

```sql
SELECT business_unit_slug, business_unit_public_id FROM business_units WHERE business_unit_slug IN ('qa-correo-a', 'qa-correo-b');
```

Identificadores de los expedientes sembrados (el correo va protegido en la base, así que se localizan por su nombre):

```sql
SELECT person_id, person_lastname, business_unit_id FROM people WHERE person_second_lastname = 'Correo' AND person_lastname IN ('CorreoOcupadoA', 'CorreoLibreB');
```

Debe traer dos filas: `CorreoOcupadoA` en la empresa A (el dueño del correo ocupado) y `CorreoLibreB` en la empresa B (el expediente propio que edita el Escenario 2).

## 2. Escenario 1 (CA-1) — Alta en B con el correo de A: 422 sin confirmar

Usuario: **B**.

**Endpoint:** `POST /api/persons`

Headers: `Authorization: Bearer <token de B>`, `X-Business-Unit-Id: <identificador público de B>`

```json
{
  "personFirstname": "QA",
  "personLastname": "CorreoProbe",
  "personSecondLastname": "Correo",
  "personEmail": "qa-correo-ocupado@gsti-tests.local"
}
```

**Response exacto:** `422`

```json
{
  "title": "No es posible registrar ese correo",
  "detail": "La política de la plataforma no permite registrar ese correo en este expediente. Captura otro correo personal, o deja el campo vacío: el acceso a la aplicación puede otorgarse con el correo institucional del trabajador.",
  "key": "no-es-posible-registrar-ese-correo",
  "code": "PERSON.IDENTITY.005"
}
```

El cuerpo no dice si ese correo existe, ni en qué empresa, ni desde cuándo, ni señala el campo que falló.

Qué significa cada dato:
- `title`: qué pasó, en palabras del negocio.
- `detail`: qué hacer (capturar otro correo o dejar el campo vacío y usar el correo de la empresa para el acceso).
- `key`: la clave estable del rechazo (siempre la misma en alta y edición).
- `code`: el código interno del catálogo (siempre `PERSON.IDENTITY.005` aquí).

## 3. Escenario 2 (CA-2/CA-3) — El mismo correo editando un expediente propio: idéntico byte a byte

Usuario: **B**. Es el expediente propio de B, el que tiene el correo libre; su identificador se resuelve con:

```sql
SELECT person_id FROM people WHERE person_second_lastname = 'Correo' AND person_lastname = 'CorreoLibreB';
```

**Endpoint:** `PUT /api/persons/<person_id del expediente propio en B>`

Headers: `Authorization: Bearer <token de B>`, `X-Business-Unit-Id: <identificador público de B>`

La edición siempre lleva el nombre del expediente; va incluido para que la respuesta sea la del correo y no la de otro dato faltante:

```json
{
  "personFirstname": "QA",
  "personLastname": "CorreoLibreB",
  "personEmail": "qa-correo-ocupado@gsti-tests.local"
}
```

**Response exacto:** `422`, con el mismo cuerpo del Escenario 1, carácter a carácter y en el mismo orden de claves:

```json
{
  "title": "No es posible registrar ese correo",
  "detail": "La política de la plataforma no permite registrar ese correo en este expediente. Captura otro correo personal, o deja el campo vacío: el acceso a la aplicación puede otorgarse con el correo institucional del trabajador.",
  "key": "no-es-posible-registrar-ese-correo",
  "code": "PERSON.IDENTITY.005"
}
```

Compáralo contra el del Escenario 1: mismo texto, mismas cuatro claves y en el mismo orden. El cuerpo no trae `correo electrónico`, ni `Ya existe`, ni `Dato duplicado`, ni `message`, ni `type`, ni `data`. Nada se guardó. (Los datos son los ya explicados en el Escenario 1.)

## 4. Escenario 3 (CA-4) — Alta con correo libre: procede

Usuario: **B**.

**Endpoint:** `POST /api/persons`

Headers: `Authorization: Bearer <token de B>`, `X-Business-Unit-Id: <identificador público de B>`

El correo tiene que estar libre, así que usa algo distinto cada vez que corras el escenario (por ejemplo `qa-correo-libre-2026-09-25-1030@gsti-tests.local`):

```json
{
  "personFirstname": "QA",
  "personLastname": "CorreoNuevoB",
  "personSecondLastname": "Correo",
  "personEmail": "qa-correo-libre-<fecha-hora>@gsti-tests.local"
}
```

**Response exacto:** `201`

```json
{
  "type": "success",
  "title": "Persons",
  "message": "The person was created successfully",
  "data": { "person": { "personId": 123, "personFirstname": "QA", "...": "..." } }
}
```

Qué significa cada dato:
- `type`: qué tan bien salió la petición. Puede valer `success` (sí se hizo lo pedido).
- `title` / `message`: el encabezado y la frase del resultado.
- `data.person.personId`: el número del expediente recién creado en tu empresa.

## 5. Escenario 4 (CA-5) — RFC repetido en otra empresa: procede y no trae el mensaje del correo

Usuario: **B**. El RFC `QAID800101AAA` ya lo tiene un expediente de A, y el RFC está acotado por empresa: repetirlo desde B procede.

**Endpoint:** `POST /api/persons`

Headers: `Authorization: Bearer <token de B>`, `X-Business-Unit-Id: <identificador público de B>`

```json
{
  "personFirstname": "QA",
  "personLastname": "CorreoRfcB",
  "personSecondLastname": "Correo",
  "personEmail": "qa-correo-rfc-b@gsti-tests.local",
  "personRfc": "QAID800101AAA"
}
```

**Response exacto:** `201` (misma forma de éxito del Escenario 3) y el cuerpo **no** trae `PERSON.IDENTITY.005`. (Los datos son los ya explicados en el Escenario 3.)

## 6. Escenario 5 (CA-9, soporte) — El capturista llama: se cierra con la salida práctica

Sin endpoint: es una lectura cruzada del guion de soporte de esta historia contra el `detail` del Escenario 1. Toma el guion y comprueba, uno por uno, que:

- la primera salida que ofrece es la práctica: capturar otro correo personal, o dejar el campo vacío y otorgar el acceso con el correo institucional del trabajador;
- no confirma que el correo exista, ni en qué empresa está, ni desde cuándo, ni qué dato está repetido;
- no enuncia la regla de unicidad ("cada correo una sola vez"), porque eso convertiría el rechazo en un silogismo;
- si la persona insiste, se repite la salida práctica y se ofrece dejar el campo vacío ahora y completar después, sin pedirle que pruebe variantes del correo;
- el escalamiento queda dicho (a quién y cómo), sin anotar el correo probado en texto libre.

Si algún tramo del guion se apoya en algo que el `detail` no dice, ese tramo se reescribe: el `detail` es el único texto que la persona usuaria ve.

Estado vacío no observable con este seeder: el caso que exige que ningún correo esté ocupado no se puede provocar aquí, porque el seeder siempre deja uno ocupado (`qa-correo-ocupado@gsti-tests.local`). Se declara y no se le inventan pasos.

## 7. Checklist

- [ ] Escenario 1 — Alta con correo de otra empresa: 422 con `key`/`code` del correo, sin confirmar existencia
- [ ] Escenario 2 — Edición con el mismo correo: cuerpo idéntico al del alta, sin enumerar el dato
- [ ] Escenario 3 — Alta con correo libre: 201 sin fricción
- [ ] Escenario 4 — RFC de otra empresa: 201 sin el mensaje del correo
- [ ] Escenario 5 — Soporte cierra con guion + política, sin revelar la causa
