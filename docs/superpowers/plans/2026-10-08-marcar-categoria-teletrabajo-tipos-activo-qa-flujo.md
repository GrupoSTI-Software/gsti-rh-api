# Prueba manual — Marcar la categoría de teletrabajo en los tipos de activo

**Estado: entregado el 8 de octubre de 2026 y recorrido ese mismo día por una persona (quien lo escribió no lo caminó); los 5 objetivos de la lista se cumplieron.**

**Problema:** la norma de teletrabajo obliga a la empresa a darle a cada teletrabajador una silla ergonómica, el equipo de cómputo o impresión y los aditamentos que hagan falta, y a poder demostrar en una inspección qué le entregó a cada quien. Esas entregas ya se registran en Activos e insumos, pero la empresa no tenía cómo indicar cuáles de sus tipos de activo son justamente esos insumos de la norma.

**Solución:** en el catálogo de tipos de activo —**Empresa → Activos e insumos → Tipos y características**— cada tipo puede llevar una **Categoría de teletrabajo**: **Silla ergonómica**, **Equipo de cómputo o impresión** o **Aditamento**, o quedarse **Sin categoría**. La categoría se pone, se cambia o se quita en cualquier momento, y el catálogo la muestra junto al tipo.

Ejemplo: es como etiquetar las cajas de un almacén de la escuela por lo que contienen. Da igual si la caja la llenaste ayer o hace un año: le pones su etiqueta y quien vaya a revisar el almacén sabe de un vistazo qué hay dentro sin abrir ninguna caja.

## Glosario

- **Insumo de teletrabajo:** activo que la empresa entrega a quien trabaja desde casa porque la norma lo exige.
- **Aditamento:** accesorio que complementa el puesto en casa (por ejemplo monitor, teclado, reposapiés o diadema).
- **Tipo de activo:** clase de bien que la empresa da de alta en Activos e insumos (por ejemplo "Laptop") y de la que cuelgan los activos concretos.

## 1. Preparar

Prerrequisito: esta rama del API y la del backoffice están levantadas, y la base ya trae el módulo **Activos e insumos** en el menú.

Este manual se entrega para que una persona lo recorra en el navegador; el agente que lo escribió no lo camina.

Aviso: el archivo que siembra los datos es temporal y **no está versionado** en el repositorio, así que hay que tenerlo presente al armar el ambiente.

Ejecuta una vez el sembrador de QA compartido:

```bash
cd gsti-rh-api
node ace db:seed --files=database/seeders/_tmp_do_not_commit_qa_seeder.ts
```

Qué deja listo para esta prueba:

- **QA Fundadora**: la empresa donde se hace todo el recorrido, con el módulo **Activos e insumos** disponible.
- Dos tipos de activo que arrancan **sin categoría**: **Laptop QA** (se clasifica y se desclasifica durante el recorrido) y **Monitor QA** (se queda sin categoría, para comprobar que un tipo anterior a este cambio se ve igual que siempre).
- Dos cuentas de Recursos Humanos, con distinto permiso sobre Activos e insumos (ver la tabla).

El sembrador es el mismo que usan otras historias y trae también sus datos. **Señal para reconocer lo nuestro:** los dos tipos de esta prueba terminan su nombre en `QA`; cualquier otro tipo que aparezca en la empresa es de otra historia y no se toca.

## 2. Usuarios

Todas las cuentas tienen la contraseña `password`.

| | Correo | Contraseña | Qué es |
|---|---|---|---|
| **A** | `qa-supplies-update@gsti-tests.local` | `password` | Recursos Humanos que **puede consultar, dar de alta y editar** tipos de activo; con esta cuenta se clasifica |
| **B** | `qa-supplies-read@gsti-tests.local` | `password` | Recursos Humanos que **solo puede consultar** tipos de activo (no edita ni da de alta) |

Estado inicial y orden del recorrido: **Laptop QA** arranca **sin categoría**. El Escenario 4.1 la clasifica y el 4.3 crea un tipo nuevo; conviene recorrer los escenarios **en orden**, porque los siguientes dan por hecho lo que dejó el anterior.

## 3. Dónde probar

Menú lateral, grupo **Empresa** → opción **Activos e insumos**. Dentro de la pantalla, botón **Tipos y características** (arriba a la derecha) para abrir el catálogo de tipos.

URL directa de la pantalla: `http://127.0.0.1:3000/supplies` (la dirección **no** lleva `/es`).

Para entrar: en `http://127.0.0.1:3000`, botón **Continuar con contraseña**, llena **Correo electrónico** y **Contraseña** con el usuario que toque, botón **Entrar**.

Para elegir la empresa: arriba a la derecha abre **Mi cuenta** (el avatar) y en el campo **Empresa** elige **QA Fundadora**.

En el catálogo de **Tipos y características**, cada tipo es una tarjeta con su nombre y, a su lado, la **Categoría de teletrabajo**; abajo de cada tarjeta se agregan sus características.

## 4. Usuario A (positivo)

Con `qa-supplies-update@gsti-tests.local`: puede consultar, dar de alta y editar tipos de activo.

### 4.1 Marcar la categoría en un tipo que ya existía

Objetivo: comprobar que al elegir una categoría en un tipo que ya existía, la categoría se guarda sin renombrar el tipo y el catálogo la muestra.

1. Entra con el Usuario A y elige la empresa **QA Fundadora** (Mi cuenta → Empresa).
2. Abre **Empresa → Activos e insumos** y pulsa **Tipos y características**.
3. Busca la tarjeta del tipo **Laptop QA** (nació sin categoría).
4. En su selector **Categoría de teletrabajo** elige **Equipo de cómputo o impresión**.
5. Aparece un aviso con el texto **Categoría actualizada.**
6. El nombre del tipo sigue siendo **Laptop QA**, ahora con la etiqueta **Equipo de cómputo o impresión** a su lado.

