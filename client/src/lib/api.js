function getToken() {
  try {
    return window.localStorage.getItem('token');
  } catch {
    return null;
  }
}

function withAuthHeaders(extraHeaders) {
  const token = getToken();
  const headers = { ...(extraHeaders || {}) };
  if (token && !headers.Authorization) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

function toUserFacingErrorMessage(res, json) {
  const status = Number(res?.status || 0);
  const serverError = typeof json?.error === 'string' ? json.error.trim() : '';

  // If we couldn't parse a JSON error payload (e.g. server returned HTML for 404),
  // don't surface status codes to end users.
  if (!serverError) {
    if (status === 401) return 'Please log in again.';
    return 'Something went wrong. Please try again.';
  }

  // Never leak internal/server implementation details to end users.
  // Keep 4xx messages (validation/auth) as-is.
  // For 5xx, only show allow-listed, user-actionable messages.
  const looksInternal = /mongodb|mongoose|econn|timed out|timeout|stack|cast to|validationerror/i.test(serverError);
  const safe5xxAllowList = /failed to fetch leetcode|ai did not return exactly 5 valid mcqs|ai returned invalid json|ai provider error|ai request timed out|rate limited/i;

  if (status >= 500) {
    if (serverError && safe5xxAllowList.test(serverError) && !looksInternal) {
      return serverError;
    }
    if (serverError) {
      // Still keep the real error for dev debugging.
      console.error('API request failed:', { status, serverError });
    }
    return 'Something went wrong. Please try again.';
  }

  if (looksInternal) {
    if (serverError) console.error('API request failed:', { status, serverError });
    return 'Something went wrong. Please try again.';
  }

  return serverError || `Request failed: ${status || 'unknown'}`;
}

const API_CACHE = new Map();

export function clearApiCache(pathOrRegex) {
  if (!pathOrRegex) {
    API_CACHE.clear();
    return;
  }
  if (typeof pathOrRegex === 'string') {
    API_CACHE.delete(pathOrRegex);
    return;
  }
  if (pathOrRegex instanceof RegExp) {
    for (const key of API_CACHE.keys()) {
      if (pathOrRegex.test(key)) API_CACHE.delete(key);
    }
  }
}

export async function apiGet(path, options) {
  const useCache = options?.useCache;

  // 1. Try to serve from cache if requested
  if (useCache && API_CACHE.has(path)) {
    const cached = API_CACHE.get(path);
    return Promise.resolve(cached);
  }

  // 2. Fetch fresh
  const promise = (async () => {
    try {
      const res = await fetch(path, {
        ...(options || {}),
        headers: withAuthHeaders(options?.headers),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(toUserFacingErrorMessage(res, json));
      }
      return json;
    } catch (err) {
      if (useCache) API_CACHE.delete(path);
      throw err;
    }
  })();

  // 3. Keep cache fresh: update it whenever we fetch successfully (whether requested via useCache or not)
  // This ensures that manual refreshes (without useCache) automatically update the stored data for future cached calls.
  API_CACHE.set(path, promise);

  return promise;
}

export async function apiPost(path, body, options) {
  const res = await fetch(path, {
    method: 'POST',
    ...(options || {}),
    headers: withAuthHeaders({ 'content-type': 'application/json', ...(options?.headers || {}) }),
    body: JSON.stringify(body ?? {}),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(toUserFacingErrorMessage(res, json));
  }
  return json;
}

export async function apiPatch(path, body, options) {
  const res = await fetch(path, {
    method: 'PATCH',
    ...(options || {}),
    headers: withAuthHeaders({ 'content-type': 'application/json', ...(options?.headers || {}) }),
    body: JSON.stringify(body ?? {}),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(toUserFacingErrorMessage(res, json));
  }
  return json;
}
