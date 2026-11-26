// Prefer same-origin API requests so the browser follows whichever domain or
// port serves the frontend. An absolute API URL can still be supplied through
// NEXT_PUBLIC_API_URL for local development or a separate API deployment.
export function getApiBaseUrl(): string {
  return process.env.NEXT_PUBLIC_API_URL || '/api';
}

export const API_BASE_URL = getApiBaseUrl();

export async function fetchWithAuth(endpoint: string, options: RequestInit = {}) {
  // If we are in the browser, try to get the token or we can just fetch it from localStorage
  let token = '';
  if (typeof window !== 'undefined') {
    token = localStorage.getItem('access_token') || '';
  }

  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;

  const headers: Record<string, string> = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(options.headers as Record<string, string> || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const config: RequestInit = {
    ...options,
    headers,
  };

  const response = await fetch(`${API_BASE_URL}${endpoint}`, config);

  if (response.status === 401) {
    // Optionally trigger a logout or token refresh if 401
    // For now, clear token and redirect to login if it's an unauthenticated request to an authenticated endpoint
    if (typeof window !== 'undefined') {
      localStorage.removeItem('access_token');
      localStorage.removeItem('user');
      // window.location.href = '/login'; // Let AuthContext handle this instead
    }
  }

  return response;
}
