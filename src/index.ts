import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { ZodError } from 'zod';
import { env } from './config/env.js';
import { healthRoutes } from './routes/health.js';
import { statusRoutes } from './routes/status.js';
import { registerAuthPlugin } from './plugins/auth.js';
import { bootstrapSecurityModule } from './modules/security/security.bootstrap.js';
import { securityRoutes } from './modules/security/security.routes.js';
import { SecurityError } from './modules/security/security.service.js';
import { pagaduriasRoutes } from './modules/pagadurias/pagadurias.routes.js';
import { sociosRoutes } from './modules/socios/socios.routes.js';
import { aliadosRoutes } from './modules/aliados/aliados.routes.js';
import { comercialesRoutes } from './modules/comerciales/comerciales.routes.js';
import { creditosRoutes } from './modules/creditos/creditos.routes.js';
import { portalRoutes } from './modules/portal/portal.routes.js';
import { productosCreditosRoutes } from './modules/productos-creditos/productos-creditos.routes.js';
import { dashboardRoutes } from './modules/dashboard/dashboard.routes.js';
import { documentosRoutes } from './modules/documentos/documentos.routes.js';
import { firmasRoutes } from './modules/firmas/firmas.routes.js';

async function main() {
  const app = Fastify({ logger: true });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof SecurityError) {
      return reply.code(error.statusCode).send({ message: error.message });
    }

    if (error instanceof ZodError) {
      return reply.code(400).send({
        message: 'Datos invalidos',
        issues: error.issues
      });
    }

    app.log.error(error);
    const internalMessage = error instanceof Error ? error.message : 'Error interno del servidor';
    return reply.code(500).send({
      message: process.env.NODE_ENV === 'production' ? 'Error interno del servidor' : internalMessage
    });
  });

  const getAllowedOrigins = () => {
    const raw = env.CORS_ORIGIN.split(',').map((item) => item.trim()).filter(Boolean);
    const origins = new Set<string>();
    for (const item of raw) {
      if (item === '*') return '*';
      try {
        origins.add(new URL(item).origin);
      } catch {
        origins.add(item);
      }
    }
    return Array.from(origins);
  };

  const allowedOrigins = getAllowedOrigins();

  await app.register(cors, {
    origin: (origin, cb) => {
      if (!origin) {
        cb(null, true);
        return;
      }

      if (allowedOrigins === '*' || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
        cb(null, true);
        return;
      }

      if (origin.endsWith('.vercel.app') || origin.startsWith('http://localhost:')) {
        cb(null, true);
        return;
      }

      cb(null, true);
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
    credentials: true,
    optionsSuccessStatus: 204
  });

  await registerAuthPlugin(app);
  await app.register(multipart, { limits: { fileSize: 20 * 1024 * 1024 } });
  await app.register(swagger, {
    openapi: {
      openapi: '3.0.0',
      info: {
        title: 'Créditos API',
        version: '1.0.0',
        description: 'Documentación de los servicios de crédito, seguridad, empresas y portal'
      },
      tags: [
        { name: 'Security', description: 'Autenticación, usuarios, roles y permisos' },
        { name: 'Créditos', description: 'Gestión de créditos y documentos' },
        { name: 'Empresas', description: 'Gestión de empresas y pagadurías' },
        { name: 'Portal', description: 'Operaciones del portal de clientes' }
      ]
    }
  });
  await app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      persistAuthorization: true
    }
  });

  try {
    await bootstrapSecurityModule();
  } catch (error) {
    app.log.warn({ err: error }, 'No se pudo inicializar el catálogo de seguridad; la API continuará funcionando sin bootstrap de base de datos');
  }

  await app.register(healthRoutes, { prefix: '/api/v1' });
  await app.register(statusRoutes, { prefix: '/api/v1' });
  await app.register(securityRoutes, { prefix: '/api/v1/security' });
  await app.register(pagaduriasRoutes, { prefix: '/api/v1/empresas' });
  await app.register(pagaduriasRoutes, { prefix: '/api/v1/pagadurias' });
  await app.register(sociosRoutes, { prefix: '/api/v1/socios' });
  await app.register(aliadosRoutes, { prefix: '/api/v1/aliados' });
  await app.register(comercialesRoutes, { prefix: '/api/v1/comerciales' });
  await app.register(productosCreditosRoutes, { prefix: '/api/v1/productos-creditos' });
  await app.register(creditosRoutes, { prefix: '/api/v1/creditos' });
  await app.register(portalRoutes, { prefix: '/api/v1/portal' });
  await app.register(dashboardRoutes, { prefix: '/api/v1/dashboard' });
  await app.register(documentosRoutes, { prefix: '/api/v1/documentos' });
  await app.register(firmasRoutes, { prefix: '/api/v1/firmas' });

  app.get('/api/v1', async () => ({
    name: 'creditos-api',
    version: '0.1.0'
  }));

  try {
    await app.listen({ port: env.API_PORT, host: env.API_HOST });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

void main();
