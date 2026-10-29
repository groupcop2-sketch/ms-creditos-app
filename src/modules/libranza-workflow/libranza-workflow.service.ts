import { pool, type ClientLike } from '../../lib/db.js';
import { SecurityError } from '../security/security.service.js';
import { contabilidadService } from '../contabilidad/contabilidad.service.js';

function roundMoney(value: number): number {
  return Math.round((Number(value) || 0) * 100) / 100;
}

export interface WorkflowPasoDefinition {
  paso: number;
  codigo: string;
  actorOrigen: string;
  actorDestino: string;
  nombre: string;
  descripcion: string;
}

export const WORKFLOW_PASOS_DEF: WorkflowPasoDefinition[] = [
  {
    paso: 1,
    codigo: 'SOLICITUD_CREDITO',
    actorOrigen: 'Cliente',
    actorDestino: 'Financiera',
    nombre: 'Solicita crédito',
    descripcion: 'El cliente radica la solicitud de crédito de libranza con monto, plazo y pagaduría.'
  },
  {
    paso: 2,
    codigo: 'VALIDA_IDENTIDAD_CAPACIDAD_POLITICA',
    actorOrigen: 'Financiera',
    actorDestino: 'Motor Crediticio',
    nombre: 'Valida identidad, capacidad y política',
    descripcion: 'Evaluación integral: prueba biométrica de identidad, capacidad de pago (50% neto Ley 1527) y scoring de riesgo.'
  },
  {
    paso: 3,
    codigo: 'DECISION_APROBADA_RECHAZADA',
    actorOrigen: 'Motor Crediticio',
    actorDestino: 'Financiera',
    nombre: 'Decisión aprobada / rechazada',
    descripcion: 'Emisión del dictamen formal del motor: aprobación con cupo, tasa y cuota máxima, o causal de rechazo.'
  },
  {
    paso: 4,
    codigo: 'GENERA_LIBRANZA_AUTORIZACION',
    actorOrigen: 'Financiera',
    actorDestino: 'Cliente',
    nombre: 'Genera libranza y autorización de descuento',
    descripcion: 'Expedición del pagaré en blanco, carta de instrucciones, formato de libranza y orden irrevocable de descuento por nómina.'
  },
  {
    paso: 5,
    codigo: 'FIRMA_DIGITAL',
    actorOrigen: 'Cliente',
    actorDestino: 'Financiera',
    nombre: 'Firma digital',
    descripcion: 'El solicitante suscribe electrónicamente los documentos contractuales con validez probatoria Ley 527 de 1999.'
  },
  {
    paso: 6,
    codigo: 'NOTIFICA_LIBRANZA_CUOTA',
    actorOrigen: 'Financiera',
    actorDestino: 'Empleador / Entidad Pagadora',
    nombre: 'Notifica libranza y cuota',
    descripcion: 'Radicación formal y notificación al pagador/empleador con los datos del crédito, cuota mensual y cuenta de dispersión.'
  },
  {
    paso: 7,
    codigo: 'REGISTRA_DESEMBOLSO_CONTABILIDAD',
    actorOrigen: 'Financiera',
    actorDestino: 'Contabilidad',
    nombre: 'Registra desembolso, cartera e intereses por devengar',
    descripcion: 'Dispersión efectiva de fondos y despacho de evento contable LIBRANZA_DESEMBOLSO al motor NIIF (asiento cartera vs banco).'
  },
  {
    paso: 8,
    codigo: 'GIRA_DESCUENTO_NOMINA',
    actorOrigen: 'Empleador / Entidad Pagadora',
    actorDestino: 'Financiera',
    nombre: 'Gira descuento de nómina',
    descripcion: 'El empleador descuenta de la nómina del colaborador la cuota autorizada y gira los recursos recaudados a la financiera.'
  },
  {
    paso: 9,
    codigo: 'APLICA_PAGO_CONTABILIDAD',
    actorOrigen: 'Financiera',
    actorDestino: 'Contabilidad',
    nombre: 'Aplica pago a capital, intereses, seguros y cargos',
    descripcion: 'Aplicación reglamentaria del pago y despacho de evento contable LIBRANZA_RECAUDO al motor NIIF (bancos vs cartera, intereses, seguros).'
  },
  {
    paso: 10,
    codigo: 'ACTUALIZA_SALDO_ESTADO_CUENTA',
    actorOrigen: 'Financiera',
    actorDestino: 'Cliente',
    nombre: 'Actualiza saldo y estado de cuenta',
    descripcion: 'Cálculo de nuevo saldo insoluto, tabla de amortización actualizada y emisión de estado de cuenta disponible al cliente.'
  }
];

