// PROVISIONAL — in-memory mock "backend" for Open Projects. Finalize (P2-E,
// QuotationResultsStep.tsx) calls saveFinalizedQuotation() instead of hitting a real API —
// there is no /api/quotations/finalize endpoint, and quote_group_id/tier/is_selected don't
// exist on `quotation` until the addendum is applied. A plain module-level array (not
// useState) is what lets a saved project survive the route change from /quotations/new to
// /projects — this is the SPA-session equivalent of "it was actually saved," gone on a full
// page reload the same way every other lib/dev/ fixture is.
//
// ‼️ SNAPSHOT INTEGRITY — read this before touching this file:
// Every SavedQuoteSnapshot.result below is computed ONCE, at seed time or at the moment
// Finalize runs, via computeTierResult/deriveMockItemLines. NOTHING in this store, or in
// any component that reads from it (Open Projects list/detail), may call those functions
// again against a saved snapshot. A quote finalized under one pricelist basis must keep
// showing those exact numbers even after the live fixtures change — the audit-trail
// principle this whole module exists to demonstrate. If you're tempted to "refresh" a
// saved project's numbers on read, don't; that's re-deriving, not reading a snapshot.
import { useSyncExternalStore } from 'react';
import { computeTierResult, deriveMockItemLines } from './quotationBreakdownFixtures';
import { createManualSegment, type DraftSegment } from '@/features/quotation-generation/lib/draftSegment';
import { stagingId } from './quotationGenerationTypes';
import type { PricelistBasis, ProvisionalTier } from './quotationBreakdownTypes';
import type { SavedProjectRecord, SavedQuoteSnapshot } from './savedProjectsTypes';

function seedSegments(spec: { name: string; floor: string; area: number; treatment: string }[]): DraftSegment[] {
  return spec.map((s) => ({ ...createManualSegment(s.name), floor_level: s.floor, area_sqm: s.area, treatment_type: s.treatment }));
}

function buildSnapshot(segments: DraftSegment[], tier: ProvisionalTier, quoteGroupId: string, quoteId: number, basis: PricelistBasis, finalizedAt: string): SavedQuoteSnapshot {
  const items = deriveMockItemLines(segments, tier, basis);
  return {
    quote_id: quoteId,
    tier,
    quote_group_id: quoteGroupId,
    is_selected: null,
    pricelist_basis_at_finalize: basis,
    finalized_at: finalizedAt,
    result: computeTierResult(tier, items),
  };
}

function buildSeedProject(input: {
  projectId: string;
  quoteGroupId: string;
  clientId: number;
  clientName: string;
  projectName: string;
  projectLocation: string;
  projectRegion: string;
  createdAt: string;
  segments: { name: string; floor: string; area: number; treatment: string }[];
  quoteIdPractical: number;
  quoteIdPremium: number;
  acceptedTier?: ProvisionalTier;
}): SavedProjectRecord {
  const segments = seedSegments(input.segments);
  const practical = buildSnapshot(segments, 'Practical', input.quoteGroupId, input.quoteIdPractical, 'Uploaded', input.createdAt);
  const premium = buildSnapshot(segments, 'Premium', input.quoteGroupId, input.quoteIdPremium, 'Uploaded', input.createdAt);
  if (input.acceptedTier === 'Practical') practical.is_selected = true;
  if (input.acceptedTier === 'Premium') premium.is_selected = true;
  if (input.acceptedTier) (input.acceptedTier === 'Practical' ? premium : practical).is_selected = false;
  return {
    project_id: input.projectId,
    quote_group_id: input.quoteGroupId,
    client_id: input.clientId,
    client_name: input.clientName,
    project_name: input.projectName,
    project_location: input.projectLocation,
    project_region: input.projectRegion,
    status: 'Final',
    created_at: input.createdAt,
    updated_at: input.createdAt,
    quotes: { Practical: practical, Premium: premium },
  };
}

