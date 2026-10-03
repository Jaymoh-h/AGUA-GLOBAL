export type PaymentChannel = "cash" | "bank" | "mpesa_paybill" | "card" | "cheque";

export interface PaymentSubmission {
  customer_id: number;
  amount: number;
  payment_date: string;
  payment_channel: PaymentChannel;
  receipt_number?: string;
  external_reference?: string;
  received_from?: string;
  notes?: string;
  correction_reason?: string;
}

export interface ReadingSubmission {
  customer_id: number;
  meter_id: number;
  reading_value: number;
  previous_reading_value: number | null;
  reading_date: string;
  notes?: string;
  fallback_reason?: string;
  correction_reason?: string;
}

export interface ReportDateRange {
  start_date: string;
  end_date: string;
}

export interface MpesaCallbackFilters {
  status?: "posted" | "duplicate" | "rejected" | "";
  limit?: string | number;
}
