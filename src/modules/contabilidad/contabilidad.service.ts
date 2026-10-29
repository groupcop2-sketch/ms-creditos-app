import { env } from '../../config/env.js';

export interface SimularCapacidadInput {
  gross_income: number;
  legal_deductions: number;
  other_payroll_deductions: number;
  requested_amount: number;
  requested_term_months: number;
  annual_effective_rate?: number;
}

export interface SimularCapacidadResult {
  gross_monthly_income: number;
  legal_deductions: number;
  net_monthly_income: number;
  max_allowable_deduction: number;
  other_payroll_deductions: number;
  available_payment_capacity: number;
  estimated_installment: number;
  compliance_50_percent_passed: boolean;
  annual_effective_rate: number;
  monthly_nominal_rate: number;
  schedule_preview?: Array<{
    installment_number: number;
    scheduled_due_date: string;
    cutoff_date: string;
    scheduled_principal: number;
    scheduled_interest: number;
    scheduled_insurance: number;
    scheduled_other_charges: number;
    total_installment: number;
    remaining_principal_balance: number;
    status: string;
  }>;
}

export interface DesembolsoContableInput {
  creditoId: number;
  consecutivo: string;
  montoPrincipal: number;
  comisionOriginacion?: number;
  montoDesembolsadoNeto: number;
  terceroId?: string;
  bancoId?: string;
  fechaDesembolso?: string;
  observacion?: string;
}

export interface RecaudoContableInput {
  creditoId: number;
  consecutivo: string;
  referenciaPago: string;
  totalRecaudado: number;
  capitalAplicado: number;
  interesAplicado: number;
  seguroAplicado?: number;
  cargosAplicados?: number;
  terceroId?: string;
  bancoId?: string;
  fechaPago?: string;
  observacion?: string;
}

export interface JournalEntryLineDTO {
  line_number: number;
  account_id: string;
  account_code: string;
  account_name: string;
  third_party_id?: string;
  debit: number;
  credit: number;
  description: string;
}

export interface JournalEntryDTO {
  id: string;
  company_id: string;
  period_id: string;
  entry_number: string;
  entry_type: string;
  entry_date: string;
  concept: string;
  source_module: string;
  source_document_ref: string;
  status: string;
  lines: JournalEntryLineDTO[];
  total_debit: number;
  total_credit: number;
  created_at: string;
}

export interface EventoContableResponse {
  success: boolean;
  message: string;
  data: {
    event_id: string;
    journal_entry: JournalEntryDTO;
  };
}

export class ContabilidadService {
  private primaryUrl: string;
  private fallbackUrl: string;
  private companyId: string;

  constructor() {
    this.primaryUrl = env.ACCOUNTING_API_URL || 'http://localhost:3000/api/v1';
    this.fallbackUrl = 'http://localhost:3001/api/v1';
    this.companyId = env.ACCOUNTING_COMPANY_ID || '11111111-1111-1111-1111-111111111111';
  }

  private async fetchWithFallback<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const urls = [this.primaryUrl, this.fallbackUrl];
    let lastError: Error | null = null;

    for (const baseUrl of urls) {
      try {
        const fullUrl = `${baseUrl.replace(/\/$/, '')}/${endpoint.replace(/^\//, '')}`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 6000);

        const res = await fetch(fullUrl, {
          ...options,
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            ...(options.headers || {})
          }
        });
        clearTimeout(timeout);

        if (!res.ok) {
          const errBody = (await res.json().catch(() => ({}))) as Record<string, any>;
          throw new Error(errBody.error || errBody.message || `HTTP ${res.status}: ${res.statusText}`);
        }