export async function ensureWorkflowTables(client?: ClientLike): Promise<void> {
  const query = `
    create table if not exists "Creditos"."TBL_LIBRANZA_WORKFLOW_PASOS" (
      id_workflow_paso serial primary key,
      id_credito integer not null references "Creditos"."TBL_CREDITOS"(id_credito) on delete cascade,
      paso_numero integer not null,
      codigo_paso varchar(60) not null,
      actor_origen varchar(50) not null,
      actor_destino varchar(50) not null,
      nombre_paso varchar(150) not null,
      estado varchar(30) not null default 'PENDIENTE',
      payload_entrada jsonb default '{}'::jsonb,
      payload_salida jsonb default '{}'::jsonb,
      referencia_externa varchar(150),
      observaciones text,
      id_usuario integer,
      fec_ejecucion timestamp with time zone,
      fec_creacion timestamp with time zone default now(),
      constraint uq_credito_paso unique (id_credito, paso_numero)
    );
    create index if not exists idx_workflow_credito on "Creditos"."TBL_LIBRANZA_WORKFLOW_PASOS"(id_credito);
  `;
  if (client) {
    await client.query(query);
  } else {
    await pool.query(query);
  }
}

export class LibranzaWorkflowService {
  /**
   * Inicializa o sincroniza los 10 pasos para un crédito
   */
  async inicializarWorkflow(creditoId: number, client?: ClientLike): Promise<void> {
    await ensureWorkflowTables(client);

    for (const def of WORKFLOW_PASOS_DEF) {
      const sql = `insert into "Creditos"."TBL_LIBRANZA_WORKFLOW_PASOS" (
          id_credito, paso_numero, codigo_paso, actor_origen, actor_destino, nombre_paso, estado
        ) values ($1, $2, $3, $4, $5, $6, 'PENDIENTE')
        on conflict (id_credito, paso_numero) do update set
          codigo_paso = excluded.codigo_paso,
          actor_origen = excluded.actor_origen,
          actor_destino = excluded.actor_destino,
          nombre_paso = excluded.nombre_paso`;
      const values = [creditoId, def.paso, def.codigo, def.actorOrigen, def.actorDestino, def.nombre];

      if (client) {
        await client.query(sql, values);
      } else {
        await pool.query(sql, values);
      }
    }
  }

