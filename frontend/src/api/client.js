/**
 * Cliente HTTP centralizado para a API do Proton Flow.
 */

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

async function request(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`;
  const defaultHeaders = {};

  if (!(options.body instanceof FormData)) {
    defaultHeaders['Content-Type'] = 'application/json';
  }

  const config = {
    ...options,
    headers: {
      ...defaultHeaders,
      ...options.headers,
    },
  };

  try {
    const response = await fetch(url, config);
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || `Erro na requisição: ${response.status} ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    console.error(`Erro na chamada API (${endpoint}):`, error);
    throw error;
  }
}

export const api = {
  // Meetings
  getMeetings: (params = {}) => {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, val]) => {
      if (val !== undefined && val !== null && val !== '') {
        searchParams.append(key, val);
      }
    });
    const qs = searchParams.toString();
    return request(`/api/meetings${qs ? `?${qs}` : ''}`);
  },

  getMeeting: (meetingId) => request(`/api/meetings/${meetingId}`),

  getHistory: () => request('/api/history'),

  saveMeeting: (transcript, meetingId = null, segmento = 'Ao Vivo') =>
    request('/api/save_meeting', {
      method: 'POST',
      body: JSON.stringify({ transcript, meeting_id: meetingId, segmento }),
    }),

  updateMetadata: (meetingId, fields) =>
    request(`/api/meetings/${meetingId}/metadata`, {
      method: 'PATCH',
      body: JSON.stringify(fields),
    }),

  updateUrgency: (meetingId, urgencyLevel) =>
    request('/api/urgency', {
      method: 'POST',
      body: JSON.stringify({ meeting_id: String(meetingId), urgency_level: urgencyLevel }),
    }),

  updateResponsible: (meetingId, responsible) =>
    request('/api/responsible', {
      method: 'POST',
      body: JSON.stringify({ meeting_id: String(meetingId), responsible }),
    }),

  updateTaskStatus: (meetingId, taskIndex, status) =>
    request('/api/tasks/status', {
      method: 'POST',
      body: JSON.stringify({ meeting_id: String(meetingId), task_index: taskIndex, status }),
    }),

  uploadPdf: (formData) =>
    request('/api/upload_pdf', {
      method: 'POST',
      body: formData,
    }),

  // AI & Suggestions
  analyzeText: (text, meetingId = null) =>
    request('/api/analyze', {
      method: 'POST',
      body: JSON.stringify({ text, meeting_id: meetingId }),
    }),

  analyzeExistingMeeting: (meetingId) =>
    request(`/api/meetings/${meetingId}/analyze`, {
      method: 'POST',
    }),

  resetAllAnalyses: () =>
    request('/api/meetings/reset_analyses', {
      method: 'POST',
    }),

  getSuggestions: (meetingId) => request(`/api/meetings/${meetingId}/suggestions`),

  confirmSuggestion: (meetingId, fieldName, action, value = null) =>
    request(`/api/meetings/${meetingId}/suggestions/${fieldName}/confirm`, {
      method: 'POST',
      body: JSON.stringify({ action, value }),
    }),

  getRecommendations: (meetingId) => request(`/api/meetings/${meetingId}/recommendations`),

  confirmRecommendation: (meetingId, productKey, action) =>
    request(`/api/meetings/${meetingId}/recommendations/${productKey}/confirm`, {
      method: 'POST',
      body: JSON.stringify({ action }),
    }),

  getRecurringTasks: () => request('/api/tasks/recurring'),

  getPerfilCliente: (codigo) => request(`/api/perfil_cliente/${encodeURIComponent(codigo)}`),

  // Ata Executiva Dedicada (Executive Minutes)
  getMeetingExecutiveSummary: (meetingId) =>
    request(`/api/meetings/${meetingId}/executive-summary`),

  generateMeetingExecutiveSummary: (meetingId, forceRegenerate = false, useLlm = false) =>
    request(`/api/meetings/${meetingId}/executive-summary/generate`, {
      method: 'POST',
      body: JSON.stringify({
        meeting_id: String(meetingId),
        force_regenerate: forceRegenerate,
        use_llm: useLlm,
      }),
    }),

  updateMeetingExecutiveStatus: (meetingId, status) =>
    request(`/api/meetings/${meetingId}/executive-summary/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),

  // Analytics, Comparisons & Timelines
  getQuarterAnalytics: (params = {}) => {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, val]) => {
      if (val !== undefined && val !== null && val !== '') {
        searchParams.append(key, val);
      }
    });
    const qs = searchParams.toString();
    return request(`/api/analytics/quarter${qs ? `?${qs}` : ''}`);
  },

  getQuarterDrilldown: (params = {}) => {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, val]) => {
      if (val !== undefined && val !== null && val !== '') {
        searchParams.append(key, val);
      }
    });
    const qs = searchParams.toString();
    return request(`/api/analytics/quarter/meetings${qs ? `?${qs}` : ''}`);
  },

  comparePeriods: (params = {}) => {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, val]) => {
      if (val !== undefined && val !== null && val !== '') {
        searchParams.append(key, val);
      }
    });
    const qs = searchParams.toString();
    return request(`/api/analytics/compare${qs ? `?${qs}` : ''}`);
  },

  getPainsLifecycle: () => request('/api/analytics/pains/lifecycle'),

  getClientTimeline: (clientCode) => request(`/api/clients/${encodeURIComponent(clientCode)}/timeline`),

  generateExecutiveSummary: (startDate, endDate, clientCode = null) =>
    request('/api/analytics/executive-summary', {
      method: 'POST',
      body: JSON.stringify({ start_date: startDate, end_date: endDate, client_code: clientCode }),
    }),

  syncSqlite: () =>
    request('/api/sqlite/sync', {
      method: 'POST',
    }),

  // TOTVS Integrations
  getSistemasTotvs: () => request('/api/integracoes/sistemas'),

  saveIntegracaoConfig: (sistema, webhookUrl) =>
    request('/api/integracoes/config', {
      method: 'POST',
      body: JSON.stringify({ sistema, webhook_url: webhookUrl }),
    }),

  deleteIntegracaoConfig: (sistema) =>
    request(`/api/integracoes/config/${encodeURIComponent(sistema)}`, {
      method: 'DELETE',
    }),

  enviarIntegracao: (meetingId, sistema, tarefas, modoSimulado = false, recommendationId = null) =>
    request('/api/integracoes/enviar', {
      method: 'POST',
      body: JSON.stringify({ meeting_id: String(meetingId), sistema, tarefas, modo_simulado: modoSimulado, recommendation_id: recommendationId }),
    }),

  getHistoricoIntegracoes: () => request('/api/integracoes/historico'),

  getAuditLog: (meetingId = null) =>
    request(`/api/audit${meetingId ? `?meeting_id=${meetingId}` : ''}`),
};

export default api;
