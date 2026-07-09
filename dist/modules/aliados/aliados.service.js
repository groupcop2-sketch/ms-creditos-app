import { pool } from '../../lib/db.js';
import { SecurityError } from '../security/security.service.js';
function normalizeText(value) {
    return value.trim();
}
function nullableText(value) {
    const normalized = value?.trim();
    return normalized || null;
}
function nullableNumber(value) {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
async function withClient(runner) {
    const client = await pool.connect();
    try {
        return await runner(client);
    }
    finally {
        client.release();
    }
}
async function getActiveStateId(client = pool) {
    const result = await client.query('select id_estado from "Creditos"."TBL_ESTADOS" where lower(v_descripcion) = $1 limit 1', ['activo']);
    return result.rows[0]?.id_estado ?? null;
}
async function getAliadoEntityTypeId(client = pool) {
    await client.query(`insert into "Creditos"."TBL_TIPO_ENTIDADES" (des_tipo_entidad, fec_creacion)
     select 'ALIADO', now()
     where not exists (select 1 from "Creditos"."TBL_TIPO_ENTIDADES" where lower(des_tipo_entidad) = 'aliado')`);
    const result = await client.query('select id_tipo_entidad from "Creditos"."TBL_TIPO_ENTIDADES" where lower(des_tipo_entidad) = $1 limit 1', ['aliado']);
    return result.rows[0].id_tipo_entidad;
}
function buildFullName(input) {
    return [input.primerNombre, input.segundoNombre, input.primerApellido, input.segundoApellido]
        .map((item) => item?.trim())
        .filter(Boolean)
        .join(' ');
}
function buildDireccionText(input) {
    return [
        input.numPrincipal,
        input.idLetraPrincipal ? `L${input.idLetraPrincipal}` : null,
        input.bis,
        input.letraBis ? `BIS ${input.letraBis}` : null,
        input.cuadrantePrincipal,
        input.numSecundario ? `# ${input.numSecundario}` : null,
        input.idLetraSecundaria ? `L${input.idLetraSecundaria}` : null,
        input.cuadranteSecundario,
        input.complemento,
        input.barrio
    ].filter(Boolean).join(' ');
}
async function upsertAliadoDireccion(client, aliadoId, input) {
    const tipoEntidadId = await getAliadoEntityTypeId(client);
    await client.query('update "Creditos"."TBL_DIRECCIONES" set es_principal = false where id_tipo_entidad = $1 and id_entidad = $2', [tipoEntidadId, aliadoId]);
    await client.query(`insert into "Creditos"."TBL_DIRECCIONES" (
      id_tipo_entidad, id_entidad, id_tipo_via, num_principal, id_letra_principal,
      bis, letra_bis, cuadrante_principal, num_secundario, id_letra_secundaria,
      cuadrante_secundario, complemento, des_barrio, id_ciudad, es_principal, fec_creacion
    ) values (
      $1, $2, $3, $4, $5,
      $6, $7, $8, $9, $10,
      $11, $12, $13, $14, true, now()
    )`, [
        tipoEntidadId,
        aliadoId,
        input.idTipoVia,
        nullableNumber(input.numPrincipal),
        nullableNumber(input.idLetraPrincipal),
        nullableText(input.bis),
        nullableNumber(input.letraBis),
        nullableText(input.cuadrantePrincipal),
        nullableNumber(input.numSecundario),
        nullableNumber(input.idLetraSecundaria),
        nullableText(input.cuadranteSecundario),
        nullableText(input.complemento),
        nullableText(input.barrio),
        input.idCiudad
    ]);
    await client.query('update "Creditos"."TBL_ALIADOS" set v_direccion = $1, id_ciudad = $2, fec_actualizacion = now() where id_aliado = $3', [buildDireccionText(input), input.idCiudad, aliadoId]);
}
function mapAliado(row) {
    return {
        id: row.id_aliado,
        identificacion: row.v_identificacion,
        primerNombre: row.v_primer_nombre,
        segundoNombre: row.v_seg_nombre,
        primerApellido: row.v_primer_apell,
        segundoApellido: row.v_seg_apell,
        nombreCompleto: row.v_nombre_completo,
        telefono: row.v_telefono,
        correo: row.v_correo,
        fechaNacimiento: row.fec_nacimiento,
        logoUrl: row.v_logo_url,
        direccion: row.v_direccion,
        direccionCompuesta: row.direccion_compuesta,
        idDireccion: row.id_direccion,
        idCiudad: row.id_ciudad,
        ciudad: row.ciudad,
        idTipoIdentificacion: row.id_tip_identificacion,
        tipoIdentificacion: row.tipo_identificacion,
        idBanco: row.id_banco,
        banco: row.banco,
        idTipoCuenta: row.id_tipo_cuenta,
        tipoCuenta: row.tipo_cuenta,
        numeroCuenta: row.v_num_cuenta,
        representante: {
            idTipoIdentificacion: row.rl_id_tip_identificacion,
            tipoIdentificacion: row.rl_tipo_identificacion,
            identificacion: row.rl_identificacion,
            primerNombre: row.rl_primer_nombre,
            segundoNombre: row.rl_seg_nombre,
            primerApellido: row.rl_primer_apell,
            segundoApellido: row.rl_seg_apell,
            genero: row.rl_genero,
            telefono: row.rl_telefono,
            correo: row.rl_correo,
            idCiudad: row.rl_id_ciudad,
            ciudad: row.rl_ciudad
        },
        camara: {
            numero: row.camara_numero,
            libro: row.camara_libro,
            idCiudad: row.camara_id_ciudad,
            ciudad: row.camara_ciudad,
            rees: row.camara_rees,
            runeol: row.camara_runeol
        },
        idEstado: row.id_estado,
        estado: row.estado
    };
}
const aliadoSelect = `
  select a.*, ti.v_sigla_identificacion as tipo_identificacion,
    c.v_nom_ciudad as ciudad,
    e.v_descripcion as estado,
    b.des_banco as banco,
    tc.des_tipo_cuenta as tipo_cuenta,
    rlti.v_sigla_identificacion as rl_tipo_identificacion,
    rlc.v_nom_ciudad as rl_ciudad,
    cc.v_nom_ciudad as camara_ciudad,
    dir.id_direccion,
    trim(concat_ws(' ',
      tv.des_tipo_via,
      dir.num_principal,
      lp.des_letra,
      dir.bis,
      lb.des_letra,
      dir.cuadrante_principal,
      '#',
      dir.num_secundario,
      ls.des_letra,
      dir.cuadrante_secundario,
      dir.complemento,
      dir.des_barrio,
      cdir.v_nom_ciudad
    )) as direccion_compuesta
  from "Creditos"."TBL_ALIADOS" a
  inner join "Creditos"."TBL_TIP_IDENTIFICACIONES" ti on ti.id_tip_identificacion = a.id_tip_identificacion
  left join "Creditos"."TBL_CIUDADES" c on c.id_ciudad = a.id_ciudad
  left join "Creditos"."TBL_ESTADOS" e on e.id_estado = a.id_estado
  left join "Creditos"."TBL_BANCOS" b on b.id_banco = a.id_banco
  left join "Creditos"."TBL_TIPO_CUENTAS" tc on tc.id_tipo_cuenta = a.id_tipo_cuenta
  left join "Creditos"."TBL_TIP_IDENTIFICACIONES" rlti on rlti.id_tip_identificacion = a.rl_id_tip_identificacion
  left join "Creditos"."TBL_CIUDADES" rlc on rlc.id_ciudad = a.rl_id_ciudad
  left join "Creditos"."TBL_CIUDADES" cc on cc.id_ciudad = a.camara_id_ciudad
  left join "Creditos"."TBL_TIPO_ENTIDADES" te on lower(te.des_tipo_entidad) = 'aliado'
  left join "Creditos"."TBL_DIRECCIONES" dir on dir.id_tipo_entidad = te.id_tipo_entidad and dir.id_entidad = a.id_aliado and coalesce(dir.es_principal, false) = true
  left join "Creditos"."TBL_TIPO_VIA" tv on tv.id_tipo_via = dir.id_tipo_via
  left join "Creditos"."TBL_LETRA_DIR" lp on lp.id_letra_dir = dir.id_letra_principal
  left join "Creditos"."TBL_LETRA_DIR" lb on lb.id_letra_dir = dir.letra_bis
  left join "Creditos"."TBL_LETRA_DIR" ls on ls.id_letra_dir = dir.id_letra_secundaria
  left join "Creditos"."TBL_CIUDADES" cdir on cdir.id_ciudad = dir.id_ciudad
`;
export async function listAliadosCatalogs() {
    return withClient(async (client) => {
        const [bancos, tiposCuenta, generos] = await Promise.all([
            client.query('select id_banco as id, des_banco as nombre from "Creditos"."TBL_BANCOS" order by des_banco'),
            client.query('select id_tipo_cuenta as id, des_tipo_cuenta as nombre from "Creditos"."TBL_TIPO_CUENTAS" order by des_tipo_cuenta'),
            client.query('select cod_genero as id, des_genero as nombre from "Creditos"."TBL_GENEROS" order by des_genero')
        ]);
        return {
            bancos: bancos.rows,
            tiposCuenta: tiposCuenta.rows,
            generos: generos.rows
        };
    });
}
export async function listAliados() {
    return withClient(async (client) => {
        const result = await client.query(`${aliadoSelect} order by a.v_nombre_completo`);
        return result.rows.map(mapAliado);
    });
}
export async function createAliado(input) {
    return withClient(async (client) => {
        const duplicate = await client.query('select 1 from "Creditos"."TBL_ALIADOS" where v_identificacion = $1 limit 1', [normalizeText(input.identificacion)]);
        if (duplicate.rowCount) {
            throw new SecurityError('Ya existe un aliado con esa identificacion', 409);
        }
        const stateId = input.idEstado ?? await getActiveStateId(client);
        const created = await client.query(`insert into "Creditos"."TBL_ALIADOS" (
        v_identificacion, v_primer_nombre, v_seg_nombre, v_primer_apell, v_seg_apell,
        v_nombre_completo, v_telefono, v_correo, fec_nacimiento, v_logo_url,
        v_direccion, id_ciudad, id_tip_identificacion, id_banco, id_tipo_cuenta, v_num_cuenta,
        rl_id_tip_identificacion, rl_identificacion, rl_primer_nombre, rl_seg_nombre,
        rl_primer_apell, rl_seg_apell, rl_genero, rl_telefono, rl_correo, rl_id_ciudad,
        camara_numero, camara_libro, camara_id_ciudad, camara_rees, camara_runeol,
        id_estado, fec_creacion
      ) values (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16,
        $17, $18, $19, $20,
        $21, $22, $23, $24, $25, $26,
        $27, $28, $29, $30, $31,
        $32, now()
      ) returning id_aliado`, [
            normalizeText(input.identificacion),
            normalizeText(input.primerNombre),
            nullableText(input.segundoNombre),
            normalizeText(input.primerApellido),
            nullableText(input.segundoApellido),
            buildFullName(input),
            normalizeText(input.telefono),
            normalizeText(input.correo),
            input.fechaNacimiento || null,
            nullableText(input.logoUrl),
            input.direccion ? buildDireccionText(input.direccion) : null,
            input.direccion?.idCiudad ?? null,
            input.idTipoIdentificacion,
            input.idBanco ?? null,
            input.idTipoCuenta ?? null,
            nullableText(input.numeroCuenta),
            input.representante?.idTipoIdentificacion ?? null,
            nullableText(input.representante?.identificacion),
            nullableText(input.representante?.primerNombre),
            nullableText(input.representante?.segundoNombre),
            nullableText(input.representante?.primerApellido),
            nullableText(input.representante?.segundoApellido),
            nullableText(input.representante?.genero),
            nullableText(input.representante?.telefono),
            nullableText(input.representante?.correo),
            input.representante?.idCiudad ?? null,
            nullableText(input.camara?.numero),
            nullableText(input.camara?.libro),
            input.camara?.idCiudad ?? null,
            nullableText(input.camara?.rees),
            nullableText(input.camara?.runeol),
            stateId
        ]);
        if (input.direccion) {
            await upsertAliadoDireccion(client, created.rows[0].id_aliado, input.direccion);
        }
        const result = await client.query(`${aliadoSelect} where a.id_aliado = $1`, [created.rows[0].id_aliado]);
        return mapAliado(result.rows[0]);
    });
}
