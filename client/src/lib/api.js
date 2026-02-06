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
  // Keep 4xx messages (validation/auth) as-is, but sanitize 5xx (infra/bugs).
  const looksInternal =
    status >= 500 ||
    /mongodb|mongoose|econn|timed out|timeout|stack|cast to|validationerror/i.test(serverError);

  if (looksInternal) {
    if (serverError) {
      // Still keep the real error for dev debugging.
      console.error('API request failed:', { status, serverError });
    }
    return 'Something went wrong. Please try again.';
  }

  return serverError || `Request failed: ${status || 'unknown'}`;
}

export async function apiGet(path, options) {
  const res = await fetch(path, {
    ...(options || {}),
    headers: withAuthHeaders(options?.headers),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(toUserFacingErrorMessage(res, json));
  }
  return json;
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