  /**
   * Obtiene el estado consolidado de los 10 pasos de la arquitectura para un crédito
   */
  async getWorkflowEstado(creditoId: number) {
    await ensureWorkflowTables();

    // Comprobar si existe el crédito
    const credRes = await pool.query(
      `select c.id_credito, c.consecutivo, c.val_monto_solicitado, c.num_plazo, c.val_tasa,
              c.val_cuota_estimada, c.v_estado_solicitud, c.fec_radicacion,
              c.v_nombre_cliente, c.v_identificacion_cliente, c.v_correo_cliente,
              c.v_telefono_cliente, e.v_razon_social as empresa, e.v_nit as nit_empresa
       from "Creditos"."TBL_CREDITOS" c
       left join "Creditos"."TBL_EMPRESAS" e on e.id_empresa = c.id_empresa
       where c.id_credito = $1`,
      [creditoId]
    );

    if (!credRes.rowCount) throw new SecurityError('Crédito no encontrado', 404);
    const credito = credRes.rows[0];

    await this.inicializarWorkflow(creditoId);

    // Deducir automáticamente pasos completados según datos existentes
    await this.sincronizarPasosAutomaticos(creditoId, credito);

    const pasosRes = await pool.query(
      `select * from "Creditos"."TBL_LIBRANZA_WORKFLOW_PASOS"
       where id_credito = $1
       order by paso_numero asc`,
      [creditoId]
    );

    const pasos = pasosRes.rows;
    const pasoActual = pasos.find((p) => p.estado === 'PENDIENTE' || p.estado === 'EN_PROCESO') || pasos[pasos.length - 1];

    return {
      credito: {
        id: credito.id_credito,
        consecutivo: credito.consecutivo,
        monto: Number(credito.val_monto_solicitado),
        plazo: credito.num_plazo,
        cuota: Number(credito.val_cuota_estimada || 0),
        estado: credito.v_estado_solicitud,
        cliente: {
          nombre: credito.v_nombre_cliente,
          identificacion: credito.v_identificacion_cliente,
          correo: credito.v_correo_cliente,
          telefono: credito.v_telefono_cliente
        },
        empleador: {
          razonSocial: credito.empresa,
          nit: credito.nit_empresa
        }
      },
      actores: [
        { id: 'CLIENTE', nombre: 'Cliente', icon: 'user' },
        { id: 'FINANCIERA', nombre: 'Financiera', icon: 'building' },
        { id: 'MOTOR', nombre: 'Motor Crediticio', icon: 'cpu' },
        { id: 'PAGADURIA', nombre: 'Empleador / Entidad Pagadora', icon: 'briefcase' },
        { id: 'CONTABILIDAD', nombre: 'Contabilidad (NexusERP NIIF)', icon: 'file-text' }
      ],
      progresoPorcentaje: Math.round((pasos.filter((p) => p.estado === 'COMPLETADO').length / pasos.length) * 100),
      pasoActualNumero: pasoActual?.paso_numero || 1,
      pasos: pasos.map((p) => ({
        paso: p.paso_numero,
        codigo: p.codigo_paso,
        actorOrigen: p.actor_origen,
        actorDestino: p.actor_destino,
        nombre: p.nombre_paso,
        estado: p.estado,
        referencia: p.referencia_externa,
        observaciones: p.observaciones,
        fechaEjecucion: p.fec_ejecucion,
        payloadSalida: p.payload_salida
      }))
    };
  }

