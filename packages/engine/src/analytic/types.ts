/** A quantity computed two independent ways: closed-form theory vs. measured from the simulation. */
export interface CheckedQuantity {
  id: string;
  label: string;
  unit: string;
  analytic: number;
  simulated: number;
  errorPct: number;
  /** Human-readable formula used for the analytic value. */
  formula: string;
}

/** A universal self-consistency audit that applies to any scene (energy, KCL, Snell…). */
export interface AuditCheck {
  label: string;
  value: number;
  unit: string;
  pass: boolean;
  detail: string;
}

export interface Verification {
  /** Recognised textbook archetype, or null when only audits apply. */
  archetype: string | null;
  summary: string;
  quantities: CheckedQuantity[];
  audits: AuditCheck[];
  notes: string[];
}
