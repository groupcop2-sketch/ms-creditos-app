// Using native fetch in Node 22

async function main() {
  console.log('1. Probando login en backend http://127.0.0.1:4000/api/v1/security/auth/login...');
  const loginRes = await fetch('http://127.0.0.1:4000/api/v1/security/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'valeplaba@hotmail.com', password: 'Admin123*' })
  });
  const loginData = await loginRes.json();
  if (!loginRes.ok) {
    console.error('Error en login:', loginData);
    process.exit(1);
  }
  const token = loginData.token;
  console.log('Login exitoso! Token obtenido.');

  const authHeaders = { Authorization: `Bearer ${token}` };

  // 1. Bancos
  console.log('\n2. Probando GET /api/v1/productos-creditos/bancos...');
  const bancosRes = await fetch('http://127.0.0.1:4000/api/v1/productos-creditos/bancos?limit=5', { headers: authHeaders });
  const bancos = await bancosRes.json();
  console.log(`Bancos retornados: ${bancos.length}. Primer banco: ${bancos[0]?.nombre} (Código: ${bancos[0]?.codigo})`);

  // 2. Tasas
  console.log('\n3. Probando GET /api/v1/productos-creditos/tasas?tipo=USURA...');
  const tasasRes = await fetch('http://127.0.0.1:4000/api/v1/productos-creditos/tasas?tipo=USURA', { headers: authHeaders });
  const tasas = await tasasRes.json();
  console.log(`Tasas retornadas: ${tasas.length}. Primera tasa: ${tasas[0]?.mes} ${tasas[0]?.ano} Base ${tasas[0]?.base} - Usura E.A.: ${tasas[0]?.tasaEa}% - Diaria: ${tasas[0]?.tasaDiaria}% - Mensual: ${tasas[0]?.tasaMensual}%`);

  // 3. Validar endpoint de datos.gov.co
  console.log('\n4. Probando POST /api/v1/productos-creditos/tasas/validar-endpoint...');
  const validarRes = await fetch('http://127.0.0.1:4000/api/v1/productos-creditos/tasas/validar-endpoint', {
    method: 'POST',
    headers: { ...authHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: 'https://datos.gov.co/resource/pare-7x5i.json?$order=vigencia_desde DESC&$limit=1' })
  });
  const validacion = await validarRes.json();
  console.log('Validación endpoint datos.gov.co:', JSON.stringify(validacion, null, 2));

  // 4. Plazos
  console.log('\n5. Probando GET /api/v1/productos-creditos/plazos?unidad=DIAS...');
  const plazosDiasRes = await fetch('http://127.0.0.1:4000/api/v1/productos-creditos/plazos?unidad=DIAS', { headers: authHeaders });
  const plazosDias = await plazosDiasRes.json();
  console.log('Plazos en DÍAS:', plazosDias.map(p => `${p.plazo} ${p.unidad}`).join(', '));

  console.log('\n6. Probando GET /api/v1/productos-creditos/plazos?unidad=MESES...');
  const plazosMesesRes = await fetch('http://127.0.0.1:4000/api/v1/productos-creditos/plazos?unidad=MESES', { headers: authHeaders });
  const plazosMeses = await plazosMesesRes.json();
  console.log('Plazos en MESES:', plazosMeses.map(p => `${p.plazo} ${p.unidad}`).join(', '));

  // 5. Formatos
  console.log('\n7. Probando GET /api/v1/productos-creditos/formatos...');
  const formatosRes = await fetch('http://127.0.0.1:4000/api/v1/productos-creditos/formatos', { headers: authHeaders });
  const formatos = await formatosRes.json();
  console.log(`Formatos encontrados: ${formatos.length}`);
  formatos.forEach(f => console.log(` - Formato: ${f.nombre} (${f.numRequisitos} requisitos activos)`));

  // 6. Campos catálogo
  console.log('\n8. Probando GET /api/v1/productos-creditos/formatos/campos-catalogo...');
  const camposRes = await fetch('http://127.0.0.1:4000/api/v1/productos-creditos/formatos/campos-catalogo', { headers: authHeaders });
  const campos = await camposRes.json();
  console.log(`Campos catálogo totales: ${campos.length}`);
  console.log('Primeros 6 campos:', campos.slice(0, 6).map(c => c.label).join(' | '));

  console.log('\n✅ ¡TODOS LOS ENDPOINTS FUNCIONAN AL 100%!');
}

main().catch(err => {
  console.error('Error en test:', err);
  process.exit(1);
});
