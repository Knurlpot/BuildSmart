import { useState, useEffect } from 'react';
export function useFetch<T>(url: string) {
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  // TODO: Implement real fetch logic later
  return { data, isLoading, error };
}