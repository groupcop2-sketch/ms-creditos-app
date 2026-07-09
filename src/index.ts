import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
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

  await app.register(cors, {
    origin: env.CORS_ORIGIN.split(',').map((item) => item.trim())
  });

  await registerAuthPlugin(app);
  await app.register(multipart, { limits: { fileSize: 20 * 1024 * 1024 } });
  await bootstrapSecurityModule();

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
