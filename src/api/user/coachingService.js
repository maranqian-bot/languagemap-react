import axiosInstance from '../axiosInstance';

const COACHING_REQUEST_TIMEOUT_MS = 60000;
const COACHING_REQUEST_CONFIG = {
  timeout: COACHING_REQUEST_TIMEOUT_MS,
};

async function withCoachingRequest(label, requestFactory) {
  try {
    return await requestFactory();
  } catch (error) {
    const method = error.config?.method?.toUpperCase?.() ?? 'UNKNOWN';
    const url = error.config?.url ?? 'unknown-url';

    console.error('[COACHING_API_ERROR]', {
      label,
      method,
      url,
      timeout: error.config?.timeout,
      code: error.code,
      message: error.message,
    });

    throw error;
  }
}

function unwrapCoachingResponse(response, label) {
  console.error('[COACHING_DEBUG]', `${label} raw response`, response);

  const unwrapped = response?.data?.data ?? response?.data ?? response;

  console.error('[COACHING_DEBUG]', `${label} unwrapped data`, unwrapped);

  return unwrapped;
}

export async function getCoachingEntry(sessionId) {
  const response = await withCoachingRequest('get coaching entry', () =>
    axiosInstance.get(`/api/coaching/entry/${sessionId}`, COACHING_REQUEST_CONFIG)
  );
  return response.data;
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

  return response.data;
}

export async function processUserSpeech(coachingSessionId, audioFile) {
  const formData = new FormData();
  formData.append('audioFile', audioFile, audioFile.name ?? 'speech.webm');

  const response = await withCoachingRequest('process user speech', () =>
    axiosInstance.post(
      `/api/coaching/conversation/${coachingSessionId}/speech`,
      formData,
      {
        timeout: COACHING_REQUEST_TIMEOUT_MS,
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    )
  );

  return response.data;
}

export async function finishConversation(coachingSessionId) {
  const response = await withCoachingRequest('finish conversation', () =>
    axiosInstance.post(
      `/api/coaching/conversation/${coachingSessionId}/finish`,
      undefined,
      COACHING_REQUEST_CONFIG
    )
  );

  return response.data;
}

export async function getCoachingMessages(coachingSessionId) {
  const response = await withCoachingRequest('get coaching messages', () =>
    axiosInstance.get(
      `/api/coaching/messages/${coachingSessionId}`,
      COACHING_REQUEST_CONFIG
    )
  );

  return response.data;
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
