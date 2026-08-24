"use client";

import { useSyncExternalStore } from "react";
import { computeTierResult } from "./quotationBreakdownFixtures";
import {
  PROVISIONAL_TIERS,
  type ProvisionalItemLine,
  type FinalizedQuotationInput,
  type ProvisionalTier,
  type SavedQuoteSnapshot,
  type SavedQuoteVersion,
  type SavedProjectRecord,
} from "./quotationBreakdownTypes";
import type { Client, Quotation } from "@/types/entities";
import type { DraftSegment } from "@/features/quotation-generation/lib/draftSegment";
import type { InputMethod, WizardPhase } from "@/features/quotation-generation/lib/workflowSteps";
import type { BlueprintFloor } from "./quotationGenerationTypes";

const STORAGE_KEY = "buildsmart_saved_projects_v1";
const listeners = new Set<() => void>();
const EMPTY_PROJECTS: SavedProjectRecord[] = [];
let cachedRaw: string | null = null;
let cachedProjects: SavedProjectRecord[] = EMPTY_PROJECTS;

function emit() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function newVersion(tier: ProvisionalTier, result: SavedQuoteVersion["result"], versionNumber: number, now: string): SavedQuoteVersion {
  return {
    version_id: `${tier.toLowerCase()}-v${versionNumber}-${Date.now()}`,
    version_number: versionNumber,
    result,
    price_reference_date: now,
  };
}

function normalizeProject(project: SavedProjectRecord): SavedProjectRecord {
  const now = project.updated_at || project.created_at || new Date().toISOString();
  const legacyQuotes = project.quotes as Partial<Record<ProvisionalTier | "Economic", SavedQuoteSnapshot>>;
  const practical = legacyQuotes.Practical ?? legacyQuotes.Economic;
  const premium = legacyQuotes.Premium;

  if (!practical || !premium) return project;

  const normalizeQuote = (quote: SavedQuoteSnapshot, tier: ProvisionalTier): SavedQuoteSnapshot => {
    const versions = Array.isArray(quote.versions) && quote.versions.length > 0
      ? quote.versions
      : [newVersion(tier, quote.result, 1, quote.finalized_at || now)];

    return {
      ...quote,
      tier,
      versions,
      result: versions[0]?.result ?? quote.result,
      finalized_at: quote.finalized_at || now,
      is_selected: quote.is_selected === true,
    };
  };

  return {
    ...project,
    quotes: {
      Practical: normalizeQuote(practical, "Practical"),
      Premium: normalizeQuote(premium, "Premium"),
    },
    segmentsSnapshot: project.segmentsSnapshot ?? [],
    blueprintFloors: project.blueprintFloors ?? null,
  };
}

function readProjects(): SavedProjectRecord[] {
  if (typeof window === "undefined") return EMPTY_PROJECTS;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw === cachedRaw) return cachedProjects;
  cachedRaw = raw;
  if (!raw) {
    cachedProjects = EMPTY_PROJECTS;
    return cachedProjects;
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    cachedProjects = Array.isArray(parsed) ? (parsed as SavedProjectRecord[]).map(normalizeProject) : EMPTY_PROJECTS;
    return cachedProjects;
  } catch {
    cachedProjects = EMPTY_PROJECTS;
    return cachedProjects;
  }
}

function writeProjects(projects: SavedProjectRecord[]) {
  if (typeof window === "undefined") return;
  const raw = JSON.stringify(projects);
  window.localStorage.setItem(STORAGE_KEY, raw);
  cachedRaw = raw;
  cachedProjects = projects;
  emit();
}

function snapshot() {
  return readProjects();
}

function serverSnapshot() {
  return EMPTY_PROJECTS;
}

export function useSavedProjects() {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}

export function deleteSavedProject(projectId: string) {
  writeProjects(readProjects().filter((project) => project.project_id !== projectId));
}

export function getSavedProject(projectId: string) {
  return readProjects().find((project) => project.project_id === projectId) ?? null;
}

