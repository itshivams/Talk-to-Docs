import useSWR, { SWRConfiguration } from "swr";

import { apiRequest } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export function useAuthedSWR<T>(path: string | null, config?: SWRConfiguration) {
  const { token } = useAuth();
  return useSWR<T, Error, [string, string] | null>(token && path ? [path, token] : null, ([url, authToken]) => apiRequest<T>(url, {}, authToken), config);
}
