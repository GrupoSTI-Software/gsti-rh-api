import Icon from '#models/icon'
import { BaseSeeder } from '@adonisjs/lucid/seeders'

/**
 * Catálogo de iconos para festividades, tomado de Tabler Icons
 * (https://tablericons.com/, licencia MIT): trazo único, `viewBox="0 0 24 24"`,
 * `stroke="currentColor"` y `stroke-width="1.75"` (el grosor único del DS),
 * sin relleno ni color literal. Así el icono hereda el color de quien lo monta
 * — se pinta en blanco sobre el medallón de color del calendario, con buen
 * contraste, en vez de traer siempre el mismo tono plano.
 */
export default class extends BaseSeeder {
  async run() {
    const icons = [
      {
        iconName: 'Genérico',
        iconSvg:
          '<svg\n  xmlns="http://www.w3.org/2000/svg"\n  viewBox="0 0 24 24"\n  fill="none"\n  stroke="currentColor"\n  stroke-width="1.75"\n  stroke-linecap="round"\n  stroke-linejoin="round"\n>\n  <path d="M4 5h2" />\n  <path d="M5 4v2" />\n  <path d="M11.5 4l-.5 2" />\n  <path d="M18 5h2" />\n  <path d="M19 4v2" />\n  <path d="M15 9l-1 1" />\n  <path d="M18 13l2 -.5" />\n  <path d="M18 19h2" />\n  <path d="M19 18v2" />\n  <path d="M14 16.518l-6.518 -6.518l-4.39 9.58a1 1 0 0 0 1.329 1.329l9.579 -4.39" />\n</svg>',
      },
      {
        iconName: 'Árboles',
        iconSvg:
          '<svg\n  xmlns="http://www.w3.org/2000/svg"\n  viewBox="0 0 24 24"\n  fill="none"\n  stroke="currentColor"\n  stroke-width="1.75"\n  stroke-linecap="round"\n  stroke-linejoin="round"\n>\n  <path d="M16 5l3 3l-2 1l4 4l-3 1l4 4h-9" />\n  <path d="M15 21l0 -3" />\n  <path d="M8 13l-2 -2" />\n  <path d="M8 12l2 -2" />\n  <path d="M8 21v-13" />\n  <path d="M5.824 16a3 3 0 0 1 -2.743 -3.69a3 3 0 0 1 .304 -4.833a3 3 0 0 1 4.615 -3.707a3 3 0 0 1 4.614 3.707a3 3 0 0 1 .305 4.833a3 3 0 0 1 -2.919 3.695h-4l-.176 -.005" />\n</svg>',
      },
      {
        iconName: 'Ángel',
        iconSvg:
          '<svg\n  xmlns="http://www.w3.org/2000/svg"\n  viewBox="0 0 24 24"\n  fill="none"\n  stroke="currentColor"\n  stroke-width="1.75"\n  stroke-linecap="round"\n  stroke-linejoin="round"\n>\n  <path d="M12 17.75l-6.172 3.245l1.179 -6.873l-5 -4.867l6.9 -1l3.086 -6.253l3.086 6.253l6.9 1l-5 4.867l1.179 6.873l-6.158 -3.245" />\n</svg>',
      },
      {
        iconName: 'Halloween',
        iconSvg:
          '<svg\n  xmlns="http://www.w3.org/2000/svg"\n  viewBox="0 0 24 24"\n  fill="none"\n  stroke="currentColor"\n  stroke-width="1.75"\n  stroke-linecap="round"\n  stroke-linejoin="round"\n>\n  <path d="M5 11a7 7 0 0 1 14 0v7a1.78 1.78 0 0 1 -3.1 1.4a1.65 1.65 0 0 0 -2.6 0a1.65 1.65 0 0 1 -2.6 0a1.65 1.65 0 0 0 -2.6 0a1.78 1.78 0 0 1 -3.1 -1.4v-7" />\n  <path d="M10 10l.01 0" />\n  <path d="M14 10l.01 0" />\n  <path d="M10 14a3.5 3.5 0 0 0 4 0" />\n</svg>',
      },
      {
        iconName: 'Regalo',
        iconSvg:
          '<svg\n  xmlns="http://www.w3.org/2000/svg"\n  viewBox="0 0 24 24"\n  fill="none"\n  stroke="currentColor"\n  stroke-width="1.75"\n  stroke-linecap="round"\n  stroke-linejoin="round"\n>\n  <path d="M3 9a1 1 0 0 1 1 -1h16a1 1 0 0 1 1 1v2a1 1 0 0 1 -1 1h-16a1 1 0 0 1 -1 -1l0 -2" />\n  <path d="M12 8l0 13" />\n  <path d="M19 12v7a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-7" />\n  <path d="M7.5 8a2.5 2.5 0 0 1 0 -5a4.8 8 0 0 1 4.5 5a4.8 8 0 0 1 4.5 -5a2.5 2.5 0 0 1 0 5" />\n</svg>',
      },
      {
        iconName: 'Pino navidad',
        iconSvg:
          '<svg\n  xmlns="http://www.w3.org/2000/svg"\n  viewBox="0 0 24 24"\n  fill="none"\n  stroke="currentColor"\n  stroke-width="1.75"\n  stroke-linecap="round"\n  stroke-linejoin="round"\n>\n  <path d="M12 3l4 4l-2 1l4 4l-3 1l4 4h-14l4 -4l-3 -1l4 -4l-2 -1l4 -4" />\n  <path d="M14 17v3a1 1 0 0 1 -1 1h-2a1 1 0 0 1 -1 -1v-3" />\n</svg>',
      },
      {
        iconName: 'Halloween II',
        iconSvg:
          '<svg\n  xmlns="http://www.w3.org/2000/svg"\n  viewBox="0 0 24 24"\n  fill="none"\n  stroke="currentColor"\n  stroke-width="1.75"\n  stroke-linecap="round"\n  stroke-linejoin="round"\n>\n  <path d="M9 15l1.5 1l1.5 -1l1.5 1l1.5 -1" />\n  <path d="M10 11h.01" />\n  <path d="M14 11h.01" />\n  <path d="M17 6.082c2.609 .588 3.627 4.162 2.723 7.983c-.903 3.82 -2.75 6.44 -5.359 5.853a3.355 3.355 0 0 1 -.774 -.279a3.728 3.728 0 0 1 -1.59 .361c-.556 0 -1.09 -.127 -1.59 -.362a3.296 3.296 0 0 1 -.774 .28c-2.609 .588 -4.456 -2.033 -5.36 -5.853c-.903 -3.82 .115 -7.395 2.724 -7.983c1.085 -.244 1.575 .066 2.585 .787c.716 -.554 1.54 -.869 2.415 -.869c.876 0 1.699 .315 2.415 .87c1.01 -.722 1.5 -1.032 2.585 -.788" />\n  <path d="M12 6c0 -1.226 .693 -2.346 1.789 -2.894l.211 -.106" />\n</svg>',
      },
      {
        iconName: 'Navidad',
        iconSvg:
          '<svg\n  xmlns="http://www.w3.org/2000/svg"\n  viewBox="0 0 24 24"\n  fill="none"\n  stroke="currentColor"\n  stroke-width="1.75"\n  stroke-linecap="round"\n  stroke-linejoin="round"\n>\n  <path d="M4 13a8 8 0 1 0 16 0a8 8 0 1 0 -16 0" />\n  <path d="M11 5l1 -2l1 2" />\n  <path d="M4.512 10.161c2.496 -1.105 4.992 -.825 7.488 .839c2.627 1.752 5.255 1.97 7.882 .653" />\n  <path d="M4.315 15.252c2.561 -1.21 5.123 -.96 7.685 .748c2.293 1.528 4.585 1.889 6.878 1.081" />\n</svg>',
      },
      {
        iconName: 'Halloween III',
        iconSvg:
          '<svg\n  xmlns="http://www.w3.org/2000/svg"\n  viewBox="0 0 24 24"\n  fill="none"\n  stroke="currentColor"\n  stroke-width="1.75"\n  stroke-linecap="round"\n  stroke-linejoin="round"\n>\n  <path d="M5 4v2l5 5" />\n  <path d="M2.5 9.5l1.5 1.5h6" />\n  <path d="M4 19v-2l6 -6" />\n  <path d="M19 4v2l-5 5" />\n  <path d="M21.5 9.5l-1.5 1.5h-6" />\n  <path d="M20 19v-2l-6 -6" />\n  <path d="M8 15a4 4 0 1 0 8 0a4 4 0 1 0 -8 0" />\n  <path d="M10 9a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" />\n</svg>',
      },
      {
        iconName: 'Navidad II',
        iconSvg:
          '<svg\n  xmlns="http://www.w3.org/2000/svg"\n  viewBox="0 0 24 24"\n  fill="none"\n  stroke="currentColor"\n  stroke-width="1.75"\n  stroke-linecap="round"\n  stroke-linejoin="round"\n>\n  <path d="M12 3a4 4 0 0 1 2.906 6.75a6 6 0 1 1 -5.81 0a4 4 0 0 1 2.904 -6.75" />\n  <path d="M17.5 11.5l2.5 -1.5" />\n  <path d="M6.5 11.5l-2.5 -1.5" />\n  <path d="M12 13h.01" />\n  <path d="M12 16h.01" />\n</svg>',
      },
      {
        iconName: 'Navidad III',
        iconSvg:
          '<svg\n  xmlns="http://www.w3.org/2000/svg"\n  viewBox="0 0 24 24"\n  fill="none"\n  stroke="currentColor"\n  stroke-width="1.75"\n  stroke-linecap="round"\n  stroke-linejoin="round"\n>\n  <path d="M3 8a3 3 0 0 1 3 -3h12a3 3 0 0 1 3 3v8a3 3 0 0 1 -3 3h-12a3 3 0 0 1 -3 -3l0 -8" />\n  <path d="M7 16l3 -3l3 3" />\n  <path d="M8 13c-.789 0 -2 -.672 -2 -1.5s.711 -1.5 1.5 -1.5c1.128 -.02 2.077 1.17 2.5 3c.423 -1.83 1.372 -3.02 2.5 -3c.789 0 1.5 .672 1.5 1.5s-1.211 1.5 -2 1.5h-4" />\n</svg>',
      },
      {
        iconName: 'Esqueleto',
        iconSvg:
          '<svg\n  xmlns="http://www.w3.org/2000/svg"\n  viewBox="0 0 24 24"\n  fill="none"\n  stroke="currentColor"\n  stroke-width="1.75"\n  stroke-linecap="round"\n  stroke-linejoin="round"\n>\n  <path d="M12 4c4.418 0 8 3.358 8 7.5c0 1.901 -.755 3.637 -2 4.96l0 2.54a1 1 0 0 1 -1 1h-10a1 1 0 0 1 -1 -1v-2.54c-1.245 -1.322 -2 -3.058 -2 -4.96c0 -4.142 3.582 -7.5 8 -7.5" />\n  <path d="M10 17v3" />\n  <path d="M14 17v3" />\n  <path d="M8 11a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" />\n  <path d="M14 11a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" />\n</svg>',
      },
      {
        iconName: 'Trabajo',
        iconSvg:
          '<svg\n  xmlns="http://www.w3.org/2000/svg"\n  viewBox="0 0 24 24"\n  fill="none"\n  stroke="currentColor"\n  stroke-width="1.75"\n  stroke-linecap="round"\n  stroke-linejoin="round"\n>\n  <path d="M3 9a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v9a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2l0 -9" />\n  <path d="M8 7v-2a2 2 0 0 1 2 -2h4a2 2 0 0 1 2 2v2" />\n  <path d="M12 12l0 .01" />\n  <path d="M3 13a20 20 0 0 0 18 0" />\n</svg>',
      },
      {
        iconName: 'Iglesia',
        iconSvg:
          '<svg\n  xmlns="http://www.w3.org/2000/svg"\n  viewBox="0 0 24 24"\n  fill="none"\n  stroke="currentColor"\n  stroke-width="1.75"\n  stroke-linecap="round"\n  stroke-linejoin="round"\n>\n  <path d="M3 21l18 0" />\n  <path d="M10 21v-4a2 2 0 0 1 4 0v4" />\n  <path d="M10 5l4 0" />\n  <path d="M12 3l0 5" />\n  <path d="M6 21v-7m-2 2l8 -8l8 8m-2 -2v7" />\n</svg>',
      },
      {
        iconName: 'Brindis',
        iconSvg:
          '<svg\n  xmlns="http://www.w3.org/2000/svg"\n  viewBox="0 0 24 24"\n  fill="none"\n  stroke="currentColor"\n  stroke-width="1.75"\n  stroke-linecap="round"\n  stroke-linejoin="round"\n>\n  <path d="M9 21h6" />\n  <path d="M12 16v5" />\n  <path d="M8 5a4 2 0 1 0 8 0a4 2 0 1 0 -8 0" />\n  <path d="M8 5c0 6.075 1.79 11 4 11s4 -4.925 4 -11" />\n</svg>',
      },
      {
        iconName: 'Santa',
        iconSvg:
          '<svg\n  xmlns="http://www.w3.org/2000/svg"\n  viewBox="0 0 24 24"\n  fill="none"\n  stroke="currentColor"\n  stroke-width="1.75"\n  stroke-linecap="round"\n  stroke-linejoin="round"\n>\n  <path d="M8 13v.01" />\n  <path d="M12 17v.01" />\n  <path d="M12 12v.01" />\n  <path d="M16 14v.01" />\n  <path d="M11 8v.01" />\n  <path d="M13.148 3.476l2.667 1.104a4 4 0 0 0 4.656 6.14l.053 .132a3 3 0 0 1 0 2.296q -.745 1.18 -1.024 1.852q -.283 .684 -.66 2.216a3 3 0 0 1 -1.624 1.623q -1.572 .394 -2.216 .661q -.712 .295 -1.852 1.024a3 3 0 0 1 -2.296 0q -1.203 -.754 -1.852 -1.024q -.707 -.292 -2.216 -.66a3 3 0 0 1 -1.623 -1.624q -.397 -1.577 -.661 -2.216q -.298 -.718 -1.024 -1.852a3 3 0 0 1 0 -2.296q .719 -1.116 1.024 -1.852q .257 -.62 .66 -2.216a3 3 0 0 1 1.624 -1.623q 1.547 -.384 2.216 -.661q .687 -.285 1.852 -1.024a3 3 0 0 1 2.296 0" />\n</svg>',
      },
      {
        iconName: 'Tumba',
        iconSvg:
          '<svg\n  xmlns="http://www.w3.org/2000/svg"\n  viewBox="0 0 24 24"\n  fill="none"\n  stroke="currentColor"\n  stroke-width="1.75"\n  stroke-linecap="round"\n  stroke-linejoin="round"\n>\n  <path d="M5 21v-2a3 3 0 0 1 3 -3h8a3 3 0 0 1 3 3v2h-14" />\n  <path d="M10 16v-5h-4v-4h4v-4h4v4h4v4h-4v5" />\n</svg>',
      },
      {
        iconName: 'Decoración',
        iconSvg:
          '<svg\n  xmlns="http://www.w3.org/2000/svg"\n  viewBox="0 0 24 24"\n  fill="none"\n  stroke="currentColor"\n  stroke-width="1.75"\n  stroke-linecap="round"\n  stroke-linejoin="round"\n>\n  <path d="M16 18a2 2 0 0 1 2 2a2 2 0 0 1 2 -2a2 2 0 0 1 -2 -2a2 2 0 0 1 -2 2m0 -12a2 2 0 0 1 2 2a2 2 0 0 1 2 -2a2 2 0 0 1 -2 -2a2 2 0 0 1 -2 2m-7 12a6 6 0 0 1 6 -6a6 6 0 0 1 -6 -6a6 6 0 0 1 -6 6a6 6 0 0 1 6 6" />\n</svg>',
      },
      {
        iconName: 'Celebración',
        iconSvg:
          '<svg\n  xmlns="http://www.w3.org/2000/svg"\n  viewBox="0 0 24 24"\n  fill="none"\n  stroke="currentColor"\n  stroke-width="1.75"\n  stroke-linecap="round"\n  stroke-linejoin="round"\n>\n  <path d="M14 8a2 2 0 0 0 -2 -2" />\n  <path d="M6 8a6 6 0 1 1 12 0c0 4.97 -2.686 9 -6 9s-6 -4.03 -6 -9" />\n  <path d="M12 17v1a2 2 0 0 1 -2 2h-3a2 2 0 0 0 -2 2" />\n</svg>',
      },
      {
        iconName: 'Amistad',
        iconSvg:
          '<svg\n  xmlns="http://www.w3.org/2000/svg"\n  viewBox="0 0 24 24"\n  fill="none"\n  stroke="currentColor"\n  stroke-width="1.75"\n  stroke-linecap="round"\n  stroke-linejoin="round"\n>\n  <path d="M19.5 12.572l-7.5 7.428l-7.5 -7.428a5 5 0 1 1 7.5 -6.566a5 5 0 1 1 7.5 6.572" />\n  <path d="M12 6l-3.293 3.293a1 1 0 0 0 0 1.414l.543 .543c.69 .69 1.81 .69 2.5 0l1 -1a3.182 3.182 0 0 1 4.5 0l2.25 2.25" />\n  <path d="M12.5 15.5l2 2" />\n  <path d="M15 13l2 2" />\n</svg>',
      },
      {
        iconName: 'Tumba II',
        iconSvg:
          '<svg\n  xmlns="http://www.w3.org/2000/svg"\n  viewBox="0 0 24 24"\n  fill="none"\n  stroke="currentColor"\n  stroke-width="1.75"\n  stroke-linecap="round"\n  stroke-linejoin="round"\n>\n  <path d="M7 16.17v-9.17a3 3 0 0 1 3 -3h4a3 3 0 0 1 3 3v9.171" />\n  <path d="M12 7v5" />\n  <path d="M10 9h4" />\n  <path d="M5 21v-2a3 3 0 0 1 3 -3h8a3 3 0 0 1 3 3v2h-14" />\n</svg>',
      },
      {
        iconName: 'Pino navidad II',
        iconSvg:
          '<svg\n  xmlns="http://www.w3.org/2000/svg"\n  viewBox="0 0 24 24"\n  fill="none"\n  stroke="currentColor"\n  stroke-width="1.75"\n  stroke-linecap="round"\n  stroke-linejoin="round"\n>\n  <path d="M10 4l2 1l2 -1" />\n  <path d="M12 2v6.5l3 1.72" />\n  <path d="M17.928 6.268l.134 2.232l1.866 1.232" />\n  <path d="M20.66 7l-5.629 3.25l.01 3.458" />\n  <path d="M19.928 14.268l-1.866 1.232l-.134 2.232" />\n  <path d="M20.66 17l-5.629 -3.25l-2.99 1.738" />\n  <path d="M14 20l-2 -1l-2 1" />\n  <path d="M12 22v-6.5l-3 -1.72" />\n  <path d="M6.072 17.732l-.134 -2.232l-1.866 -1.232" />\n  <path d="M3.34 17l5.629 -3.25l-.01 -3.458" />\n  <path d="M4.072 9.732l1.866 -1.232l.134 -2.232" />\n  <path d="M3.34 7l5.629 3.25l2.99 -1.738" />\n</svg>',
      },
      {
        iconName: 'Mazcota',
        iconSvg:
          '<svg\n  xmlns="http://www.w3.org/2000/svg"\n  viewBox="0 0 24 24"\n  fill="none"\n  stroke="currentColor"\n  stroke-width="1.75"\n  stroke-linecap="round"\n  stroke-linejoin="round"\n>\n  <path d="M14.7 13.5c-1.1 -2 -1.441 -2.5 -2.7 -2.5c-1.259 0 -1.736 .755 -2.836 2.747c-.942 1.703 -2.846 1.845 -3.321 3.291c-.097 .265 -.145 .677 -.143 .962c0 1.176 .787 2 1.8 2c1.259 0 3 -1 4.5 -1s3.241 1 4.5 1c1.013 0 1.8 -.823 1.8 -2c0 -.285 -.049 -.697 -.146 -.962c-.475 -1.451 -2.512 -1.835 -3.454 -3.538" />\n  <path d="M20.188 8.082a1.039 1.039 0 0 0 -.406 -.082h-.015c-.735 .012 -1.56 .75 -1.993 1.866c-.519 1.335 -.28 2.7 .538 3.052c.129 .055 .267 .082 .406 .082c.739 0 1.575 -.742 2.011 -1.866c.516 -1.335 .273 -2.7 -.54 -3.052l-.001 0" />\n  <path d="M9.474 9c.055 0 .109 0 .163 -.011c.944 -.128 1.533 -1.346 1.32 -2.722c-.203 -1.297 -1.047 -2.267 -1.932 -2.267c-.055 0 -.109 0 -.163 .011c-.944 .128 -1.533 1.346 -1.32 2.722c.204 1.293 1.048 2.267 1.933 2.267" />\n  <path d="M16.456 6.733c.214 -1.376 -.375 -2.594 -1.32 -2.722a1.164 1.164 0 0 0 -.162 -.011c-.885 0 -1.728 .97 -1.93 2.267c-.214 1.376 .375 2.594 1.32 2.722c.054 .007 .108 .011 .162 .011c.885 0 1.73 -.974 1.93 -2.267" />\n  <path d="M5.69 12.918c.816 -.352 1.054 -1.719 .536 -3.052c-.436 -1.124 -1.271 -1.866 -2.009 -1.866c-.14 0 -.277 .027 -.407 .082c-.816 .352 -1.054 1.719 -.536 3.052c.436 1.124 1.271 1.866 2.009 1.866c.14 0 .277 -.027 .407 -.082" />\n</svg>',
      },
      {
        iconName: 'Aeropuerto',
        iconSvg:
          '<svg\n  xmlns="http://www.w3.org/2000/svg"\n  viewBox="0 0 24 24"\n  fill="none"\n  stroke="currentColor"\n  stroke-width="1.75"\n  stroke-linecap="round"\n  stroke-linejoin="round"\n>\n  <path d="M3.59 7h8.82a1 1 0 0 1 .902 1.433l-1.44 3a1 1 0 0 1 -.901 .567h-5.942a1 1 0 0 1 -.901 -.567l-1.44 -3a1 1 0 0 1 .901 -1.433" />\n  <path d="M6 7l-.78 -2.342a.5 .5 0 0 1 .473 -.658h4.612a.5 .5 0 0 1 .475 .658l-.78 2.342" />\n  <path d="M8 2v2" />\n  <path d="M6 12v9h4v-9" />\n  <path d="M3 21h18" />\n  <path d="M22 5h-6l-1 -1" />\n  <path d="M18 3l2 2l-2 2" />\n  <path d="M10 17h7a2 2 0 0 1 2 2v2" />\n</svg>',
      },
      {
        iconName: 'Avión',
        iconSvg:
          '<svg\n  xmlns="http://www.w3.org/2000/svg"\n  viewBox="0 0 24 24"\n  fill="none"\n  stroke="currentColor"\n  stroke-width="1.75"\n  stroke-linecap="round"\n  stroke-linejoin="round"\n>\n  <path d="M16 10h4a2 2 0 0 1 0 4h-4l-4 7h-3l2 -7h-4l-2 2h-3l2 -4l-2 -4h3l2 2h4l-2 -7h3l4 7" />\n</svg>',
      },
      {
        iconName: 'Avión II',
        iconSvg:
          '<svg\n  xmlns="http://www.w3.org/2000/svg"\n  viewBox="0 0 24 24"\n  fill="none"\n  stroke="currentColor"\n  stroke-width="1.75"\n  stroke-linecap="round"\n  stroke-linejoin="round"\n>\n  <path d="M14.639 10.258l4.83 -1.294a2 2 0 1 1 1.035 3.863l-14.489 3.883l-4.45 -5.02l2.897 -.776l2.45 1.414l2.897 -.776l-3.743 -6.244l2.898 -.777l5.675 5.727" />\n  <path d="M3 21h18" />\n</svg>',
      },
      {
        iconName: 'Casa',
        iconSvg:
          '<svg\n  xmlns="http://www.w3.org/2000/svg"\n  viewBox="0 0 24 24"\n  fill="none"\n  stroke="currentColor"\n  stroke-width="1.75"\n  stroke-linecap="round"\n  stroke-linejoin="round"\n>\n  <path d="M5 12l-2 0l9 -9l9 9l-2 0" />\n  <path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-7" />\n  <path d="M9 21v-6a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v6" />\n</svg>',
      },
      {
        iconName: 'Herramienta',
        iconSvg:
          '<svg\n  xmlns="http://www.w3.org/2000/svg"\n  viewBox="0 0 24 24"\n  fill="none"\n  stroke="currentColor"\n  stroke-width="1.75"\n  stroke-linecap="round"\n  stroke-linejoin="round"\n>\n  <path d="M7 10h3v-3l-3.5 -3.5a6 6 0 0 1 8 8l6 6a2 2 0 0 1 -3 3l-6 -6a6 6 0 0 1 -8 -8l3.5 3.5" />\n</svg>',
      },
      {
        iconName: 'Martillo',
        iconSvg:
          '<svg\n  xmlns="http://www.w3.org/2000/svg"\n  viewBox="0 0 24 24"\n  fill="none"\n  stroke="currentColor"\n  stroke-width="1.75"\n  stroke-linecap="round"\n  stroke-linejoin="round"\n>\n  <path d="M11.414 10l-7.383 7.418a2.091 2.091 0 0 0 0 2.967a2.11 2.11 0 0 0 2.976 0l7.407 -7.385" />\n  <path d="M18.121 15.293l2.586 -2.586a1 1 0 0 0 0 -1.414l-7.586 -7.586a1 1 0 0 0 -1.414 0l-2.586 2.586a1 1 0 0 0 0 1.414l7.586 7.586a1 1 0 0 0 1.414 0" />\n</svg>',
      },
      {
        iconName: 'Bandera',
        iconSvg:
          '<svg\n  xmlns="http://www.w3.org/2000/svg"\n  viewBox="0 0 24 24"\n  fill="none"\n  stroke="currentColor"\n  stroke-width="1.75"\n  stroke-linecap="round"\n  stroke-linejoin="round"\n>\n  <path d="M5 5a5 5 0 0 1 7 0a5 5 0 0 0 7 0v9a5 5 0 0 1 -7 0a5 5 0 0 0 -7 0v-9" />\n  <path d="M5 21v-7" />\n</svg>',
      },
      {
        iconName: 'Arbol navidad',
        iconSvg:
          '<svg\n  xmlns="http://www.w3.org/2000/svg"\n  viewBox="0 0 24 24"\n  fill="none"\n  stroke="currentColor"\n  stroke-width="1.75"\n  stroke-linecap="round"\n  stroke-linejoin="round"\n>\n  <path d="M12 13l-2 -2" />\n  <path d="M12 12l2 -2" />\n  <path d="M12 21v-13" />\n  <path d="M9.824 16a3 3 0 0 1 -2.743 -3.69a3 3 0 0 1 .304 -4.833a3 3 0 0 1 4.615 -3.707a3 3 0 0 1 4.614 3.707a3 3 0 0 1 .305 4.833a3 3 0 0 1 -2.919 3.695h-4l-.176 -.005" />\n</svg>',
      },
    ]

    for (const icon of icons) {
      const { iconName, ...iconData } = icon
      await Icon.firstOrCreate({ iconName }, iconData)
    }
  }
}
