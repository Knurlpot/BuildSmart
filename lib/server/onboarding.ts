import "server-only";

export async function resolvePersistedOnboardingStep(companyId: number): Promise<number> {
  void companyId;
  return 2;
}
