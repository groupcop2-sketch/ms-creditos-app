/**
 * Lookup tables editable from Utilitarios. Only tables listed here are reachable (the key is a whitelist:
 * table and column names never come from the request).
 */
export type Campo = { col: string; label: string; max: number; requerido?: boolean; mayus?: boolean; ancho?: 'corto' };
export type Catalogo = {
  key: string;
  titulo: string;
  descripcion: string;
  grupo: string;
  tabla: string;
  id: string;
  /** Main label: sort order and duplicate check. */
  etiqueta: string;
  campos: Campo[];
  /** 'bool' = column activo (added if missing) · 'estado' = id_estado (1 active, 2 inactive) · null = read only. */
  activo: { tipo: 'bool'; col: 'activo' } | { tipo: 'estado'; col: 'id_estado' } | null;
  padre?: { col: string; catalogo: string; label: string };
  sistema?: boolean;
};

const desc = (col: string, label = 'Descripción', max = 120): Campo => ({ col, label, max, requerido: true });

export const CATALOGOS: Catalogo[] = [
  // Personas
  { key: 'tipos-identificacion', grupo: 'Personas', titulo: 'Tipos de identificación', descripcion: 'Cédula, NIT, pasaporte… en registros de clientes, empleados y terceros.',
    tabla: 'TBL_TIP_IDENTIFICACIONES', id: 'id_tip_identificacion', etiqueta: 'v_des_identificacion',
    campos: [{ col: 'v_sigla_identificacion', label: 'Sigla', max: 10, requerido: true, mayus: true, ancho: 'corto' }, desc('v_des_identificacion'), { col: 'v_cod_dane', label: 'Código DANE', max: 10, requerido: true, ancho: 'corto' }],
    activo: { tipo: 'bool', col: 'activo' } },
  { key: 'generos', grupo: 'Personas', titulo: 'Géneros', descripcion: 'Opciones de género para clientes y comerciales.',
    tabla: 'TBL_GENEROS', id: 'id_genero', etiqueta: 'des_genero',
    campos: [{ col: 'cod_genero', label: 'Código', max: 5, requerido: true, mayus: true, ancho: 'corto' }, desc('des_genero')], activo: { tipo: 'bool', col: 'activo' } },
  { key: 'estado-civil', grupo: 'Personas', titulo: 'Estado civil', descripcion: 'Estado civil del empleado o cliente.',
    tabla: 'TBL_ESTADO_CIVIL', id: 'id_estado_civil', etiqueta: 'des_estado_civil', campos: [desc('des_estado_civil')], activo: { tipo: 'bool', col: 'activo' } },
  { key: 'tipo-vivienda', grupo: 'Personas', titulo: 'Tipos de vivienda', descripcion: 'Propia, arrendada, familiar…',
    tabla: 'TBL_TIPO_VIVIENDA', id: 'id_tipo_vivienda', etiqueta: 'des_tipo_vivienda', campos: [desc('des_tipo_vivienda')], activo: { tipo: 'bool', col: 'activo' } },
  { key: 'tipo-contrato', grupo: 'Personas', titulo: 'Tipos de contrato', descripcion: 'Contrato laboral del empleado: indefinido, fijo, obra o labor…',
    tabla: 'TBL_TIPO_CONTRATO', id: 'id_tipo_contrato', etiqueta: 'des_tipo_contrato', campos: [desc('des_tipo_contrato')], activo: { tipo: 'bool', col: 'activo' } },
  { key: 'cargos', grupo: 'Personas', titulo: 'Cargos', descripcion: 'Cargos de los empleados de las pagadurías.',
    tabla: 'TBL_CARGOS', id: 'id_cargo', etiqueta: 'des_cargo', campos: [desc('des_cargo', 'Cargo', 150)], activo: { tipo: 'estado', col: 'id_estado' } },

  // Direcciones y ubicación
  { key: 'departamentos', grupo: 'Ubicación y direcciones', titulo: 'Departamentos', descripcion: 'Departamentos de Colombia con su código DANE.',
    tabla: 'TBL_DEPARTAMENTOS', id: 'id_departamento', etiqueta: 'v_nom_departamento',
    campos: [desc('v_nom_departamento', 'Departamento', 100), { col: 'v_cod_dane', label: 'Código DANE', max: 10, requerido: true, ancho: 'corto' }], activo: { tipo: 'bool', col: 'activo' } },
  { key: 'ciudades', grupo: 'Ubicación y direcciones', titulo: 'Ciudades', descripcion: 'Municipios por departamento.',
    tabla: 'TBL_CIUDADES', id: 'id_ciudad', etiqueta: 'v_nom_ciudad',
    campos: [desc('v_nom_ciudad', 'Ciudad', 120), { col: 'v_cod_dane', label: 'Código DANE', max: 10, requerido: true, ancho: 'corto' }],
    padre: { col: 'id_departamento', catalogo: 'departamentos', label: 'Departamento' }, activo: { tipo: 'bool', col: 'activo' } },
  { key: 'tipo-via', grupo: 'Ubicación y direcciones', titulo: 'Tipos de vía', descripcion: 'Calle, carrera, avenida… para armar direcciones.',
    tabla: 'TBL_TIPO_VIA', id: 'id_tipo_via', etiqueta: 'des_tipo_via', campos: [desc('des_tipo_via', 'Tipo de vía', 60)], activo: { tipo: 'bool', col: 'activo' } },
  { key: 'letras-direccion', grupo: 'Ubicación y direcciones', titulo: 'Letras de dirección', descripcion: 'Letras y complementos (A, B, BIS…) de una dirección.',
    tabla: 'TBL_LETRA_DIR', id: 'id_letra_dir', etiqueta: 'des_letra', campos: [{ col: 'des_letra', label: 'Letra', max: 10, requerido: true, mayus: true }], activo: { tipo: 'bool', col: 'activo' } },

  // Créditos
  { key: 'tipos-credito', grupo: 'Créditos', titulo: 'Tipos de crédito', descripcion: 'Clasificación de los productos de crédito (libranza, consumo…).',
    tabla: 'TBL_TIPOS_CREDITO', id: 'id_tipo_credito', etiqueta: 'des_tipo_credito', campos: [desc('des_tipo_credito')], activo: { tipo: 'bool', col: 'activo' } },
  { key: 'tipos-atributo', grupo: 'Créditos', titulo: 'Tipos de atributo', descripcion: 'Clases de atributos de cálculo de un producto.',
    tabla: 'TBL_TIPOS_ATRIBUTO_CREDITO', id: 'id_tipo_atributo', etiqueta: 'des_tipo_atributo', campos: [desc('des_tipo_atributo')], activo: { tipo: 'bool', col: 'activo' } },
  { key: 'documentos-credito', grupo: 'Créditos', titulo: 'Documentos de crédito', descripcion: 'Documentos que se pueden exigir en un producto.',
    tabla: 'TBL_DOCUMENTOS_CREDITO', id: 'id_documento_credito', etiqueta: 'des_documento',
    campos: [desc('des_documento', 'Documento', 150), { col: 'grupo', label: 'Grupo', max: 60, ancho: 'corto' }], activo: { tipo: 'bool', col: 'activo' } },
  { key: 'tipos-estudio', grupo: 'Créditos', titulo: 'Tipos de estudio', descripcion: 'Tipos de estudio de crédito.',
    tabla: 'TBL_TIPO_ESTUDIOS', id: 'id_tipo_estudio', etiqueta: 'des_tipo_estudio', campos: [desc('des_tipo_estudio')], activo: { tipo: 'bool', col: 'activo' } },

  // Empresas y comerciales
  { key: 'tipos-entidad', grupo: 'Empresas y comerciales', titulo: 'Tipos de entidad', descripcion: 'Naturaleza de empresas, aliados y libranceras.',
    tabla: 'TBL_TIPO_ENTIDADES', id: 'id_tipo_entidad', etiqueta: 'des_tipo_entidad', campos: [desc('des_tipo_entidad')], activo: { tipo: 'bool', col: 'activo' } },
  { key: 'roles-vendedor', grupo: 'Empresas y comerciales', titulo: 'Roles de comercial', descripcion: 'Rol del comercial o vendedor.',
    tabla: 'TBL_ROLES_VENDEDOR', id: 'id_rol_vendedor', etiqueta: 'des_rol_vendedor', campos: [desc('des_rol_vendedor', 'Rol')], activo: { tipo: 'bool', col: 'activo' } },
  { key: 'tipos-origen', grupo: 'Empresas y comerciales', titulo: 'Tipos de origen', descripcion: 'Origen de los recursos o del registro.',
    tabla: 'TBL_TIPO_ORIGEN', id: 'id_tipo_origen', etiqueta: 'des_tipo_origen', campos: [desc('des_tipo_origen')], activo: { tipo: 'bool', col: 'activo' } },
  { key: 'ciiu', grupo: 'Empresas y comerciales', titulo: 'Actividades CIIU', descripcion: 'Clasificación de actividades económicas.',
    tabla: 'TBL_CODIGO_CIIUS', id: 'id_cod_ciiu', etiqueta: 'v_desc_ciiu',
    campos: [{ col: 'v_cod_ciiu', label: 'Código', max: 10, requerido: true, ancho: 'corto' }, desc('v_desc_ciiu', 'Actividad', 250)], activo: { tipo: 'bool', col: 'activo' } },

  // Financiero
  { key: 'tipos-cuenta', grupo: 'Financiero', titulo: 'Tipos de cuenta', descripcion: 'Ahorros, corriente… para cuentas bancarias.',
    tabla: 'TBL_TIPO_CUENTAS', id: 'id_tipo_cuenta', etiqueta: 'des_tipo_cuenta', campos: [desc('des_tipo_cuenta')], activo: { tipo: 'bool', col: 'activo' } },
  { key: 'monedas', grupo: 'Financiero', titulo: 'Monedas', descripcion: 'Monedas disponibles.',
    tabla: 'TBL_MONEDAS', id: 'id_moneda', etiqueta: 'v_desc_moneda',
    campos: [{ col: 'v_sigla_moneda', label: 'Sigla', max: 5, requerido: true, mayus: true, ancho: 'corto' }, desc('v_desc_moneda', 'Moneda', 60)], activo: { tipo: 'bool', col: 'activo' } },
  { key: 'tipos-movimiento', grupo: 'Financiero', titulo: 'Tipos de movimiento', descripcion: 'Movimientos contables del crédito.',
    tabla: 'TBL_TIPO_MOVIMIENTO_CREDITO', id: 'id_tipo_movimiento', etiqueta: 'v_descripcion', campos: [desc('v_descripcion')], activo: { tipo: 'bool', col: 'activo' } },

  // Sistema: the code depends on these exact values.
  { key: 'estados', grupo: 'Sistema (solo lectura)', titulo: 'Estados', descripcion: 'Activo / inactivo de los registros. Los usa el código.', sistema: true,
    tabla: 'TBL_ESTADOS', id: 'id_estado', etiqueta: 'v_descripcion', campos: [desc('v_descripcion')], activo: null },
  { key: 'estados-credito', grupo: 'Sistema (solo lectura)', titulo: 'Estados de crédito', descripcion: 'Estados del ciclo de vida del crédito. Los usa el código.', sistema: true,
    tabla: 'TBL_ESTADOS_CREDITO', id: 'id_estado_credito', etiqueta: 'v_descripcion', campos: [desc('v_descripcion')], activo: null },
  { key: 'etapas-credito', grupo: 'Sistema (solo lectura)', titulo: 'Etapas de crédito', descripcion: 'Etapas del flujo del crédito. Se configuran por producto.', sistema: true,
    tabla: 'TBL_ETAPAS_CREDITO', id: 'id_etapa_credito', etiqueta: 'des_etapa', campos: [desc('des_etapa', 'Etapa')], activo: null }
];

export const catalogo = (key: string) => CATALOGOS.find((c) => c.key === key) ?? null;
