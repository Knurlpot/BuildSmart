import { useMutation } from './useMutation';
import type { Quotation } from '@/types/entities';
import type { BlueprintExtractionResult } from '@/lib/dev/provisional/quotationGenerationTypes';
import type { ProjectSegmentPayload } from '@/features/quotation-generation/lib/draftSegment';

export interface CreateQuotationPayload {
  project_name: string;
  project_location: string;
  project_region: Quotation['project_region'];
  input_method: Quotation['input_method'];
}

export function useCreateQuotation() {
  const create = useMutation<Quotation>();
  return {
    createQuotation: (payload: CreateQuotationPayload) => create.mutate('/api/quotations/new', payload, 'POST'),
    isCreating: create.isLoading,
    createError: create.error,
    resetCreate: create.reset,
  };
}

export function useUpdateQuotationInputMethod() {
  const update = useMutation<Quotation>();
  return {
    updateInputMethod: (quoteId: number, inputMethod: Quotation['input_method']) =>
      update.mutate(`/api/quotations/${quoteId}`, { input_method: inputMethod }, 'PATCH'),
    isUpdating: update.isLoading,
    updateError: update.error,
  };
}

export function useBlueprintExtraction() {
  const extract = useMutation<BlueprintExtractionResult>();
  return {
    extractBlueprint: (quoteId: number, file: File) => {
      const form = new FormData();
      form.append('file', file);
      return extract.mutate(`/api/quotations/${quoteId}/blueprint-extract`, form, 'POST');
    },
    isExtracting: extract.isLoading,
    extractError: extract.error,
    resetExtract: extract.reset,
  };
}

export function useSaveSegments() {
  const save = useMutation<{ saved_count: number }>();
  return {
    saveSegments: (quoteId: number, segments: ProjectSegmentPayload[]) =>
      save.mutate(`/api/quotations/${quoteId}/segments`, { segments }, 'POST'),
    isSaving: save.isLoading,
    saveError: save.error,
    resetSave: save.reset,
  };
}