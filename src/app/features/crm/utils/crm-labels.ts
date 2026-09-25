import { PartyDetail } from '../models/crm.models';

/** Minimal shape needed to render a vehicle label (covers SDK VehicleSummary and VehicleResponse). */
export interface VehicleLike {
  year?: number;
  make?: string;
  model?: string;
  vin?: string;
  description?: string;
}

/**
 * Canonical customer display label: "Legal Name (DBA) · CUST-NUMBER",
 * omitting the DBA and/or number segments when absent.
 */
export function partyLabel(party: PartyDetail): string {
  const num = party.customerNumber ? ` · ${party.customerNumber}` : '';
  return party.dba ? `${party.legalName} (${party.dba})${num}` : `${party.legalName}${num}`;
}

/**
 * Canonical vehicle display label: "YEAR MAKE MODEL — VIN",
 * falling back to the human description or VIN when the parts are missing.
 */
export function vehicleLabel(v: VehicleLike): string {
  const desc = `${v.year ?? ''} ${v.make ?? ''} ${v.model ?? ''}`.trim();
  if (desc && v.vin) return `${desc} — ${v.vin}`;
  return v.description || desc || v.vin || '';
}