        return await res.json() as T;
      } catch (err: any) {
        lastError = err;
      }
    }

    throw new Error(`Error comunicando con la API de Contabilidad (${this.primaryUrl} / ${this.fallbackUrl}): ${lastError?.message}`);
  }

  /**
   * Health & Status del Motor Contable
   */
  async getStatus(): Promise<{
    online: boolean;
    activeUrl?: string;
    companyId: string;
    templatesCount?: number;
    message?: string;
  }> {
    try {
      const templates = await this.fetchWithFallback<any>('/engine/templates');
      return {
        online: true,
        activeUrl: this.primaryUrl,
        companyId: this.companyId,
        templatesCount: Array.isArray(templates?.data) ? templates.data.length : 0,
        message: 'Motor Contable NIIF Online y Operativo'
      };
    } catch (e: any) {
      return {
        online: false,
        companyId: this.companyId,
        message: `Contabilidad no disponible: ${e.message}`
      };
    }
  }

  /**
   * PASO 2 de la Arquitectura: Valida identidad, capacidad (Ley 1527 de 2012) y política
   * Invoca /libranza/simulate-capacity en la API contable
   */
  async validarCapacidadLey1527(input: SimularCapacidadInput): Promise<SimularCapacidadResult> {
    const body = {
      gross_income: input.gross_income,
      legal_deductions: input.legal_deductions,
      other_payroll_deductions: input.other_payroll_deductions,
      requested_amount: input.requested_amount,
      requested_term_months: input.requested_term_months,
      annual_effective_rate: input.annual_effective_rate ?? 0.225
    };

    const res = await this.fetchWithFallback<{ success: boolean; data: SimularCapacidadResult }>(
      '/libranza/simulate-capacity',
      {
        method: 'POST',
        body: JSON.stringify(body)
      }
    );

    return res.data;
  }

  /**
   * PASO 7 de la Arquitectura:
   * "Financiera -> Contabilidad: Registra desembolso, cartera e intereses por devengar"
   * Despacha el evento LIBRANZA_DESEMBOLSO al motor contable para generar comprobante de egreso.
   * Cuentas afectadas:
   *   - DEBITO  13050501: Cartera Créditos Libranza Vigente (Monto Principal)
   *   - CREDITO 41350510: Ingresos Comisión de Estudio Originación
   *   - CREDITO 11100501: Bancos Nacionales Moneda Local (Dispersión Neta de Fondos)
   */
  async registrarDesembolsoContable(input: DesembolsoContableInput): Promise<EventoContableResponse> {
    const entryDate = input.fechaDesembolso || new Date().toISOString().slice(0, 10);
    const fee = input.comisionOriginacion ?? Math.max(0, input.montoPrincipal - input.montoDesembolsadoNeto);
    const netDisbursed = input.montoDesembolsadoNeto;

    const payload = {
      company_id: this.companyId,
      event_code: 'LIBRANZA_DESEMBOLSO',
      source_module: 'LIBRANZA',
      source_reference: input.consecutivo || `CR-${input.creditoId}`,
      payload: {
        principal_amount: input.montoPrincipal,
        origination_fee: fee,
        disbursed_net_amount: netDisbursed,
        borrower_id: input.terceroId || 'c1000000-0000-0000-0000-000000000002',
        bank_id: input.bancoId || 'a1000000-0000-0000-0000-000000000001',
        entry_date: entryDate
      }
    };

    return await this.fetchWithFallback<EventoContableResponse>('/engine/events', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  /**
   * PASO 9 de la Arquitectura:
   * "Financiera -> Contabilidad: Aplica pago a capital, intereses, seguros y cargos"
   * Despacha el evento LIBRANZA_RECAUDO al motor contable para generar comprobante de ingreso.
   * Cuentas afectadas:
   *   - DEBITO  11100501: Bancos Recaudo Nómina (Total Recaudado)
   *   - CREDITO 13050501: Cartera Principal Amortizada
   *   - CREDITO 41350501: Ingresos por Intereses Corrientes
   *   - CREDITO 23700501: Seguros de Vida por Pagar / Cargos
   */
  async registrarRecaudoContable(input: RecaudoContableInput): Promise<EventoContableResponse> {
    const entryDate = input.fechaPago || new Date().toISOString().slice(0, 10);

    const payload = {
      company_id: this.companyId,
      event_code: 'LIBRANZA_RECAUDO',
      source_module: 'LIBRANZA',
      source_reference: input.referenciaPago || `PG-${input.consecutivo}-${Date.now().toString().slice(-4)}`,
      payload: {
        total_collected: input.totalRecaudado,
        applied_principal: input.capitalAplicado,
        applied_interest: input.interesAplicado,
        applied_insurance: input.seguroAplicado || 0,
        borrower_id: input.terceroId || 'c1000000-0000-0000-0000-000000000002',
        bank_id: input.bancoId || 'a1000000-0000-0000-0000-000000000001',
        entry_date: entryDate
      }
    };

    return await this.fetchWithFallback<EventoContableResponse>('/engine/events', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  /**
   * Consultar comprobantes contables por referencia de crédito o módulo
   */
  async getComprobantes(referencia?: string): Promise<JournalEntryDTO[]> {
    const query = new URLSearchParams({
      company_id: this.companyId,
      module: 'LIBRANZA'
    });

    const res = await this.fetchWithFallback<{ success: boolean; data: JournalEntryDTO[] }>(
      `/core/journal-entries?${query.toString()}`
    );

    const entries = Array.isArray(res?.data) ? res.data : [];
    if (!referencia) return entries;

    const refUpper = referencia.toUpperCase();
    return entries.filter(
      (e) =>
        e.source_document_ref?.toUpperCase().includes(refUpper) ||
        e.concept?.toUpperCase().includes(refUpper)
    );
  }

  /**
   * Consultar balance de comprobación de la financiera
   */
  async getTrialBalance(): Promise<any> {
    return await this.fetchWithFallback<any>(`/core/trial-balance?company_id=${this.companyId}`);
  }

  /**
   * Consultar catálogo de cuentas PUC
   */
  async getChartOfAccounts(): Promise<any> {
    return await this.fetchWithFallback<any>(`/core/chart-of-accounts?company_id=${this.companyId}`);
  }
}

export const contabilidadService = new ContabilidadService();
