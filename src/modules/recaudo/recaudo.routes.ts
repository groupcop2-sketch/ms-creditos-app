import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { JwtUserPayload } from '../../types/auth.js';
import { encabezados, parseArchivo, validarPlantilla } from './recaudo.logic.js';
import { ensureRecaudo, type PermisoRecaudo } from './recaudo.schema.js';
import * as svc from './recaudo.service.js';

function requirePermission(permission: PermisoRecaudo) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user as JwtUserPayload | undefined;
    if (!user?.permissions?.includes(permission)) {
      return reply.code(403).send({ message: 'Tu rol no tiene permiso para esta acción de Pagos y facturación' });
    }
  };
}
const usuarioId = (request: FastifyRequest) => {
  const sub = (request.user as JwtUserPayload | undefined)?.sub;
  return sub ? Number(sub) : null;
};

const periodo = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Periodo AAAA-MM');
const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha AAAA-MM-DD');
const id = z.object({ id: z.coerce.number().int().positive() });
const motivo = z.object({ motivo: z.string().trim().min(5, 'Escribe un motivo de al menos 5 caracteres').max(500) });
const texto = z.string().min(1, 'El archivo está vacío').max(5_000_000);
const plantilla = z.object({
  separador: z.enum([';', ',', '|', 'tab']),
  filaEncabezado: z.coerce.number().int().min(1).max(50),
  mapeo: z.record(z.string(), z.enum(['identificacion', 'valor', 'credito', 'nombre', 'novedad', 'periodo', 'fecha', ''])),
  novedades: z.record(z.string(), z.string().max(80)).default({}),
  archivoEjemplo: z.string().max(200_000).nullish()
});
const BIG = { bodyLimit: 6 * 1024 * 1024 };

export async function recaudoRoutes(app: FastifyInstance) {
  ensureRecaudo().catch((err) => app.log.error(err, 'No se pudo preparar el modulo de recaudo'));
  const read = { preHandler: [app.authenticate, requirePermission('recaudo:read')] };
  const cobro = { preHandler: [app.authenticate, requirePermission('recaudo:cobro')] };
  const aplicar = { preHandler: [app.authenticate, requirePermission('recaudo:aplicar')] };
  const config = { preHandler: [app.authenticate, requirePermission('recaudo:config')] };
  const cierre = { preHandler: [app.authenticate, requirePermission('recaudo:cierre')] };

  app.get('/periodos/:periodo', read, async (req) => svc.resumenPeriodo(z.object({ periodo }).parse(req.params).periodo));

  // Collection notices
  app.get('/cuentas-cobro/vista-previa', read, async (req) => {
    const q = z.object({ empresaId: z.coerce.number().int().positive(), periodo }).parse(req.query);
    return svc.vistaPreviaCobro(q.empresaId, q.periodo);
  });
  app.post('/cuentas-cobro', cobro, async (req) => {
    const b = z.object({ empresaId: z.number().int().positive(), periodo, fechaPagoNomina: fecha.nullish(), idCuentaEgreso: z.number().int().positive().nullish() }).parse(req.body);
    return svc.generarCuentaCobro({ ...b, usuarioId: usuarioId(req) });
  });
  app.get('/cuentas-cobro/:id', read, async (req) => svc.getCuentaCobro(id.parse(req.params).id));
  app.get('/cuentas-cobro/:id/pdf', read, async (req, reply) => {
    const { buffer, nombre } = await svc.pdfCuentaCobro(id.parse(req.params).id);
    return reply.header('Content-Type', 'application/pdf').header('Content-Disposition', `inline; filename="${nombre}"`).send(buffer);
  });
  app.get('/cuentas-cobro/:id/excel', read, async (req, reply) => {
    const { texto: csv, nombre } = await svc.csvCuentaCobro(id.parse(req.params).id);
    return reply.header('Content-Type', 'text/csv; charset=utf-8').header('Content-Disposition', `attachment; filename="${nombre}"`).send(csv);
  });
  app.post('/cuentas-cobro/:id/enviar', cobro, async (req) => {
    const b = z.object({ manual: z.boolean().optional() }).parse(req.body ?? {});
    return svc.enviarCuentaCobro(id.parse(req.params).id, { manual: b.manual, usuarioId: usuarioId(req) });
  });
  app.post('/cuentas-cobro/:id/anular', cobro, async (req) => svc.anularCuentaCobro(id.parse(req.params).id, motivo.parse(req.body).motivo));
  app.post('/cuentas-cobro/:id/no-giro', aplicar, async (req) => svc.marcarNoGiro(id.parse(req.params).id));

  // File templates
  app.get('/plantillas/:id', read, async (req) => svc.getPlantilla(id.parse(req.params).id));
  app.put('/plantillas/:id', config, async (req) => svc.guardarPlantilla(id.parse(req.params).id, plantilla.parse(req.body), usuarioId(req)));
  app.post('/plantillas/probar', { ...config, ...BIG }, async (req) => {
    const b = z.object({ plantilla, texto }).parse(req.body);
    const error = validarPlantilla(b.plantilla);
    const r = parseArchivo(b.texto, b.plantilla);
    return { error, encabezados: encabezados(b.texto, b.plantilla), filas: r.filas.length, muestra: r.filas.slice(0, 5), errores: r.errores.slice(0, 50), totalErrores: r.errores.length };
  });

  // Payment files
  app.post('/lotes/conciliar', { ...aplicar, ...BIG }, async (req) => svc.conciliarArchivo(z.object({ empresaId: z.number().int().positive(), periodo, texto }).parse(req.body)));
  app.post('/lotes', { ...aplicar, ...BIG }, async (req) => {
    const b = z.object({ empresaId: z.number().int().positive(), periodo, texto, nombreArchivo: z.string().max(200).nullish(), fechaGiro: fecha, valorGirado: z.number().nonnegative() }).parse(req.body);
    return svc.aplicarLote({ ...b, usuarioId: usuarioId(req) });
  });
  app.get('/lotes', read, async (req) => svc.listarLotes(z.object({ periodo }).parse(req.query).periodo));
  app.get('/lotes/:id', read, async (req) => svc.getLote(id.parse(req.params).id));
  app.post('/lotes/:id/reversar', aplicar, async (req) => svc.reversarLote(id.parse(req.params).id, motivo.parse(req.body).motivo, usuarioId(req)));
  app.post('/lotes/filas/:id/por-identificar', aplicar, async (req) => svc.dejarPorIdentificar(id.parse(req.params).id));
  app.post('/lotes/filas/:id/asignar', aplicar, async (req) => {
    const b = z.object({ creditoId: z.number().int().positive() }).parse(req.body);
    return svc.asignarFila(id.parse(req.params).id, b.creditoId, usuarioId(req));
  });
  app.post('/periodos/:periodo/novedades-revisadas', aplicar, async (req) => svc.marcarNovedadesRevisadas(z.object({ periodo }).parse(req.params).periodo));

  // Monthly close
  app.get('/cierres/:periodo', read, async (req) => svc.estadoCierre(z.object({ periodo }).parse(req.params).periodo));
  app.post('/cierres/:periodo', cierre, async (req) => svc.cerrarPeriodo(z.object({ periodo }).parse(req.params).periodo, usuarioId(req)));
  app.post('/cierres/:periodo/reabrir', cierre, async (req) => svc.reabrirPeriodo(z.object({ periodo }).parse(req.params).periodo, motivo.parse(req.body).motivo, usuarioId(req)));
}
