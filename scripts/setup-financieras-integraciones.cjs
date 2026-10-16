const { Pool } = require('pg');
const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const pool = new Pool({
  host: process.env.PGHOST,
  port: parseInt(process.env.PGPORT || '6543', 10),
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE,
  ssl: { rejectUnauthorized: false }
});

async function setup() {
  console.log('Iniciando creacion de tablas para Financieras e Integraciones...');

  // 1. TBL_FINANCIERA
  await pool.query(`
    create table if not exists "Creditos"."TBL_FINANCIERA" (
      id_financiera serial primary key,
      v_nit varchar(50) not null unique,
      v_razon_social varchar(255) not null,
      v_sigla varchar(100),
      v_correo varchar(150),
      v_telefono varchar(50),
      v_direccion text,
      v_sitio_web varchar(255),
      id_libranzera int,
      ind_activo boolean default true,
      fec_creacion timestamp with time zone default now(),
      fec_actualizacion timestamp with time zone default now()
    );

    create index if not exists idx_financiera_nit on "Creditos"."TBL_FINANCIERA"(v_nit);
  `);
  console.log('Tabla TBL_FINANCIERA creada o verificada.');

  // 2. TBL_INTEGRACIONES
  await pool.query(`
    create table if not exists "Creditos"."TBL_INTEGRACIONES" (
      id_integracion serial primary key,
      codigo varchar(50) not null unique,
      nombre varchar(100) not null,
      tipo varchar(50) not null,
      descripcion text,
      url_base varchar(255),
      configuracion_schema jsonb,
      ind_activo boolean default true,
      fec_creacion timestamp with time zone default now(),
      fec_actualizacion timestamp with time zone default now()
    );

    create index if not exists idx_integraciones_cod on "Creditos"."TBL_INTEGRACIONES"(codigo);
  `);
  console.log('Tabla TBL_INTEGRACIONES creada o verificada.');

  // 3. TBL_INTEGRACIONES_FINANCIERA
  await pool.query(`
    create table if not exists "Creditos"."TBL_INTEGRACIONES_FINANCIERA" (
      id_integracion_financiera serial primary key,
      id_financiera int not null references "Creditos"."TBL_FINANCIERA"(id_financiera) on delete cascade,
      id_integracion int not null references "Creditos"."TBL_INTEGRACIONES"(id_integracion) on delete cascade,
      ambiente varchar(30) default 'PRODUCCION',
      client_id text,
      client_secret text,
      account_id text,
      api_key text,
      url_base text,
      webhook_url text,
      datos_conexion jsonb default '{}'::jsonb,
      ind_activo boolean default true,
      ind_modo_prueba boolean default false,
      fec_creacion timestamp with time zone default now(),
      fec_actualizacion timestamp with time zone default now(),
      constraint uq_financiera_integracion unique (id_financiera, id_integracion)
    );

    create index if not exists idx_int_fin_fin on "Creditos"."TBL_INTEGRACIONES_FINANCIERA"(id_financiera);
    create index if not exists idx_int_fin_int on "Creditos"."TBL_INTEGRACIONES_FINANCIERA"(id_integracion);
  `);
  console.log('Tabla TBL_INTEGRACIONES_FINANCIERA creada o verificada.');

  // 4. Add id_financiera to TBL_CREDITOS if missing
  await pool.query(`
    do $$
    begin
      if not exists (
        select 1 from information_schema.columns
        where table_schema = 'Creditos' and table_name = 'TBL_CREDITOS' and column_name = 'id_financiera'
      ) then
        alter table "Creditos"."TBL_CREDITOS" add column id_financiera int references "Creditos"."TBL_FINANCIERA"(id_financiera);
      end if;
    end $$;
  `);
  console.log('Columna id_financiera en TBL_CREDITOS verificada.');

  // 5. Seed default integraciones (JUMIO and DOCUSIGN)
  await pool.query(`
    insert into "Creditos"."TBL_INTEGRACIONES" (codigo, nombre, tipo, descripcion, url_base, configuracion_schema, ind_activo)
    values
      (
        'JUMIO',
        'Jumio Identity Cloud',
        'BIOMETRIA',
        'Validación biométrica 1:1, prueba de vida facial (liveness) y OCR de documento de identidad oficial.',
        'https://content.us.jumio.ai',
        '{"campos": ["client_id", "client_secret", "datacenter"]}'::jsonb,
        true
      ),
      (
        'DOCUSIGN',
        'DocuSign eSignature',
        'FIRMA_DIGITAL',
        'Firma electrónica de pagaré, libranza y autorizaciones legales mediante sobres DocuSign.',
        'https://account-d.docusign.com',
        '{"campos": ["integration_key", "secret_key", "account_id", "base_uri"]}'::jsonb,
        true
      ),
      (
        'DIDIT',
        'Didit Protocol KYC',
        'BIOMETRIA',
        'Verificación de identidad descentralizada, biometría facial 1:1, prueba de vida y validación de documento (NFC/OCR) mediante Didit Protocol.',
        'https://verification.didit.me/v3',
        '{"campos": ["api_key", "workflow_id", "webhook_secret"], "workflow_default": "e42a2607-2f9f-475e-a5b8-0cbfc0213b06"}'::jsonb,
        true
      )
    on conflict (codigo) do update set
      nombre = excluded.nombre,
      tipo = excluded.tipo,
      descripcion = excluded.descripcion,
      url_base = excluded.url_base,
      configuracion_schema = excluded.configuracion_schema,
      fec_actualizacion = now();
  `);
  console.log('Integraciones base (JUMIO, DOCUSIGN, DIDIT) sembradas.');

  // 6. Seed P&S SOLUCIONES FINANCIERAS SAS into TBL_FINANCIERA
  const finInsert = await pool.query(`
    insert into "Creditos"."TBL_FINANCIERA" (
      v_nit, v_razon_social, v_sigla, v_correo, v_telefono, v_direccion, v_sitio_web, ind_activo
    ) values (
      '901888001',
      'P&S SOLUCIONES FINANCIERAS SAS',
      'P&S SOLUCIONES',
      'gerenciaderiesgos@pyssoluciones.com',
      '3235894532',
      'CALLE 77B # 57-103',
      'https://pyssoluciones.com/',
      true
    )
    on conflict (v_nit) do update set
      v_razon_social = excluded.v_razon_social,
      v_sigla = excluded.v_sigla,
      v_correo = excluded.v_correo,
      v_telefono = excluded.v_telefono,
      v_direccion = excluded.v_direccion,
      v_sitio_web = excluded.v_sitio_web,
      ind_activo = true,
      fec_actualizacion = now()
    returning id_financiera, v_razon_social;
  `);

  const idFinanciera = finInsert.rows[0].id_financiera;
  console.log('Financiera sembrada:', finInsert.rows[0]);

  // 7. Associate JUMIO and DOCUSIGN with P&S in TBL_INTEGRACIONES_FINANCIERA
  const jumioInt = await pool.query('select id_integracion from "Creditos"."TBL_INTEGRACIONES" where codigo = $1', ['JUMIO']);
  const docusignInt = await pool.query('select id_integracion from "Creditos"."TBL_INTEGRACIONES" where codigo = $1', ['DOCUSIGN']);

  // Insert default integration records (initially without active API keys or marked inactive if no env vars)
  const hasJumioEnv = Boolean(process.env.JUMIO_CLIENT_ID?.trim() && process.env.JUMIO_CLIENT_SECRET?.trim());

  if (jumioInt.rowCount) {
    await pool.query(`
      insert into "Creditos"."TBL_INTEGRACIONES_FINANCIERA" (
        id_financiera, id_integracion, ambiente, client_id, client_secret, ind_activo
      ) values ($1, $2, 'PRODUCCION', $3, $4, $5)
      on conflict (id_financiera, id_integracion) do update set
        fec_actualizacion = now();
    `, [
      idFinanciera,
      jumioInt.rows[0].id_integracion,
      process.env.JUMIO_CLIENT_ID || null,
      process.env.JUMIO_CLIENT_SECRET || null,
      hasJumioEnv
    ]);
    console.log(`Relacion JUMIO para financiera ${idFinanciera} establecida (activa: ${hasJumioEnv}).`);
  }

  if (docusignInt.rowCount) {
    await pool.query(`
      insert into "Creditos"."TBL_INTEGRACIONES_FINANCIERA" (
        id_financiera, id_integracion, ambiente, account_id, client_id, client_secret, ind_activo
      ) values ($1, $2, 'SANDBOX', $3, $4, $5, $6)
      on conflict (id_financiera, id_integracion) do update set
        fec_actualizacion = now();
    `, [
      idFinanciera,
      docusignInt.rows[0].id_integracion,
      process.env.DOCUSIGN_ACCOUNT_ID || null,
      process.env.DOCUSIGN_INTEGRATION_KEY || null,
      process.env.DOCUSIGN_SECRET_KEY || null,
      Boolean(process.env.DOCUSIGN_ACCOUNT_ID)
    ]);
    console.log(`Relacion DOCUSIGN para financiera ${idFinanciera} establecida.`);
  }

  const diditInt = await pool.query('select id_integracion from "Creditos"."TBL_INTEGRACIONES" where codigo = $1', ['DIDIT']);
  if (diditInt.rowCount) {
    const hasDiditEnv = Boolean(process.env.DIDIT_API_KEY?.trim());
    await pool.query(`
      insert into "Creditos"."TBL_INTEGRACIONES_FINANCIERA" (
        id_financiera, id_integracion, ambiente, client_id, api_key, client_secret, url_base, webhook_url, datos_conexion, ind_activo, ind_modo_prueba
      ) values ($1, $2, 'SANDBOX', $3, $4, $5, $6, $7, $8, $9, $10)
      on conflict (id_financiera, id_integracion) do update set
        client_id = coalesce(excluded.client_id, "TBL_INTEGRACIONES_FINANCIERA".client_id),
        api_key = coalesce(excluded.api_key, "TBL_INTEGRACIONES_FINANCIERA".api_key),
        client_secret = coalesce(excluded.client_secret, "TBL_INTEGRACIONES_FINANCIERA".client_secret),
        ind_activo = true,
        fec_actualizacion = now();
    `, [
      idFinanciera,
      diditInt.rows[0].id_integracion,
      'e42a2607-2f9f-475e-a5b8-0cbfc0213b06', // Default Workflow ID
      process.env.DIDIT_API_KEY || null,
      process.env.DIDIT_WEBHOOK_SECRET || null,
      'https://verification.didit.me/v3',
      'https://ms-creditos-app-weld.vercel.app/api/v1/portal/didit/webhook',
      JSON.stringify({ workflow_id: 'e42a2607-2f9f-475e-a5b8-0cbfc0213b06', provider: 'DIDIT' }),
      true, // ind_activo true
      !hasDiditEnv
    ]);
    console.log(`Relacion DIDIT para financiera ${idFinanciera} establecida (activa: true).`);
  }

  // Update existing credits that have null id_financiera
  await pool.query(`
    update "Creditos"."TBL_CREDITOS"
    set id_financiera = $1
    where id_financiera is null;
  `, [idFinanciera]);
  console.log('Creditos existentes vinculados a la financiera default.');

  await pool.end();
  console.log('Configuracion completada exitosamente.');
}

setup().catch(err => {
  console.error('Error en setup:', err);
  process.exit(1);
});
