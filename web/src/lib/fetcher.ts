export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export async function apiFetcher<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: 'no-store' });

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;

    try {
      const payload = (await response.json()) as { error?: string };
      if (payload?.error) {
        message = payload.error;
      }
    } catch {
      const text = await response.text().catch(() => '');
      if (text) {
        message = text;
      }
    }

    throw new ApiError(message, response.status);
  }

  return response.json() as Promise<T>;
}

export function getErrorMessage(error: unknown, fallback = 'Unable to load data.') {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}