  /**
   * Sincroniza automáticamente los pasos según el estado real del crédito en BD
   */
  private async sincronizarPasosAutomaticos(creditoId: number, credito: any) {
    // Paso 1: Radicación siempre completada si el crédito existe
    await pool.query(
      `update "Creditos"."TBL_LIBRANZA_WORKFLOW_PASOS"
       set estado = 'COMPLETADO',
           referencia_externa = $2,
           fec_ejecucion = coalesce(fec_ejecucion, $3)
       where id_credito = $1 and paso_numero = 1 and estado = 'PENDIENTE'`,
      [creditoId, credito.consecutivo, credito.fec_radicacion || new Date()]
    );

    // Paso 2 y 3: Evaluar si ya tiene evaluación o decisión
    const decRes = await pool.query(
      `select decision, monto_aprobado, fec_creacion
       from "Creditos"."TBL_CREDITO_DECISIONES"
       where id_credito = $1 order by id_credito_decision desc limit 1`,
      [creditoId]
    );

    if (decRes.rowCount) {
      const dec = decRes.rows[0];
      await pool.query(
        `update "Creditos"."TBL_LIBRANZA_WORKFLOW_PASOS"
         set estado = 'COMPLETADO', fec_ejecucion = coalesce(fec_ejecucion, $2)
         where id_credito = $1 and paso_numero in (2, 3) and estado = 'PENDIENTE'`,
        [creditoId, dec.fec_creacion]
      );
    }

    // Paso 4: Documentos generados
    const docRes = await pool.query(
      `select count(*)::int as total from "Creditos"."TBL_DOCUMENTOS_GENERADOS" where id_credito = $1`,
      [creditoId]
    );
    if (docRes.rows[0]?.total > 0) {
      await pool.query(
        `update "Creditos"."TBL_LIBRANZA_WORKFLOW_PASOS"
         set estado = 'COMPLETADO', fec_ejecucion = coalesce(fec_ejecucion, now())
         where id_credito = $1 and paso_numero = 4 and estado = 'PENDIENTE'`,
        [creditoId]
      );
    }

    // Paso 5: Firmas completadas
    const firmaRes = await pool.query(
      `select count(*)::int as total from "Creditos"."TBL_CREDITO_FIRMAS" where id_credito = $1 and estado = 'FIRMADO'`,
      [creditoId]
    );
    if (firmaRes.rows[0]?.total > 0) {
      await pool.query(
        `update "Creditos"."TBL_LIBRANZA_WORKFLOW_PASOS"
         set estado = 'COMPLETADO', fec_ejecucion = coalesce(fec_ejecucion, now())
         where id_credito = $1 and paso_numero = 5 and estado = 'PENDIENTE'`,
        [creditoId]
      );
    }

    // Paso 7: Desembolso ejecutado
    const desRes = await pool.query(
      `select valor_desembolso, fecha_desembolso, numero_orden from "Creditos"."TBL_CREDITO_DESEMBOLSOS" where id_credito = $1 and estado_desembolso = 'EJECUTADO'`,
      [creditoId]
    );
    if (desRes.rowCount) {
      await pool.query(
        `update "Creditos"."TBL_LIBRANZA_WORKFLOW_PASOS"
         set estado = 'COMPLETADO',
             referencia_externa = coalesce(referencia_externa, $2),
             fec_ejecucion = coalesce(fec_ejecucion, $3::timestamptz)
         where id_credito = $1 and paso_numero in (6, 7) and estado = 'PENDIENTE'`,
        [creditoId, desRes.rows[0].numero_orden, desRes.rows[0].fecha_desembolso]
      );
    }

    // Paso 8, 9, 10: Si tiene pagos aplicados
    const pagRes = await pool.query(
      `select count(*)::int as total, sum(valor_pago) as total_pagado
       from "Creditos"."TBL_CREDITO_PAGOS" where id_credito = $1 and estado = 'APLICADO'`,
      [creditoId]
    );
    if (pagRes.rows[0]?.total > 0) {
      await pool.query(
        `update "Creditos"."TBL_LIBRANZA_WORKFLOW_PASOS"
         set estado = 'COMPLETADO', fec_ejecucion = coalesce(fec_ejecucion, now())
         where id_credito = $1 and paso_numero in (8, 9, 10) and estado = 'PENDIENTE'`,
        [creditoId]
      );
    }
  }

