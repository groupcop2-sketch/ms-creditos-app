import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const client = new pg.Client({
  host: process.env.PGHOST,
  port: parseInt(process.env.PGPORT || '6543', 10),
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE,
  ssl: { rejectUnauthorized: false }
});

// Compound rate calculations
function calculatePeriods(ea, base) {
  // ea in percentage e.g. 28.59
  const r = ea / 100;
  const diaria = Math.pow(1 + r, 1 / base) - 1;
  const semanal = Math.pow(1 + r, 7 / 365) - 1;
  const quincenal = Math.pow(1 + r, 1 / 24) - 1;
  const mensual = Math.pow(1 + r, 1 / 12) - 1;
  const bimestral = Math.pow(1 + r, 1 / 6) - 1;
  const trimestral = Math.pow(1 + r, 1 / 4) - 1;
  const cuatrimestral = Math.pow(1 + r, 1 / 3) - 1;

  return {
    diaria: Number((diaria * 100).toFixed(5)),
    semanal: Number((semanal * 100).toFixed(5)),
    quincenal: Number((quincenal * 100).toFixed(5)),
    mensual: Number((mensual * 100).toFixed(5)),
    bimestral: Number((bimestral * 100).toFixed(5)),
    trimestral: Number((trimestral * 100).toFixed(5)),
    cuatrimestral: Number((cuatrimestral * 100).toFixed(5))
  };
}

const officialBanks = [
  { nombre: 'BANCO AGRARIO', codigo: '040' },
  { nombre: 'BANCO AV VILLAS', codigo: '052' },
  { nombre: 'BANCO CAJA SOCIAL', codigo: '032' },
  { nombre: 'BANCO COOPERATIVO COOPCENTRAL', codigo: '066' },
  { nombre: 'BANCO DAVIVIENDA', codigo: '051' },
  { nombre: 'BANCO DE BOGOTÁ', codigo: '001' },
  { nombre: 'BANCO DE LAS MICROFIANZAS BANCAMIA', codigo: '059' },
  { nombre: 'BANCO DE OCCIDENTE', codigo: '023' },
  { nombre: 'BANCO FALABELLA SA', codigo: '062' },
  { nombre: 'BANCO FINANDINA SA', codigo: '063' },
  { nombre: 'BANCO GNB SUDAMERIS', codigo: '012' },
  { nombre: 'BANCO MULTIBANK SA', codigo: '064' },
  { nombre: 'BANCO MUNDO MUJER', codigo: '047' },
  { nombre: 'BANCO PICHINCHA', codigo: '060' },
  { nombre: 'BANCO POPULAR', codigo: '002' },
  { nombre: 'BANCO PROCREDIT', codigo: '058' },
  { nombre: 'BANCO SANTANDER DE NEGOCIOS', codigo: '065' },
  { nombre: 'BANCO SERFINANZA', codigo: '067' },
  { nombre: 'BANCO UNION COLOMBIANO', codigo: '022' },
  { nombre: 'BANCOLOMBIA', codigo: '007' },
  { nombre: 'BBVA COLOMBIA', codigo: '013' },
  { nombre: 'CITIBANK', codigo: '009' },
  { nombre: 'SCOTIABANK COLPATRIA', codigo: '019' },
  { nombre: 'ITAU CORPBANCA', codigo: '006' },
  { nombre: 'NEQUI', codigo: '507' },
  { nombre: 'DAVIPLATA', codigo: '551' },
  { nombre: 'IRIS', codigo: '070' },
  { nombre: 'LULO BANK', codigo: '071' },
  { nombre: 'NU COLOMBIA', codigo: '072' },
  { nombre: 'RAPPIPAY', codigo: '801' },
  { nombre: 'DALE!', codigo: '802' },
  { nombre: 'MOVII', codigo: '803' },
  { nombre: 'GLOBAL66', codigo: '804' },
  { nombre: 'POWWI', codigo: '805' },
  { nombre: 'COOFINEP', codigo: '289' },
  { nombre: 'CONFIAR COOPERATIVA FINANCIERA', codigo: '292' },
  { nombre: 'COOTRAFA', codigo: '291' },
  { nombre: 'COOPMEDAS', codigo: '293' },
  { nombre: 'COOPROGRESO', codigo: '294' },
  { nombre: 'FINANCIERA COMULTRASAN', codigo: '290' },
  { nombre: 'JURISCOOP', codigo: '061' },
  { nombre: 'MIBANCO', codigo: '069' }
];

