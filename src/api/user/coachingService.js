import axiosInstance from '../axiosInstance';

const COACHING_REQUEST_TIMEOUT_MS = 60000;
const COACHING_REQUEST_CONFIG = {
  timeout: COACHING_REQUEST_TIMEOUT_MS,
  rawResponse: true,
};

function resolveRequestUrl(config = {}) {
  const url = config.url ?? '';
  const baseURL = config.baseURL ?? '';

  if (!url) return baseURL || 'unknown-url';
  if (/^https?:\/\//i.test(url)) return url;
  if (!baseURL) return url;

  return `${baseURL.replace(/\/$/, '')}/${url.replace(/^\//, '')}`;
}

function getResponseHeader(response, name) {
  const normalizedName = name.toLowerCase();
  const headers = response?.headers ?? {};

  return headers[name] ?? headers[normalizedName] ?? '';
}

function getResponseBody(response) {
  if (response && typeof response === 'object' && 'status' in response && 'data' in response) {
    return response.data;
  }

  return response;
}

function getResponseSummary(label, response) {
  return {
    label,
    method: response?.config?.method?.toUpperCase?.() ?? 'UNKNOWN',
    url: response?.config?.url ?? 'unknown-url',
    finalUrl: resolveRequestUrl(response?.config),
    status: response?.status,
    contentType: getResponseHeader(response, 'content-type') || 'unknown',
  };
}

function isHtmlResponse(response) {
  const contentType = getResponseHeader(response, 'content-type').toLowerCase();
  const body = getResponseBody(response);

  return contentType.includes('text/html') ||
    (typeof body === 'string' && /<!doctype html|<html[\s>]/i.test(body.slice(0, 200)));
}

function assertJsonApiResponse(response, label) {
  const summary = getResponseSummary(label, response);

  console.error('[COACHING_HTTP]', summary);

  if (!isHtmlResponse(response)) {
    return;
  }

  const body = getResponseBody(response);

  console.error('[COACHING_API_ROUTING_ERROR]', {
    ...summary,
    bodyPreview: typeof body === 'string' ? body.slice(0, 160) : '',
  });

  throw new Error(
    `코칭 API 요청이 JSON이 아닌 HTML을 반환했습니다. API 경로를 확인해주세요. (${summary.finalUrl})`
  );
}

async function withCoachingRequest(label, requestFactory) {
  try {
    const response = await requestFactory();

    return response;
  } catch (error) {
    const method = error.config?.method?.toUpperCase?.() ?? 'UNKNOWN';
    const url = error.config?.url ?? 'unknown-url';

    console.error('[COACHING_API_ERROR]', {
      label,
      method,
      url,
      finalUrl: resolveRequestUrl(error.config),
      status: error.response?.status,
      contentType: getResponseHeader(error.response, 'content-type') || 'unknown',
      timeout: error.config?.timeout,
      code: error.code,
      message: error.message,
    });

    throw error;
  }
}

function unwrapCoachingResponse(response, label) {
  console.error('[COACHING_DEBUG]', `${label} raw response`, response);
  assertJsonApiResponse(response, label);

  const body = getResponseBody(response);
  const envelope = body && typeof body === 'object' ? body : null;

  if (envelope?.success === false) {
    throw new Error(envelope.message || '코칭 요청 처리 중 오류가 발생했습니다.');
  }

  const unwrapped = envelope?.data ?? body;

  console.error('[COACHING_DEBUG]', `${label} unwrapped data`, unwrapped);

  return unwrapped;
}

export async function getCoachingEntry(sessionId) {
  const response = await withCoachingRequest('get coaching entry', () =>
    axiosInstance.get(`/api/coaching/entry/${sessionId}`, COACHING_REQUEST_CONFIG)
  );
  return unwrapCoachingResponse(response, 'get coaching entry');
}

export async function startCoachingFlow({ sessionId, optionType }) {
  const response = await withCoachingRequest('start flow', () =>
    axiosInstance.post('/api/coaching/flow/start', {
      sessionId,
      optionType,
    }, COACHING_REQUEST_CONFIG)
  );

  return unwrapCoachingResponse(response, 'start flow');
}

export async function prepareCoachingScript({
  sessionId,
  optionType,
  placeName,
  country,
  city,
  placeAddress,
  evaluation,
  previousMessages,
}) {
  const response = await withCoachingRequest('prepare script', () =>
    axiosInstance.post('/api/coaching/conversation/script', {
      sessionId,
      optionType,
      placeName,
      country,
      city,
      placeAddress,
      evaluation,
      previousMessages,
    }, COACHING_REQUEST_CONFIG)
  );

  return unwrapCoachingResponse(response, 'prepare script');
}

export async function startConversation(coachingSessionId) {
  const response = await withCoachingRequest('start conversation', () =>
    axiosInstance.post(
      `/api/coaching/conversation/${coachingSessionId}/start`,
      undefined,
      COACHING_REQUEST_CONFIG
    )
  );

  return unwrapCoachingResponse(response, 'start conversation');
}

export async function processUserSpeech(coachingSessionId, audioFile) {
  const formData = new FormData();
  formData.append('audioFile', audioFile, audioFile.name ?? 'speech.webm');
  const speechUrl = `/api/coaching/conversation/${coachingSessionId}/speech`;
  const finalSpeechUrl = speechUrl;
  const isFile = typeof File !== 'undefined' && audioFile instanceof File;
  const isBlob = typeof Blob !== 'undefined' && audioFile instanceof Blob;

  console.error('[COACHING_HTTP_REQUEST]', {
    label: 'process user speech',
    method: 'POST',
    url: speechUrl,
    finalUrl: finalSpeechUrl,
    fileName: audioFile.name,
    fileType: audioFile.type,
    fileSize: audioFile.size,
    timeout: COACHING_REQUEST_TIMEOUT_MS,
    isFile,
    isBlob,
    credentialsIncluded: false,
    authorizationIncluded: false,
    formDataEntries: Array.from(formData.entries()).map(([key, value]) => ({
      key,
      valueType: value?.constructor?.name ?? typeof value,
      valueName: typeof value?.name === 'string' ? value.name : undefined,
      valueSize: typeof value?.size === 'number' ? value.size : undefined,
      valueMimeType: typeof value?.type === 'string' ? value.type : undefined,
    })),
  });

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), COACHING_REQUEST_TIMEOUT_MS);
  let response;
  let responseText;

  try {
    response = await fetch(finalSpeechUrl, {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    });

    responseText = await response.text();
  } catch (error) {
    console.error('[COACHING_API_ERROR]', {
      label: 'process user speech',
      method: 'POST',
      url: speechUrl,
      finalUrl: finalSpeechUrl,
      timeout: COACHING_REQUEST_TIMEOUT_MS,
      message: error.message,
      name: error.name,
    });
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }

  const contentType = response.headers.get('content-type') ?? '';

  console.error('[COACHING_HTTP_RESPONSE]', {
    label: 'process user speech',
    method: 'POST',
    url: speechUrl,
    responseUrl: response.url,
    status: response.status,
    contentType,
    bodyPreview: responseText.slice(0, 200),
  });

  if (contentType.toLowerCase().includes('text/html') || /<!doctype html|<html[\s>]/i.test(responseText.slice(0, 200))) {
    throw new Error(`코칭 API 요청이 JSON이 아닌 HTML을 반환했습니다. API 경로를 확인해주세요. (${response.url})`);
  }

  let parsedBody;

  try {
    parsedBody = responseText ? JSON.parse(responseText) : {};
  } catch (error) {
    console.error('[COACHING_API_PARSE_ERROR]', {
      label: 'process user speech',
      responseUrl: response.url,
      status: response.status,
      contentType,
      bodyPreview: responseText.slice(0, 200),
      message: error.message,
    });
    throw new Error('코칭 API 응답을 해석하지 못했습니다.');
  }

  if (!response.ok) {
    throw new Error(parsedBody?.message || '코칭 요청 처리 중 오류가 발생했습니다.');
  }

  if (parsedBody?.success === false) {
    throw new Error(parsedBody.message || '코칭 요청 처리 중 오류가 발생했습니다.');
  }

  console.error('[COACHING_DEBUG]', 'process user speech raw response', parsedBody);

  return parsedBody?.data ?? parsedBody ?? {};
}

export async function finishConversation(coachingSessionId) {
  const response = await withCoachingRequest('finish conversation', () =>
    axiosInstance.post(
      `/api/coaching/conversation/${coachingSessionId}/finish`,
      undefined,
      COACHING_REQUEST_CONFIG
    )
  );

  return unwrapCoachingResponse(response, 'finish conversation');
}

export async function getCoachingMessages(coachingSessionId) {
  const response = await withCoachingRequest('get coaching messages', () =>
    axiosInstance.get(
      `/api/coaching/messages/${coachingSessionId}`,
      COACHING_REQUEST_CONFIG
    )
  );

  return unwrapCoachingResponse(response, 'get coaching messages');
}

export const coachingService = {
  getCoachingEntry,
  startCoachingFlow,
  prepareCoachingScript,
  startConversation,
  processUserSpeech,
  finishConversation,
  getCoachingMessages,
};