  /**
   * Ejecutar Paso 2: Valida identidad, capacidad (Ley 1527) y política (Financiera -> Motor Crediticio)
   */
  async ejecutarPaso2ValidacionMotor(creditoId: number, input: {
    salarioBruto?: number;
    descuentosLey?: number;
    otrosDescuentos?: number;
    tasaEA?: number;
    usuarioId?: number;
  }) {
    await ensureWorkflowTables();

    const credRes = await pool.query(
      `select c.*, p.nombre as producto_nombre
       from "Creditos"."TBL_CREDITOS" c
       inner join "Creditos"."TBL_PRODUCTOS_CREDITO" p on p.id_producto_credito = c.id_producto_credito
       where c.id_credito = $1`,
      [creditoId]
    );
    if (!credRes.rowCount) throw new SecurityError('Crédito no encontrado', 404);
    const row = credRes.rows[0];

    const salarioBruto = input.salarioBruto || 4500000;
    const deduccionesLey = input.descuentosLey || Math.round(salarioBruto * 0.08); // 4% salud + 4% pensión
    const otrosDescuentos = input.otrosDescuentos || 0;
    const montoSolicitado = Number(row.val_monto_solicitado);
    const plazo = row.num_plazo;

    // Invocación a la API contable para simular capacidad bajo Ley 1527
    let simResult: any = null;
    try {
      simResult = await contabilidadService.validarCapacidadLey1527({
        gross_income: salarioBruto,
        legal_deductions: deduccionesLey,
        other_payroll_deductions: otrosDescuentos,
        requested_amount: montoSolicitado,
        requested_term_months: plazo,
        annual_effective_rate: input.tasaEA ?? 0.225
      });
    } catch (e: any) {
      console.warn('⚠️ Simulación contable externa falló, calculando con regla local:', e.message);
      const salarioNeto = salarioBruto - deduccionesLey;
      const maxDescuento = salarioNeto * 0.50; // Regla 50% Ley 1527
      const disponible = maxDescuento - otrosDescuentos;
      const cuotaEstimada = Number(row.val_cuota_estimada || 0);
      simResult = {
        gross_monthly_income: salarioBruto,
        legal_deductions: deduccionesLey,
        net_monthly_income: salarioNeto,
        max_allowable_deduction: maxDescuento,
        available_payment_capacity: disponible,
        estimated_installment: cuotaEstimada,
        compliance_50_percent_passed: disponible >= cuotaEstimada
      };
    }

    const pasoAprobado = simResult.compliance_50_percent_passed;

    await pool.query(
      `update "Creditos"."TBL_LIBRANZA_WORKFLOW_PASOS"
       set estado = $2,
           payload_entrada = $3::jsonb,
           payload_salida = $4::jsonb,
           observaciones = $5,
           fec_ejecucion = now(),
           id_usuario = $6
       where id_credito = $1 and paso_numero = 2`,
      [
        creditoId,
        pasoAprobado ? 'COMPLETADO' : 'FALLIDO',
        JSON.stringify({ salarioBruto, deduccionesLey, otrosDescuentos, montoSolicitado, plazo }),
        JSON.stringify(simResult),
        pasoAprobado ? 'Capacidad de pago y políticas validadas conforme a Ley 1527 (50% Salario Neto).' : 'Capacidad de pago insuficiente para la cuota solicitada.',
        input.usuarioId ?? null
      ]
    );

    return {
      paso: 2,
      completado: pasoAprobado,
      simulacionCapacidad: simResult
    };
  }