### 4.2 Quitar la categoría

Objetivo: comprobar que al elegir Sin categoría el tipo vuelve a quedar sin categoría y se puede volver a clasificar cuando se quiera.

1. Con el Usuario A en **Tipos y características**, en el selector **Categoría de teletrabajo** de **Laptop QA** elige **Sin categoría**.
2. Aparece el aviso **Categoría actualizada.**
3. El tipo **Laptop QA** ya no muestra ninguna etiqueta de categoría a su lado (queda como estaba al inicio).
4. Vuelve a elegir **Equipo de cómputo o impresión** y guarda: la etiqueta regresa. (Deja la categoría puesta para los escenarios siguientes.)

### 4.3 Dar de alta un tipo con categoría desde el inicio

Objetivo: comprobar que un tipo nuevo nace ya clasificado y que el bloque de alta se reinicia solo después de crearlo.

1. Con el Usuario A en **Tipos y características**, en el campo **Nuevo tipo de activo** escribe `Silla Ergo`.
2. En el selector **Categoría de teletrabajo** de ese bloque de alta elige **Silla ergonómica**.
3. Pulsa **Crear tipo**.
4. La tarjeta del tipo **Silla Ergo** aparece en el catálogo con la etiqueta **Silla ergonómica** junto a su nombre.
5. El bloque de alta se reinicia: el campo **Nuevo tipo de activo** queda vacío (con su ayuda "Vehículos, herramienta, uniformes…") y el selector vuelve a **Sin categoría**.

### 4.4 Un tipo que nunca se clasificó se ve igual que siempre

Objetivo: comprobar que un tipo anterior a este cambio se ve sin categoría y funciona como cualquier otro del catálogo.

1. Con el Usuario A en **Tipos y características**, fíjate en la tarjeta del tipo **Monitor QA**.
2. **Negativo a comprobar a propósito:** **Monitor QA** no muestra ninguna etiqueta de categoría y su tarjeta se ve igual que siempre (no hay avisos ni campos nuevos en su interior).
3. Puedes abrir la tarjeta y agregarle una característica como a cualquier tipo: se comporta igual que antes de este cambio.

## 5. Usuario B (negativo): solo consulta

### 5.1 Con permiso solo de consulta, la categoría se ve como etiqueta y no hay selector

Objetivo: comprobar que quien solo puede consultar ve la categoría del tipo, pero no puede cambiarla ni dar de alta tipos.

1. Cierra la sesión y entra con el **Usuario B** (`qa-supplies-read@gsti-tests.local`).
2. Elige la empresa **QA Fundadora** y abre **Empresa → Activos e insumos → Tipos y características**.
3. El tipo **Silla Ergo** muestra su etiqueta **Silla ergonómica**; el tipo **Laptop QA** muestra **Equipo de cómputo o impresión**.
4. **Negativo a comprobar a propósito:** en ninguna tarjeta aparece el selector **Categoría de teletrabajo** (la categoría solo se ve como etiqueta).
5. **Negativo a comprobar a propósito:** no aparece el bloque **Nuevo tipo de activo** con su botón **Crear tipo**.
6. **Negativo a comprobar a propósito:** **Monitor QA** sigue sin etiqueta de categoría y se ve como cualquier otro tipo.

## 6. Lo que no se revisa aquí

Se declara no revisable desde esta pantalla y queda cubierto por las pruebas automatizadas del plan:

- **Una categoría distinta de las tres permitidas.** El selector solo ofrece las tres categorías y "Sin categoría", así que desde la pantalla no se puede mandar otra; el rechazo con su aviso solo se ve por HTTP.
- **Un tipo de otra empresa o que no existe.** El selector trabaja sobre los tipos de la empresa en pantalla; el rechazo de un tipo ajeno o inexistente solo se ve por HTTP.
- **El usuario que no tiene permiso para editar.** En el navegador la falta de permiso se ve como "no aparece el selector" (Escenario 5.1); el rechazo del servidor con su código solo se ve por HTTP.
- **El aislamiento entre empresas y el contenido de la respuesta.** Que un tipo de una empresa no se cuele en otra, y que la categoría venga en los datos de la pantalla, lo comprueban las pruebas del API.
- **Que clasificar o desclasificar no toca las asignaciones ni los resguardos.** La base de prueba no trae activos asignados a los tipos `QA`, así que aquí solo se comprueba el estado del tipo; que las asignaciones y resguardos pasados y futuros queden intactos lo comprueban las pruebas automatizadas.

## 7. Checklist

Cada casilla se marca contra el objetivo de su escenario, no contra "se hicieron los pasos":

- [x] 4.1 Marcar una categoría en **Laptop QA**: se guarda, no cambia el nombre y el catálogo muestra **Equipo de cómputo o impresión**
- [x] 4.2 Quitar la categoría: **Laptop QA** vuelve a "Sin categoría" y se puede reclasificar
- [x] 4.3 Alta de **Silla Ergo** con **Silla ergonómica**: nace clasificado y el bloque de alta se reinicia
- [x] 4.4 **Monitor QA** (tipo previo) se ve sin categoría y funciona igual que siempre
- [x] 5.1 Con solo consulta: se ve la categoría como etiqueta, no hay selector ni bloque de alta, y **Monitor QA** sigue sin etiqueta

Recorrido completo el 8 de octubre de 2026: las 5 casillas se marcaron **contra el objetivo de su escenario**, no contra "se hicieron los pasos".
