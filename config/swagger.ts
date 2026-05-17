import { SwaggerConfig } from 'adonisjs-6-swagger'

export default {
  uiEnabled: false, //disable or enable swaggerUi route
  uiUrl: 'docs', // url path to swaggerUI
  specEnabled: false, //disable or enable swagger.json route
  specUrl: '/swagger.json',

  middleware: [], // middlewares array, for protect your swagger docs and spec endpoints

  options: {
    definition: {
      openapi: '3.0.0',
      info: {
        title: 'Principal API',
        version: '1.0.0',
        description: 'My application with swagger docs',
      },
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
        },
      },
      security: [
        {
          bearerAuth: [],
        },
      ],
    },

    apis: [
      'app/**/*.ts',
      '!app/modules/demo/**/*.ts',
      'docs/swagger/**/*.yml',
      'start/routes.ts',
      'start/routes/**/*.ts',
    ],
    basePath: '/',
  },
  mode: process.env.NODE_ENV === 'production' ? 'PRODUCTION' : 'RUNTIME',
  specFilePath: 'docs/swagger.json',
} as SwaggerConfig