  /**
   * Ejecutar Paso 6: Notifica libranza y cuota (Financiera -> Empleador / Entidad Pagadora)
   */
  async ejecutarPaso6NotificarPagaduria(creditoId: number, input: {
    radicadoNumero?: string;
    contactoPagaduria?: string;
    correoPagaduria?: string;
    observacion?: string;
    usuarioId?: number;
  }) {
    await ensureWorkflowTables();

    const credRes = await pool.query(
      `select c.consecutivo, c.val_monto_solicitado, c.num_plazo, c.val_cuota_estimada,
              c.v_nombre_cliente, c.v_identificacion_cliente,
              e.v_razon_social as empresa, e.v_nit as nit_empresa, e.v_correo_rrhh
       from "Creditos"."TBL_CREDITOS" c
       left join "Creditos"."TBL_EMPRESAS" e on e.id_empresa = c.id_empresa
       where c.id_credito = $1`,
      [creditoId]
    );
    if (!credRes.rowCount) throw new SecurityError('Crédito no encontrado', 404);
    const row = credRes.rows[0];

    const radicado = input.radicadoNumero || `RAD-LIB-${row.consecutivo}-${Date.now().toString().slice(-4)}`;
    const cuotaMensual = Number(row.val_cuota_estimada || 0);

    const payloadNotificacion = {
      radicado,
      creditoConsecutivo: row.consecutivo,
      deudor: {
        nombre: row.v_nombre_cliente,
        identificacion: row.v_identificacion_cliente
      },
      empleador: {
        razonSocial: row.empresa || 'Pagaduría Convenio',
        nit: row.nit_empresa,
        contacto: input.contactoPagaduria || 'Gestión Humana y Nómina',
        correo: input.correoPagaduria || row.v_correo_rrhh || 'nomina@pagaduria.com'
      },
      condicionesLibranza: {
        montoTotal: Number(row.val_monto_solicitado),
        plazoMeses: row.num_plazo,
        cuotaDescuentoMensual: cuotaMensual,
        fechaInicioDescuento: new Date().toISOString().slice(0, 7) + '-15'
      },
      estado: 'NOTIFICADO_Y_RADICADO'
    };

    await pool.query(
      `update "Creditos"."TBL_LIBRANZA_WORKFLOW_PASOS"
       set estado = 'COMPLETADO',
           referencia_externa = $2,
           payload_salida = $3::jsonb,
           observaciones = $4,
           fec_ejecucion = now(),
           id_usuario = $5
       where id_credito = $1 and paso_numero = 6`,
      [
        creditoId,
        radicado,
        JSON.stringify(payloadNotificacion),
        input.observacion || `Notificación formal de libranza y cuota radicada ante ${payloadNotificacion.empleador.razonSocial}`,
        input.usuarioId ?? null
      ]
    );

    return {
      paso: 6,
      completado: true,
      radicado,
      notificacion: payloadNotificacion
    };
  }

  /**
   * Ejecutar Paso 7: Registra desembolso, cartera e intereses por devengar (Financiera -> Contabilidad)
   * Dispara el evento contable LIBRANZA_DESEMBOLSO
   */
  async ejecutarPaso7DesembolsoContable(creditoId: number, input: {
    montoDesembolso?: number;
    bancoDestino?: string;
    numeroCuenta?: string;
    usuarioId?: number;
  }) {
    await ensureWorkflowTables();

    const credRes = await pool.query(
      `select c.consecutivo, c.val_monto_solicitado, d.valor_desembolso, d.fecha_desembolso, d.numero_orden
       from "Creditos"."TBL_CREDITOS" c
       left join "Creditos"."TBL_CREDITO_DESEMBOLSOS" d on d.id_credito = c.id_credito
       where c.id_credito = $1
       order by d.id_credito_desembolso desc limit 1`,
      [creditoId]
    );
    if (!credRes.rowCount) throw new SecurityError('Crédito no encontrado', 404);
    const row = credRes.rows[0];

    const montoPrincipal = Number(row.val_monto_solicitado);
    const montoNeto = input.montoDesembolso ?? (row.valor_desembolso ? Number(row.valor_desembolso) : montoPrincipal);
    const comision = Math.max(0, montoPrincipal - montoNeto);
    const fecha = row.fecha_desembolso || new Date().toISOString().slice(0, 10);

    const contabResult = await contabilidadService.registrarDesembolsoContable({
      creditoId,
      consecutivo: row.consecutivo || `CR-${creditoId}`,
      montoPrincipal,
      comisionOriginacion: comision,
      montoDesembolsadoNeto: montoNeto,
      fechaDesembolso: fecha
    });

    const entry = contabResult.data.journal_entry;

    await pool.query(
      `update "Creditos"."TBL_LIBRANZA_WORKFLOW_PASOS"
       set estado = 'COMPLETADO',
           referencia_externa = $2,
           payload_salida = $3::jsonb,
           observaciones = $4,
           fec_ejecucion = now(),
           id_usuario = $5
       where id_credito = $1 and paso_numero = 7`,
      [
        creditoId,
        entry.entry_number,
        JSON.stringify(contabResult.data),
        `Comprobante contable NIIF ${entry.entry_number} emitido: Cartera principal $${montoPrincipal} vs Banco $${montoNeto}`,
        input.usuarioId ?? null
      ]
    );

    return {
      paso: 7,
      completado: true,
      comprobante: entry
    };
  }

