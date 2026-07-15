import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getDashboardGerencial, getReporteCartera, getReporteOperativo } from './dashboard.service.js';

const filterSchema = z.object({
  fechaInicio: z.string().date().optional(),
  fechaFin: z.string().date().optional()
});

const carteraFilterSchema = filterSchema.extend({
  idEmpresa: z.coerce.number().int().positive().optional(),
  idProducto: z.coerce.number().int().positive().optional(),
  idSocio: z.coerce.number().int().positive().optional(),
  estado: z.string().trim().optional()
});

export async function dashboardRoutes(app: FastifyInstance) {
  app.get('/gerencial', { preHandler: [app.authenticate] }, async (request) => {
    const filters = filterSchema.parse(request.query);
    return getDashboardGerencial(filters);
  });

  app.get('/cartera', { preHandler: [app.authenticate] }, async (request) => {
    const filters = carteraFilterSchema.parse(request.query);
    return getReporteCartera(filters);
  });
}
