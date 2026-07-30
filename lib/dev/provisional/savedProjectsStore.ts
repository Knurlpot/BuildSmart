"use client";

import { useSyncExternalStore } from "react";
import { computeTierResult } from "./quotationBreakdownFixtures";
import {
  PROVISIONAL_TIERS,
  type FinalizedQuotationInput,
  type ProvisionalTier,
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
    cachedProjects = Array.isArray(parsed) ? (parsed as SavedProjectRecord[]) : EMPTY_PROJECTS;
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

export function saveFinalizedQuotation(input: FinalizedQuotationInput): SavedProjectRecord {
  const now = new Date().toISOString();
  const projectId = `proj-${Date.now()}`;
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
    quotes: {
      Practical: {
        tier: "Practical",
        result: computeTierResult("Practical", input.tierItems.Practical),
        pricelist_basis_at_finalize: input.pricelistBasis,
        finalized_at: now,
        is_selected: false,
      },
      Premium: {
        tier: "Premium",
        result: computeTierResult("Premium", input.tierItems.Premium),
        pricelist_basis_at_finalize: input.pricelistBasis,
        finalized_at: now,
        is_selected: false,
      },
    },
  };
  writeProjects([project, ...readProjects()]);
  return project;
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