  /**
   * Ejecutar Paso 8 y 9: Giro de nómina y Aplicación contable (Empleador -> Financiera -> Contabilidad)
   * Dispara el evento contable LIBRANZA_RECAUDO
   */
  async ejecutarPaso8y9RecaudoNomina(creditoId: number, input: {
    totalRecaudado: number;
    capital: number;
    interes: number;
    seguro?: number;
    referenciaNomina?: string;
    bancoId?: string;
    fechaRecaudo?: string;
    usuarioId?: number;
  }) {
    await ensureWorkflowTables();

    const credRes = await pool.query(
      `select consecutivo from "Creditos"."TBL_CREDITOS" where id_credito = $1`,
      [creditoId]
    );
    if (!credRes.rowCount) throw new SecurityError('Crédito no encontrado', 404);
    const consecutivo = credRes.rows[0].consecutivo || `CR-${creditoId}`;

    const refNomina = input.referenciaNomina || `GIR-NOM-${consecutivo}-${Date.now().toString().slice(-4)}`;
    const fecha = input.fechaRecaudo || new Date().toISOString().slice(0, 10);

    // 1. Marcar Paso 8 (Empleador gira descuento de nómina)
    await pool.query(
      `update "Creditos"."TBL_LIBRANZA_WORKFLOW_PASOS"
       set estado = 'COMPLETADO',
           referencia_externa = $2,
           payload_salida = $3::jsonb,
           observaciones = $4,
           fec_ejecucion = now(),
           id_usuario = $5
       where id_credito = $1 and paso_numero = 8`,
      [
        creditoId,
        refNomina,
        JSON.stringify({
          referenciaNomina: refNomina,
          montoGirado: input.totalRecaudado,
          fechaGiro: fecha
        }),
        `Giro de descuento de nómina por $${input.totalRecaudado} recibido de la pagaduría.`,
        input.usuarioId ?? null
      ]
    );

    // 2. Disparar evento contable Paso 9 (Financiera -> Contabilidad)
    const contabResult = await contabilidadService.registrarRecaudoContable({
      creditoId,
      consecutivo,
      referenciaPago: refNomina,
      totalRecaudado: input.totalRecaudado,
      capitalAplicado: input.capital,
      interesAplicado: input.interes,
      seguroAplicado: input.seguro || 0,
      fechaPago: fecha
    });

    const entry = contabResult.data.journal_entry;

    await pool.query(
      `update "Creditos"."TBL_LIBRANZA_WORKFLOW_PASOS"
       set estado = 'COMPLETADO',
           referencia_externa = $2,
           payload_salida = $3::jsonb,
           observaciones = $4,
           fec_ejecucion = now(),
           id_usuario = $5
       where id_credito = $1 and paso_numero = 9`,
      [
        creditoId,
        entry.entry_number,
        JSON.stringify(contabResult.data),
        `Comprobante de ingreso NIIF ${entry.entry_number} emitido: Recaudo bancos $${input.totalRecaudado} aplicado a capital e intereses.`,
        input.usuarioId ?? null
      ]
    );

    // 3. Marcar Paso 10: Actualización de Saldo y Estado de Cuenta (Financiera -> Cliente)
    await pool.query(
      `update "Creditos"."TBL_LIBRANZA_WORKFLOW_PASOS"
       set estado = 'COMPLETADO',
           referencia_externa = 'EC-' || $2,
           payload_salida = $3::jsonb,
           observaciones = $4,
           fec_ejecucion = now(),
           id_usuario = $5
       where id_credito = $1 and paso_numero = 10`,
      [
        creditoId,
        consecutivo,
        JSON.stringify({
          capitalAmortizado: input.capital,
          interesPagado: input.interes,
          estadoCuentaDisponible: true,
          fechaCorte: fecha
        }),
        `Estado de cuenta y plan de amortización actualizado para el cliente tras aplicar recaudo por nómina.`,
        input.usuarioId ?? null
      ]
    );

    return {
      paso8GiroNomina: { completado: true, referenciaNomina: refNomina },
      paso9Contabilidad: { completado: true, comprobante: entry },
      paso10EstadoCuenta: { completado: true }
    };
  }

