export async function healthRoutes(app) {
    app.get('/health', async () => ({
        status: 'ok',
        service: 'api',
        timestamp: new Date().toISOString()
    }));
}