function saveQuotationSnapshot(input: FinalizedQuotationInput, status: SavedProjectRecord["status"]): SavedProjectRecord {
  const now = new Date().toISOString();
  const existing = input.quoteId
    ? readProjects().find((project) => project.source_quote_id === input.quoteId)
    : null;
  const projectId = existing?.project_id ?? `${status === "Draft" ? "draft" : "proj"}-${Date.now()}`;
  const practicalResult = computeTierResult("Practical", input.tierItems.Practical);
  const premiumResult = computeTierResult("Premium", input.tierItems.Premium);
  const project: SavedProjectRecord = {
    project_id: projectId,
    source_quote_id: input.quoteId ?? existing?.source_quote_id ?? null,
    client_id: input.clientId,
    client_name: input.clientName,
    project_name: input.projectName,
    project_location: input.projectLocation,
    project_region: input.projectRegion,
    status,
    created_at: existing?.created_at ?? now,
    updated_at: now,
    quotes: {
      Practical: {
        tier: "Practical",
        result: practicalResult,
        versions: [newVersion("Practical", practicalResult, 1, now)],
        pricelist_basis_at_finalize: input.pricelistBasis,
        finalized_at: now,
        is_selected: existing?.quotes.Practical.is_selected ?? false,
      },
      Premium: {
        tier: "Premium",
        result: premiumResult,
        versions: [newVersion("Premium", premiumResult, 1, now)],
        pricelist_basis_at_finalize: input.pricelistBasis,
        finalized_at: now,
        is_selected: existing?.quotes.Premium.is_selected ?? false,
      },
    },
    segmentsSnapshot: input.segments,
    blueprintFloors: input.blueprintFloors,
  };
  writeProjects([project, ...readProjects().filter((saved) => saved.project_id !== projectId)]);
  return project;
}

export function saveDraftQuotation(input: FinalizedQuotationInput): SavedProjectRecord {
  return saveQuotationSnapshot(input, "Draft");
}

export function saveInProgressQuotation(input: {
  quotation: Quotation;
  client: Client;
  step: WizardPhase;
  method: InputMethod;
  segments: DraftSegment[];
  blueprintFloors: BlueprintFloor[] | null;
  blueprintFilePath: string | null;
}) {
  const project = saveQuotationSnapshot(
    {
      quoteId: input.quotation.quote_id,
      clientId: input.client.client_id,
      clientName: input.client.client_name,
      projectName: input.quotation.project_name,
      projectLocation: input.quotation.project_location,
      projectRegion: input.quotation.project_region,
      tierItems: { Practical: [], Premium: [] },
      pricelistBasis: "Uploaded",
      segments: input.segments,
      blueprintFloors: input.blueprintFloors,
    },
    "Draft"
  );
  const updated = {
    ...project,
    resume_step: input.step,
    resume_method: input.method,
    quotationSnapshot: input.quotation,
    clientSnapshot: input.client,
    blueprintFilePath: input.blueprintFilePath,
  };
  writeProjects([updated, ...readProjects().filter((saved) => saved.project_id !== project.project_id)]);
  return updated;
}

export function saveFinalizedQuotation(input: FinalizedQuotationInput): SavedProjectRecord {
  return saveQuotationSnapshot(input, "Final");
}

export function refreshQuotePrices(projectId: string, tier: ProvisionalTier) {
  const now = new Date().toISOString();
  writeProjects(
    readProjects().map((project) => {
      if (project.project_id !== projectId) return project;

      const quote = project.quotes[tier];
      const latest = quote.versions[quote.versions.length - 1];
      const nextVersion = newVersion(tier, latest.result, latest.version_number + 1, now);

      return {
        ...project,
        updated_at: now,
        quotes: {
          ...project.quotes,
          [tier]: {
            ...quote,
            versions: [...quote.versions, nextVersion],
          },
        },
      };
    })
  );
}

export function setAcceptedTier(projectId: string, tier: ProvisionalTier | null) {
  writeProjects(
    readProjects().map((project) => {
      if (project.project_id !== projectId) return project;
      return {
        ...project,
        updated_at: new Date().toISOString(),
        quotes: Object.fromEntries(
          PROVISIONAL_TIERS.map((name) => [
            name,
            {
              ...project.quotes[name],
              is_selected: tier === name,
            },
          ])
        ) as SavedProjectRecord["quotes"],
      };
    })
  );
}

export function updateSavedQuoteVersionItems(
  projectId: string,
  tier: ProvisionalTier,
  versionId: string,
  items: ProvisionalItemLine[]
) {
  const now = new Date().toISOString();
  writeProjects(
    readProjects().map((project) => {
      if (project.project_id !== projectId) return project;

      const quote = project.quotes[tier];
      const versions = quote.versions.map((version) => {
        if (version.version_id !== versionId) return version;
        return {
          ...version,
          result: computeTierResult(tier, items, {
            vatInclusive: version.result.vat_inclusive,
            downpaymentPercentage: version.result.downpayment_percentage,
          }),
          price_reference_date: now,
        };
      });
      const updatedResult = versions.find((version) => version.version_id === versionId)?.result ?? quote.result;
      const updatesPrimarySnapshot = quote.versions[0]?.version_id === versionId;

      return {
        ...project,
        updated_at: now,
        quotes: {
          ...project.quotes,
          [tier]: {
            ...quote,
            result: updatesPrimarySnapshot ? updatedResult : quote.result,
            versions,
          },
        },
      };
    })
  );
}
