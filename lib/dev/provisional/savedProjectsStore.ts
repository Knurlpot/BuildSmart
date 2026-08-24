"use client";

import { useSyncExternalStore } from "react";
import { computeTierResult } from "./quotationBreakdownFixtures";
import {
  type FinalizedQuotationInput,
  type ProvisionalItemLine,
  type ProvisionalTier,
  type SavedQuoteSnapshot,
  type SavedQuoteVersion,
  type SavedProjectRecord,
} from "./quotationBreakdownTypes";

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
  const legacyQuotes = project.quotes as Partial<Record<ProvisionalTier | "Economic" | "Good" | "Better" | "Best" | "Economy", SavedQuoteSnapshot>>;

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
  const normalizedQuotes = Object.fromEntries(
    Object.entries(legacyQuotes).flatMap(([rawTier, quote]) => {
      if (!quote) return [];
      const tier = rawTier === "Premium" || rawTier === "Best" ? "Premium" : "Practical";
      return [[tier, normalizeQuote(quote, tier as ProvisionalTier)]];
    })
  ) as SavedProjectRecord["quotes"];

  return {
    ...project,
    quotes: normalizedQuotes,
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

export function saveFinalizedQuotation(input: FinalizedQuotationInput): SavedProjectRecord {
  const now = new Date().toISOString();
  const projectId = `proj-${Date.now()}`;
  const quotes = Object.fromEntries(
    Object.entries(input.tierItems).flatMap(([tier, items]) => {
      if (!items) return [];
      const typedTier = tier as ProvisionalTier;
      const result = computeTierResult(typedTier, items, {
        segments: input.segments,
        materialRules: input.materialRules,
        laborRules: input.laborRules,
      });
      return [
        [
          typedTier,
          {
            tier: typedTier,
            result,
            versions: [newVersion(typedTier, result, 1, now)],
            pricelist_basis_at_finalize: input.pricelistBasis,
            finalized_at: now,
            is_selected: false,
          },
        ],
      ];
    })
  ) as SavedProjectRecord["quotes"];
  const project: SavedProjectRecord = {
    project_id: projectId,
    client_id: input.clientId,
    client_name: input.clientName,
    project_name: input.projectName,
    project_location: input.projectLocation,
    project_region: input.projectRegion,
    status: "Final",
    created_at: now,
    updated_at: now,
    quotes,
    segmentsSnapshot: input.segments,
    blueprintFloors: input.blueprintFloors,
  };
  writeProjects([project, ...readProjects()]);
  return project;
}

export function refreshQuotePrices(projectId: string, tier: ProvisionalTier) {
  const now = new Date().toISOString();
  writeProjects(
    readProjects().map((project) => {
      if (project.project_id !== projectId) return project;

      const quote = project.quotes[tier];
      if (!quote) return project;
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

export function updateSavedQuoteVersionItems(
  projectId: string,
  tier: ProvisionalTier,
  versionId: string,
  items: ProvisionalItemLine[]
) {
  writeProjects(
    readProjects().map((project) => {
      if (project.project_id !== projectId) return project;
      const quote = project.quotes[tier];
      if (!quote) return project;

      const versions = quote.versions.map((version) => {
        if (version.version_id !== versionId) return version;
        return {
          ...version,
          result: computeTierResult(tier, items, { segments: project.segmentsSnapshot }),
          price_reference_date: new Date().toISOString(),
        };
      });
      const currentResult = versions.find((version) => version.version_id === versionId)?.result ?? quote.result;

      return {
        ...project,
        updated_at: new Date().toISOString(),
        quotes: {
          ...project.quotes,
          [tier]: {
            ...quote,
            result: currentResult,
            versions,
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
          Object.entries(project.quotes).map(([name, quote]) => [
            name,
            quote ? { ...quote, is_selected: tier === name } : quote,
          ])
        ) as SavedProjectRecord["quotes"],
      };
    })
  );
}
