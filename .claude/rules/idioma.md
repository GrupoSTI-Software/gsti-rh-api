# Idioma

Todo el código, comentarios y documentación van en español, excepto:

- Nombres de variables, funciones, clases y métodos (en inglés, siguiendo convenciones de código).
- Palabras reservadas del lenguaje.
- Nombres de librerías o frameworks.

El repo tiene además un lint de neutralidad terminológica (`npm run lint:terminology`) que corre
en `pre-commit`, `pre-push` y CI: hay términos restringidos que no pueden aparecer en el código.
