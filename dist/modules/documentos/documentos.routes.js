import { z } from 'zod';
import { createTemplate, createTemplateVersion, documentVariables, generateDocument, generateFromPdfBase, getGeneratedDocument, getPdfBase, getTemplate, listPdfFields, listTemplates, replacePdfFields, savePdfBase } from './documentos.service.js';
export async function documentosRoutes(app) {
    app.get('/variables', { preHandler: [app.authenticate] }, async () => documentVariables);
    app.get('/plantillas', { preHandler: [app.authenticate] }, async () => listTemplates());
    app.get('/plantillas/:id', { preHandler: [app.authenticate] }, async (request) => {
        const { id } = z.object({ id: z.coerce.number().positive() }).parse(request.params);
        return getTemplate(id);
    });
    app.post('/plantillas', { preHandler: [app.authenticate] }, async (request) => {
        const body = z.object({
            codigo: z.string().trim().min(2),
            nombre: z.string().trim().min(2),
            descripcion: z.string().trim().nullable().optional(),
            tipoDocumento: z.string().trim().min(2),
            contenido: z.string().min(20)
        }).parse(request.body);
        return createTemplate(body);
    });
    app.post('/plantillas/:id/versiones', { preHandler: [app.authenticate] }, async (request) => {
        const { id } = z.object({ id: z.coerce.number().positive() }).parse(request.params);
        const body = z.object({ contenido: z.string().min(20), publicar: z.boolean().default(false) }).parse(request.body);
        return createTemplateVersion(id, body.contenido, body.publicar);
    });
    app.post('/plantillas/:id/generar', { preHandler: [app.authenticate] }, async (request) => {
        const { id } = z.object({ id: z.coerce.number().positive() }).parse(request.params);
        const { creditoId } = z.object({ creditoId: z.coerce.number().positive() }).parse(request.body);
        const template = await getTemplate(id);
        return template.modoPlantilla === 'PDF_BASE'
            ? generateFromPdfBase(id, creditoId)
            : generateDocument(id, creditoId);
    });
    app.post('/plantillas/:id/pdf-base', { preHandler: [app.authenticate] }, async (request) => {
        const { id } = z.object({ id: z.coerce.number().positive() }).parse(request.params);
        const file = await request.file();
        if (!file || file.mimetype !== 'application/pdf')
            throw new Error('Debes seleccionar un archivo PDF');
        return savePdfBase(id, file.filename, await file.toBuffer());
    });
    app.get('/plantillas/:id/pdf-base', { preHandler: [app.authenticate] }, async (request, reply) => {
        const { id } = z.object({ id: z.coerce.number().positive() }).parse(request.params);
        const document = await getPdfBase(id);
        return reply.header('Content-Type', 'application/pdf').send(document.contenido_pdf);
    });
    app.get('/plantillas/:id/campos-pdf', { preHandler: [app.authenticate] }, async (request) => {
        const { id } = z.object({ id: z.coerce.number().positive() }).parse(request.params);
        return listPdfFields(id);
    });
    app.put('/plantillas/:id/campos-pdf', { preHandler: [app.authenticate] }, async (request) => {
        const { id } = z.object({ id: z.coerce.number().positive() }).parse(request.params);
        const body = z.object({
            campos: z.array(z.object({
                variable: z.string().min(1), etiqueta: z.string().min(1),
                tipo: z.enum(['TEXTO', 'CASILLA', 'FIRMA']),
                pagina: z.number().int().positive(),
                x: z.number().min(0).max(1), y: z.number().min(0).max(1),
                ancho: z.number().positive().max(1), alto: z.number().positive().max(1),
                tamanoFuente: z.number().min(5).max(30)
            }))
        }).parse(request.body);
        return replacePdfFields(id, body.campos);
    });
    app.get('/generados/:id/pdf', { preHandler: [app.authenticate] }, async (request, reply) => {
        const { id } = z.object({ id: z.coerce.number().positive() }).parse(request.params);
        const document = await getGeneratedDocument(id);
        return reply
            .header('Content-Type', 'application/pdf')
            .header('Content-Disposition', `inline; filename="${document.nombre_archivo}"`)
            .send(document.contenido_pdf);
    });
}