// Two seeded example projects so Open Projects isn't empty on first visit — same
// "demonstrates the honest empty/first-time state alongside a populated one" convention as
// clientsFixture. Neither is selected by default (matches Part B: finalize never picks a
// tier for the client).
let projects: SavedProjectRecord[] = [
  buildSeedProject({
    projectId: 'proj-5001',
    quoteGroupId: 'qg-5001',
    clientId: 5001,
    clientName: 'Rivercrest Family Trust',
    projectName: 'Rivercrest Residence Roof Waterproofing',
    projectLocation: 'San Juan, Metro Manila',
    projectRegion: 'NCR',
    createdAt: '2026-05-14T10:00:00.000Z',
    quoteIdPractical: 9101,
    quoteIdPremium: 9102,
    acceptedTier: 'Premium',
    segments: [
      { name: 'Living Room', floor: 'Ground Floor', area: 24.6, treatment: 'Cementitious Waterproofing' },
      { name: 'Roof Deck', floor: 'Roof', area: 48.2, treatment: 'Torch-Applied Membrane' },
    ],
  }),
  buildSeedProject({
    projectId: 'proj-5002',
    quoteGroupId: 'qg-5002',
    clientId: 5002,
    clientName: 'Northline Logistics Corp.',
    projectName: 'Northline Warehouse Roof Retrofit',
    projectLocation: 'Cabuyao, Laguna',
    projectRegion: 'Region IV-A',
    createdAt: '2026-06-02T14:30:00.000Z',
    quoteIdPractical: 9103,
    quoteIdPremium: 9104,
    segments: [
      { name: 'Main Warehouse Roof', floor: 'Roof', area: 310.5, treatment: 'Elastomeric Waterproofing' },
      { name: 'Loading Bay Canopy', floor: 'Roof', area: 62.0, treatment: 'Polyurethane (PU) Waterproofing' },
    ],
  }),
];

const listeners = new Set<() => void>();
function notify() {
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return projects;
}

/** React hook — reactive list of every saved project, newest first. */
export function useSavedProjects(): SavedProjectRecord[] {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function getSavedProject(projectId: string): SavedProjectRecord | undefined {
  return projects.find((p) => p.project_id === projectId);
}

let nextQuoteId = 9200;

// P2-B — Finalize's real call site (QuotationResultsStep.tsx). Freezes BOTH tiers as
// siblings of one quote_group_id; is_selected stays null on both — the client hasn't
// chosen yet, and Finalize must never force a pick (see Part B's guardrail).
//
// Takes the ALREADY-COMPUTED tier results the wizard is showing (including anything Minor
// Revision changed before the user clicked Finalize), rather than re-deriving from
// `segments` here. Re-deriving at this point would silently throw away a Minor Revision
// override — the frozen snapshot must be exactly what was on screen when the user
// finalized, not a fresh recomputation. computeTierResult still runs here ONCE, which is
// the save itself (a real backend would persist at this same moment); nothing may call it
// again for this record afterward.
export function saveFinalizedQuotation(input: {
  clientId: number;
  clientName: string;
  projectName: string;
  projectLocation: string;
  projectRegion: string;
  tierItems: Record<ProvisionalTier, Parameters<typeof computeTierResult>[1]>;
  pricelistBasis: PricelistBasis;
}): SavedProjectRecord {
  const now = new Date().toISOString();
  const quoteGroupId = stagingId('qg');
  const practical: SavedQuoteSnapshot = {
    quote_id: nextQuoteId++,
    tier: 'Practical',
    quote_group_id: quoteGroupId,
    is_selected: null,
    pricelist_basis_at_finalize: input.pricelistBasis,
    finalized_at: now,
    result: computeTierResult('Practical', input.tierItems.Practical),
  };
  const premium: SavedQuoteSnapshot = {
    quote_id: nextQuoteId++,
    tier: 'Premium',
    quote_group_id: quoteGroupId,
    is_selected: null,
    pricelist_basis_at_finalize: input.pricelistBasis,
    finalized_at: now,
    result: computeTierResult('Premium', input.tierItems.Premium),
  };
  const record: SavedProjectRecord = {
    project_id: stagingId('proj'),
    quote_group_id: quoteGroupId,
    client_id: input.clientId,
    client_name: input.clientName,
    project_name: input.projectName,
    project_location: input.projectLocation,
    project_region: input.projectRegion,
    status: 'Final',
    created_at: now,
    updated_at: now,
    quotes: { Practical: practical, Premium: premium },
  };
  projects = [record, ...projects];
  notify();
  return record;
}

// Part C — "Mark as Accepted": a flag the CONTRACTOR sets once the client has chosen,
// nothing more. Passing null clears both (undoes an accidental mark); passing a tier marks
// that one true and its sibling false, never both true at once.
export function setAcceptedTier(projectId: string, tier: ProvisionalTier | null): void {
  projects = projects.map((p) => {
    if (p.project_id !== projectId) return p;
    return {
      ...p,
      updated_at: new Date().toISOString(),
      quotes: {
        Practical: { ...p.quotes.Practical, is_selected: tier === null ? null : tier === 'Practical' },
        Premium: { ...p.quotes.Premium, is_selected: tier === null ? null : tier === 'Premium' },
      },
    };
  });
  notify();
}