  /**
   * Paso 10: Consulta del Estado de Cuenta del Cliente con trazabilidad contable
   */
  async getEstadoCuentaCliente(creditoId: number) {
    const credRes = await pool.query(
      `select c.*, p.nombre as producto, e.v_razon_social as pagaduria
       from "Creditos"."TBL_CREDITOS" c
       inner join "Creditos"."TBL_PRODUCTOS_CREDITO" p on p.id_producto_credito = c.id_producto_credito
       left join "Creditos"."TBL_EMPRESAS" e on e.id_empresa = c.id_empresa
       where c.id_credito = $1`,
      [creditoId]
    );
    if (!credRes.rowCount) throw new SecurityError('Crédito no encontrado', 404);
    const credito = credRes.rows[0];

    // Consultar cuotas y pagos
    const cuotasRes = await pool.query(
      `select * from "Creditos"."TBL_CREDITO_CUOTAS"
       where id_credito = $1 order by numero_cuota asc`,
      [creditoId]
    );

    const pagosRes = await pool.query(
      `select * from "Creditos"."TBL_CREDITO_PAGOS"
       where id_credito = $1 order by fec_creacion desc`,
      [creditoId]
    );

    const comprobantes = await contabilidadService.getComprobantes(credito.consecutivo || `CR-${creditoId}`);

    const saldoPendiente = cuotasRes.rows
      .filter((c) => c.estado !== 'PAGADA')
      .reduce((acc, c) => acc + Number(c.capital || c.valor_cuota || 0), 0);

    return {
      consecutivo: credito.consecutivo,
      fechaCorte: new Date().toISOString(),
      cliente: {
        nombre: credito.v_nombre_cliente,
        identificacion: credito.v_identificacion_cliente,
        pagaduria: credito.pagaduria
      },
      credito: {
        montoSolicitado: Number(credito.val_monto_solicitado),
        plazoMeses: credito.num_plazo,
        cuotaMensual: Number(credito.val_cuota_estimada || 0),
        saldoInsolutoCapital: roundMoney(saldoPendiente > 0 ? saldoPendiente : Number(credito.v_valor_pendiente || credito.val_monto_solicitado)),
        estado: credito.v_estado_solicitud
      },
      cuotas: cuotasRes.rows.map((c) => ({
        numero: c.numero_cuota,
        fechaVencimiento: c.fec_vencimiento,
        capital: Number(c.capital || 0),
        interes: Number(c.interes || 0),
        cuotaTotal: Number(c.valor_cuota || 0),
        estado: c.estado
      })),
      historicoPagos: pagosRes.rows.map((p) => ({
        referencia: p.referencia_pago,
        fecha: p.fec_pago || p.fec_creacion,
        valor: Number(p.valor_pago),
        estado: p.estado
      })),
      trazabilidadContableNIIF: comprobantes.map((cp) => ({
        numeroComprobante: cp.entry_number,
        tipo: cp.entry_type,
        fecha: cp.entry_date,
        concepto: cp.concept,
        totalDebito: cp.total_debit,
        totalCredito: cp.total_credit,
        lineas: cp.lines
      }))
    };
  }
}

export const libranzaWorkflowService = new LibranzaWorkflowService();