async function main() {
  await client.connect();
  console.log('--- Conectado a Supabase PostgreSQL ---');

  // 1. Asegurar columna codigo en TBL_BANCOS
  await client.query(`
    ALTER TABLE "Creditos"."TBL_BANCOS"
      ADD COLUMN IF NOT EXISTS codigo VARCHAR(20) NULL;
  `);
  console.log('1. TBL_BANCOS actualizado con columna codigo.');

  // Actualizar o insertar bancos oficiales con su código
  for (const b of officialBanks) {
    const existing = await client.query(
      `SELECT id_banco FROM "Creditos"."TBL_BANCOS" WHERE UPPER(TRIM(des_banco)) = UPPER(TRIM($1))`,
      [b.nombre]
    );
    if (existing.rowCount && existing.rowCount > 0) {
      await client.query(
        `UPDATE "Creditos"."TBL_BANCOS" SET codigo = $1, fec_actualizacion = NOW() WHERE id_banco = $2`,
        [b.codigo, existing.rows[0].id_banco]
      );
    } else {
      await client.query(
        `INSERT INTO "Creditos"."TBL_BANCOS" (des_banco, codigo, fec_creacion) VALUES ($1, $2, NOW())`,
        [b.nombre, b.codigo]
      );
    }
  }
  console.log(`Bancos oficiales actualizados/insertados (${officialBanks.length}).`);

  // 2. Crear tabla TBL_TASAS_REFERENCIA (Usura / DTF / Mora)
  await client.query(`
    CREATE TABLE IF NOT EXISTS "Creditos"."TBL_TASAS_REFERENCIA" (
      id_tasa SERIAL PRIMARY KEY,
      tipo_tasa VARCHAR(30) NOT NULL DEFAULT 'USURA',
      mes VARCHAR(30) NOT NULL,
      ano INTEGER NOT NULL,
      base INTEGER NOT NULL DEFAULT 365,
      tasa_ea NUMERIC(10,4) NOT NULL,
      tasa_diaria NUMERIC(10,5) NOT NULL,
      tasa_semanal NUMERIC(10,5) NOT NULL,
      tasa_mensual NUMERIC(10,5) NOT NULL,
      tasa_quincenal NUMERIC(10,5) NOT NULL,
      tasa_bimestral NUMERIC(10,5) NOT NULL,
      tasa_trimestral NUMERIC(10,5) NOT NULL,
      tasa_cuatrimestral NUMERIC(10,5) NOT NULL,
      resolucion VARCHAR(80) NULL,
      modalidad VARCHAR(120) NULL DEFAULT 'CONSUMO Y ORDINARIO',
      fuente VARCHAR(100) NULL DEFAULT 'SUPERFINANCIERA / DATOS.GOV.CO',
      fec_vigencia_desde DATE NULL,
      fec_vigencia_hasta DATE NULL,
      fec_creacion TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
      fec_actualizacion TIMESTAMP WITHOUT TIME ZONE NULL,
      CONSTRAINT uq_tasa_mes_ano_base UNIQUE (tipo_tasa, mes, ano, base)
    );
  `);
  console.log('2. TBL_TASAS_REFERENCIA creada/asegurada.');

  // Semilla de tasas históricas según Screenshot 2
  const seedTasas = [
    { mes: 'OCTUBRE', ano: 2026, base: 365, ea: 28.59, resolucion: '1472' },
    { mes: 'OCTUBRE', ano: 2026, base: 360, ea: 28.59, resolucion: '1472' },
    { mes: 'SEPTIEMBRE', ano: 2026, base: 365, ea: 29.24, resolucion: '1260' },
    { mes: 'SEPTIEMBRE', ano: 2026, base: 360, ea: 29.24, resolucion: '1260' },
    { mes: 'AGOSTO', ano: 2026, base: 365, ea: 29.66, resolucion: '1150' },
    { mes: 'AGOSTO', ano: 2026, base: 360, ea: 29.66, resolucion: '1150' },
    { mes: 'JULIO', ano: 2026, base: 365, ea: 28.79, resolucion: '1012' },
    { mes: 'JULIO', ano: 2026, base: 360, ea: 28.79, resolucion: '1012' },
    { mes: 'JUNIO', ano: 2026, base: 365, ea: 28.79, resolucion: '0890' },
    { mes: 'MAYO', ano: 2026, base: 365, ea: 28.17, resolucion: '0754' },
    { mes: 'ABRIL', ano: 2026, base: 365, ea: 26.76, resolucion: '0610' },
    { mes: 'MARZO', ano: 2026, base: 365, ea: 25.52, resolucion: '0480' },
    { mes: 'ENERO', ano: 2026, base: 365, ea: 24.36, resolucion: '0120' },
    { mes: 'NOVIEMBRE', ano: 2025, base: 365, ea: 24.99, resolucion: '1540' }
  ];

  for (const t of seedTasas) {
    const calc = calculatePeriods(t.ea, t.base);
    await client.query(`
      INSERT INTO "Creditos"."TBL_TASAS_REFERENCIA"
      (tipo_tasa, mes, ano, base, tasa_ea, tasa_diaria, tasa_semanal, tasa_mensual, tasa_quincenal, tasa_bimestral, tasa_trimestral, tasa_cuatrimestral, resolucion)
      VALUES
      ('USURA', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      ON CONFLICT (tipo_tasa, mes, ano, base) DO UPDATE SET
        tasa_ea = EXCLUDED.tasa_ea,
        tasa_diaria = EXCLUDED.tasa_diaria,
        tasa_semanal = EXCLUDED.tasa_semanal,
        tasa_mensual = EXCLUDED.tasa_mensual,
        tasa_quincenal = EXCLUDED.tasa_quincenal,
        tasa_bimestral = EXCLUDED.tasa_bimestral,
        tasa_trimestral = EXCLUDED.tasa_trimestral,
        tasa_cuatrimestral = EXCLUDED.tasa_cuatrimestral,
        resolucion = EXCLUDED.resolucion,
        fec_actualizacion = NOW();
    `, [
      t.mes, t.ano, t.base, t.ea,
      calc.diaria, calc.semanal, calc.mensual, calc.quincenal, calc.bimestral, calc.trimestral, calc.cuatrimestral,
      t.resolucion
    ]);
  }
  console.log(`Tasas semilla insertadas/actualizadas (${seedTasas.length}).`);

  // Semilla para pestaña DTF
  const seedDtf = [
    { mes: 'OCTUBRE', ano: 2026, base: 365, ea: 9.85 },
    { mes: 'SEPTIEMBRE', ano: 2026, base: 365, ea: 10.12 },
    { mes: 'AGOSTO', ano: 2026, base: 365, ea: 10.45 }
  ];
  for (const t of seedDtf) {
    const calc = calculatePeriods(t.ea, t.base);
    await client.query(`
      INSERT INTO "Creditos"."TBL_TASAS_REFERENCIA"
      (tipo_tasa, mes, ano, base, tasa_ea, tasa_diaria, tasa_semanal, tasa_mensual, tasa_quincenal, tasa_bimestral, tasa_trimestral, tasa_cuatrimestral)
      VALUES
      ('DTF', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (tipo_tasa, mes, ano, base) DO UPDATE SET
        tasa_ea = EXCLUDED.tasa_ea,
        tasa_diaria = EXCLUDED.tasa_diaria,
        tasa_semanal = EXCLUDED.tasa_semanal,
        tasa_mensual = EXCLUDED.tasa_mensual,
        tasa_quincenal = EXCLUDED.tasa_quincenal,
        tasa_bimestral = EXCLUDED.tasa_bimestral,
        tasa_trimestral = EXCLUDED.tasa_trimestral,
        tasa_cuatrimestral = EXCLUDED.tasa_cuatrimestral,
        fec_actualizacion = NOW();
    `, [
      t.mes, t.ano, t.base, t.ea,
      calc.diaria, calc.semanal, calc.mensual, calc.quincenal, calc.bimestral, calc.trimestral, calc.cuatrimestral
    ]);
  }
  console.log('Tasas DTF semilla registradas.');

  // 3. Crear tabla TBL_PLAZOS_PAGO (con soporte para días y meses)
  await client.query(`
    CREATE TABLE IF NOT EXISTS "Creditos"."TBL_PLAZOS_PAGO" (
      id_plazo SERIAL PRIMARY KEY,
      plazo INTEGER NOT NULL,
      unidad VARCHAR(20) NOT NULL DEFAULT 'DIAS',
      descripcion VARCHAR(120) NULL,
      activo BOOLEAN NOT NULL DEFAULT TRUE,
      orden INTEGER NOT NULL DEFAULT 0,
      fec_creacion TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
      fec_actualizacion TIMESTAMP WITHOUT TIME ZONE NULL,
      CONSTRAINT uq_plazo_unidad UNIQUE (plazo, unidad)
    );
  `);
  console.log('3. TBL_PLAZOS_PAGO creada/asegurada.');

  const seedPlazos = [
    { plazo: 8, unidad: 'DIAS', descripcion: '8 días' },
    { plazo: 15, unidad: 'DIAS', descripcion: '15 días' },
    { plazo: 30, unidad: 'DIAS', descripcion: '30 días' },
    { plazo: 60, unidad: 'DIAS', descripcion: '60 días' },
    { plazo: 90, unidad: 'DIAS', descripcion: '90 días' },
    { plazo: 3, unidad: 'MESES', descripcion: '3 meses' },
    { plazo: 6, unidad: 'MESES', descripcion: '6 meses' },
    { plazo: 12, unidad: 'MESES', descripcion: '12 meses' },
    { plazo: 24, unidad: 'MESES', descripcion: '24 meses' },
    { plazo: 36, unidad: 'MESES', descripcion: '36 meses' },
    { plazo: 48, unidad: 'MESES', descripcion: '48 meses' },
    { plazo: 60, unidad: 'MESES', descripcion: '60 meses' }
  ];

  for (const p of seedPlazos) {
    await client.query(`
      INSERT INTO "Creditos"."TBL_PLAZOS_PAGO" (plazo, unidad, descripcion, activo)
      VALUES ($1, $2, $3, true)
      ON CONFLICT (plazo, unidad) DO UPDATE SET
        descripcion = EXCLUDED.descripcion,
        activo = true;
    `, [p.plazo, p.unidad, p.descripcion]);
  }
  console.log(`Plazos semilla insertados/actualizados (${seedPlazos.length}).`);

  // 4. Crear tabla TBL_FORMATOS_CREDITO
  await client.query(`
    CREATE TABLE IF NOT EXISTS "Creditos"."TBL_FORMATOS_CREDITO" (
      id_formato_credito SERIAL PRIMARY KEY,
      nombre VARCHAR(150) NOT NULL UNIQUE,
      descripcion VARCHAR(255) NULL,
      campos JSONB NOT NULL DEFAULT '{}'::jsonb,
      num_requisitos INTEGER NOT NULL DEFAULT 19,
      activo BOOLEAN NOT NULL DEFAULT TRUE,
      fec_creacion TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
      fec_actualizacion TIMESTAMP WITHOUT TIME ZONE NULL
    );
  `);
  console.log('4. TBL_FORMATOS_CREDITO creada/asegurada.');

  const formatoFull = {
    valorCreditoSolicitar: true,
    valorDesembolso: true,
    valorCuota: true,
    plazo: true,
    tasaInteresSolicitar: true,
    atributosCreditoSolicitar: true,
    planAmortizacionSolicitar: true,
    tasaInteres: true,
    valorCredito: true,
    primeraCuota: true,
    interesAjustable: true,
    metodo: true,
    cartera: true,
    calificacionRiesgo: true,
    saldoCredito: true,
    atributosCredito: true,
    planAmortizacion: true,
    documentosCredito: true,
    extractos: true
  };

  const seedFormatos = [
    {
      nombre: 'CREDITO',
      descripcion: 'Formato estándar completo de crédito comercial y libranza',
      campos: formatoFull,
      num_requisitos: 19
    },
    {
      nombre: 'LIBRANZA EXPRESS',
      descripcion: 'Formato simplificado para créditos rápidos de bajo monto',
      campos: {
        ...formatoFull,
        interesAjustable: false,
        calificacionRiesgo: false,
        extractos: false
      },
      num_requisitos: 16
    }
  ];

  for (const f of seedFormatos) {
    await client.query(`
      INSERT INTO "Creditos"."TBL_FORMATOS_CREDITO" (nombre, descripcion, campos, num_requisitos, activo)
      VALUES ($1, $2, $3, $4, true)
      ON CONFLICT (nombre) DO UPDATE SET
        descripcion = EXCLUDED.descripcion,
        campos = EXCLUDED.campos,
        num_requisitos = EXCLUDED.num_requisitos,
        activo = true;
    `, [f.nombre, f.descripcion, JSON.stringify(f.campos), f.num_requisitos]);
  }
  console.log(`Formatos de crédito semilla insertados (${seedFormatos.length}).`);

  // 5. Asegurar submódulos en TBL_SUB_MODULOS para Utilitarios / Créditos
  // Verificamos si existe el módulo "UTILITARIOS" o lo agregamos a "CREDITOS"
  const modCreditosRes = await client.query(`SELECT id_modulo FROM "Creditos"."TBL_MODULOS" WHERE v_nom_modulo = 'CREDITOS'`);
  const idModCreditos = modCreditosRes.rows[0]?.id_modulo || 12;

  const submodulosNuevos = [
    { nombre: 'Entidades bancarias', desc: 'Gestión y catálogo de bancos oficiales', link: '/creditos/bancos', id_modulo: idModCreditos },
    { nombre: 'Tasas de interés', desc: 'Tasas de usura, DTF y mora con datos.gov.co', link: '/creditos/tasas', id_modulo: idModCreditos },
    { nombre: 'Plazo de pago', desc: 'Configuración de plazos por días y meses', link: '/creditos/plazos', id_modulo: idModCreditos },
    { nombre: 'Formatos de créditos', desc: 'Estructura y campos visibles del crédito', link: '/creditos/formatos', id_modulo: idModCreditos }
  ];

  for (const sm of submodulosNuevos) {
    const ex = await client.query(
      `SELECT id_sub_modulo FROM "Creditos"."TBL_SUB_MODULOS" WHERE v_nom_sub_modulo = $1`,
      [sm.nombre]
    );
    if (!ex.rowCount || ex.rowCount === 0) {
      await client.query(`
        INSERT INTO "Creditos"."TBL_SUB_MODULOS" (v_nom_sub_modulo, v_desc_modulo, v_link_submodulo, id_modulo, fec_creacion)
        VALUES ($1, $2, $3, $4, NOW())
      `, [sm.nombre, sm.desc, sm.link, sm.id_modulo]);
      console.log(`Submódulo agregado: ${sm.nombre}`);
    }
  }

  console.log('\n--- MIGRACIÓN Y REGISTRO DE DATOS COMPLETADO CON ÉXITO ---');
  await client.end();
}

main().catch(err => {
  console.error('Error en migración:', err);
  process.exit(1);
});
