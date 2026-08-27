import React, { useState, useEffect, useCallback } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
  CartesianGrid
} from 'recharts';
import api from '../api/client';
import EvidenceModal from './EvidenceModal';

const URGENCY_COLORS = {
  critica: '#ef4444',
  alta: '#f97316',
  media: '#f59e0b',
  baixa: '#10b981',
  nao_definido: '#6b7280',
};

export default function QuarterlyAnalyticsPage({ onOpenMeeting }) {
  const [mode, setMode] = useState('quarter'); // 'quarter' | 'custom'
  const [selectedYear, setSelectedYear] = useState(2026);
  const [selectedQuarter, setSelectedQuarter] = useState(1);
  const [customStartDate, setCustomStartDate] = useState('2026-01-01');
  const [customEndDate, setCustomEndDate] = useState('2026-03-31');

  const [clientFilter, setClientFilter] = useState('');
  const [formatFilter, setFormatFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const [analyticsData, setAnalyticsData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Drilldown Modal
  const [drilldownData, setDrilldownData] = useState(null);
  const [isDrilldownOpen, setIsDrilldownOpen] = useState(false);

  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {
        client_code: clientFilter,
        format: formatFilter,
        status: statusFilter,
      };

      if (mode === 'quarter') {
        params.year = selectedYear;
        params.quarter = selectedQuarter;
      } else {
        params.start_date = customStartDate;
        params.end_date = customEndDate;
      }

      const res = await api.getQuarterAnalytics(params);
      setAnalyticsData(res);
    } catch (err) {
      console.error('Erro ao carregar analytics:', err);
      setError(err.message || 'Falha ao carregar dados analíticos.');
    } finally {
      setLoading(false);
    }
  }, [mode, selectedYear, selectedQuarter, customStartDate, customEndDate, clientFilter, formatFilter, statusFilter]);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  const handleOpenDrilldown = async (metricType, metricKey) => {
    try {
      const params = {
        metric_type: metricType,
        metric_key: metricKey,
        client_code: clientFilter,
        format: formatFilter,
        status: statusFilter,
      };

      if (mode === 'quarter') {
        params.start_date = analyticsData?.period?.start_date;
        params.end_date = analyticsData?.period?.end_date;
      } else {
        params.start_date = customStartDate;
        params.end_date = customEndDate;
      }

      const res = await api.getQuarterDrilldown(params);
      setDrilldownData(res);
      setIsDrilldownOpen(true);
    } catch (err) {
      console.error('Erro ao abrir drilldown:', err);
    }
  };

  // Pie data for urgency
  const urgencyPieData = analyticsData?.urgency_distribution ? [
    { name: 'Crítica', value: analyticsData.urgency_distribution.critica || 0, color: URGENCY_COLORS.critica },
    { name: 'Alta', value: analyticsData.urgency_distribution.alta || 0, color: URGENCY_COLORS.alta },
    { name: 'Média', value: analyticsData.urgency_distribution.media || 0, color: URGENCY_COLORS.media },
    { name: 'Baixa', value: analyticsData.urgency_distribution.baixa || 0, color: URGENCY_COLORS.baixa },
    { name: 'Não Definido', value: analyticsData.urgency_distribution.nao_definido || 0, color: URGENCY_COLORS.nao_definido },
  ].filter(d => d.value > 0) : [];

  return (
    <div style={{ padding: '1.5rem 2rem', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.8rem', color: 'var(--text-main)', margin: '0 0 4px 0' }}>
            Visão Trimestral & Inteligência Gerencial
          </h2>
          <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '14px' }}>
            Panorama executivo de reuniões, dores recorrentes, tarefas e concentração de demandas por cliente.
          </p>
        </div>

        <button
          onClick={loadAnalytics}
          disabled={loading}
          className="btn-primary"
          style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', fontSize: '13px' }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"></path>
          </svg>
          {loading ? 'Atualizando...' : 'Atualizar Dados'}
        </button>
      </div>

      {/* Control Panel: Filters & Period Selection */}
      <div style={{
        background: 'var(--panel-bg)',
        border: '1px solid var(--border-color)',
        borderRadius: '10px',
        padding: '1.25rem',
        marginBottom: '2rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          {/* Mode Switch */}
          <div style={{ display: 'flex', gap: '6px', background: 'var(--bg-main)', padding: '4px', borderRadius: '8px' }}>
            <button
              onClick={() => setMode('quarter')}
              style={{
                padding: '6px 14px',
                borderRadius: '6px',
                border: 'none',
                background: mode === 'quarter' ? 'var(--primary-color)' : 'transparent',
                color: mode === 'quarter' ? '#000' : 'var(--text-muted)',
                fontWeight: 600,
                fontSize: '12px',
                cursor: 'pointer'
              }}
            >
              Trimestres Prontos
            </button>
            <button
              onClick={() => setMode('custom')}
              style={{
                padding: '6px 14px',
                borderRadius: '6px',
                border: 'none',
                background: mode === 'custom' ? 'var(--primary-color)' : 'transparent',
                color: mode === 'custom' ? '#000' : 'var(--text-muted)',
                fontWeight: 600,
                fontSize: '12px',
                cursor: 'pointer'
              }}
            >
              Intervalo Personalizado
            </button>
          </div>

          {/* Quarter Selectors */}
          {mode === 'quarter' ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                style={{
                  padding: '6px 10px',
                  borderRadius: '6px',
                  background: 'var(--bg-main)',
                  color: 'var(--text-main)',
                  border: '1px solid var(--border-color)',
                  fontSize: '13px',
                  outline: 'none',
                  cursor: 'pointer'
                }}
              >
                <option value={2026}>2026</option>
                <option value={2025}>2025</option>
                <option value={2024}>2024</option>
              </select>

              <div style={{ display: 'flex', gap: '4px' }}>
                {[
                  { q: 1, label: '1º Tri (Jan-Mar)' },
                  { q: 2, label: '2º Tri (Abr-Jun)' },
                  { q: 3, label: '3º Tri (Jul-Set)' },
                  { q: 4, label: '4º Tri (Out-Dez)' },
                ].map((item) => (
                  <button
                    key={item.q}
                    onClick={() => setSelectedQuarter(item.q)}
                    style={{
                      padding: '6px 12px',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: selectedQuarter === item.q ? 600 : 400,
                      background: selectedQuarter === item.q ? 'rgba(0, 210, 255, 0.15)' : 'var(--bg-main)',
                      border: `1px solid ${selectedQuarter === item.q ? 'var(--primary-color)' : 'var(--border-color)'}`,
                      color: selectedQuarter === item.q ? 'var(--primary-color)' : 'var(--text-main)',
                      cursor: 'pointer'
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>De:</label>
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                style={{
                  padding: '5px 8px',
                  borderRadius: '6px',
                  background: 'var(--bg-main)',
                  color: 'var(--text-main)',
                  border: '1px solid var(--border-color)',
                  fontSize: '12px',
                  outline: 'none'
                }}
              />
              <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Até:</label>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                style={{
                  padding: '5px 8px',
                  borderRadius: '6px',
                  background: 'var(--bg-main)',
                  color: 'var(--text-main)',
                  border: '1px solid var(--border-color)',
                  fontSize: '12px',
                  outline: 'none'
                }}
              />
            </div>
          )}
        </div>

        {/* Secondary Filters */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', paddingTop: '10px', borderTop: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Cliente:</span>
            <input
              type="text"
              placeholder="Ex: T27261 ou Geral"
              value={clientFilter}
              onChange={(e) => setClientFilter(e.target.value)}
              style={{
                padding: '5px 8px',
                borderRadius: '6px',
                background: 'var(--bg-main)',
                color: 'var(--text-main)',
                border: '1px solid var(--border-color)',
                fontSize: '12px',
                outline: 'none',
                width: '130px'
              }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Formato:</span>
            <select
              value={formatFilter}
              onChange={(e) => setFormatFilter(e.target.value)}
              style={{
                padding: '5px 8px',
                borderRadius: '6px',
                background: 'var(--bg-main)',
                color: 'var(--text-main)',
                border: '1px solid var(--border-color)',
                fontSize: '12px',
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value="">Todos</option>
              <option value="VIDEO">Vídeo</option>
              <option value="PRESENCIAL">Presencial</option>
              <option value="VOZ">Voz</option>
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{
                padding: '5px 8px',
                borderRadius: '6px',
                background: 'var(--bg-main)',
                color: 'var(--text-main)',
                border: '1px solid var(--border-color)',
                fontSize: '12px',
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value="">Todos</option>
              <option value="COMPLETED">Concluída</option>
              <option value="CANCELLED">Cancelada</option>
            </select>
          </div>

          <div style={{ marginLeft: 'auto', fontSize: '12px', color: 'var(--primary-color)', fontWeight: 500 }}>
            {analyticsData?.period?.label}
          </div>
        </div>
      </div>

      {error && (
        <div style={{
          padding: '1rem',
          background: 'rgba(239, 68, 68, 0.15)',
          border: '1px solid var(--danger)',
          borderRadius: '8px',
          color: 'var(--danger)',
          marginBottom: '1.5rem',
          fontSize: '14px'
        }}>
          ⚠️ {error}
        </div>
      )}

      {loading ? (
        <div style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-muted)' }}>
          <div style={{
            width: '36px',
            height: '36px',
            border: '4px solid var(--border-color)',
            borderTopColor: 'var(--primary-color)',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '0 auto 1rem auto'
          }}></div>
          Calculando métricas trimestrais e agregações canônicas...
        </div>
      ) : analyticsData ? (
        <>
          {/* KPI Cards */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '1rem',
            marginBottom: '2rem'
          }}>
            <div style={{ background: 'var(--panel-bg)', padding: '1.25rem', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '6px' }}>Total de Reuniões</div>
              <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--text-main)' }}>{analyticsData.meetings.total}</div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>no período filtrado</div>
            </div>

            <div
              style={{ background: 'var(--panel-bg)', padding: '1.25rem', borderRadius: '10px', border: '1px solid var(--border-color)', cursor: 'pointer' }}
              onClick={() => handleOpenDrilldown('unanalyzed', 'Sem Análise')}
              title="Clique para ver reuniões sem análise"
            >
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '6px' }}>Reuniões Analisadas</div>
              <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--primary-color)' }}>
                {analyticsData.meetings.analyzed}
                <span style={{ fontSize: '13px', fontWeight: 'normal', color: 'var(--text-muted)', marginLeft: '6px' }}>
                  / {analyticsData.meetings.total}
                </span>
              </div>
              <div style={{ fontSize: '11px', color: analyticsData.meetings.unanalyzed > 0 ? 'var(--warning)' : 'var(--success)', marginTop: '4px' }}>
                {analyticsData.meetings.unanalyzed > 0 ? `⚠️ ${analyticsData.meetings.unanalyzed} sem análise de IA` : '✓ 100% analisadas'}
              </div>
            </div>

            <div
              style={{ background: 'var(--panel-bg)', padding: '1.25rem', borderRadius: '10px', border: '1px solid var(--border-color)', cursor: 'pointer' }}
              onClick={() => handleOpenDrilldown('open_actions', 'Ações Abertas')}
            >
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '6px' }}>Ações em Aberto</div>
              <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--warning)' }}>{analyticsData.open_actions}</div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>de {analyticsData.total_actions} tarefas mapeadas</div>
            </div>

            <div
              style={{ background: 'var(--panel-bg)', padding: '1.25rem', borderRadius: '10px', border: '1px solid var(--border-color)', cursor: 'pointer' }}
              onClick={() => handleOpenDrilldown('overdue_actions', 'Ações Vencidas')}
            >
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '6px' }}>Ações Vencidas</div>
              <div style={{ fontSize: '2rem', fontWeight: 'bold', color: analyticsData.overdue_actions > 0 ? 'var(--danger)' : 'var(--success)' }}>
                {analyticsData.overdue_actions}
              </div>
              <div style={{ fontSize: '11px', color: analyticsData.overdue_actions > 0 ? 'var(--danger)' : 'var(--text-muted)', marginTop: '4px' }}>
                {analyticsData.overdue_actions > 0 ? '🚨 Exige atenção imediata' : 'Nenhuma tarefa atrasada'}
              </div>
            </div>

            <div style={{ background: 'var(--panel-bg)', padding: '1.25rem', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '6px' }}>NPS Médio</div>
              <div style={{ fontSize: '2rem', fontWeight: 'bold', color: (analyticsData.nps_stats?.media || 0) >= 8 ? 'var(--success)' : 'var(--warning)' }}>
                {analyticsData.nps_stats?.media ? analyticsData.nps_stats.media : '-'}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                Zona: <strong>{analyticsData.nps_stats?.nps_zone || 'Geral'}</strong> ({analyticsData.nps_stats?.total_avaliacoes || 0} avaliações)
              </div>
            </div>
          </div>

          {/* Main Grid: Top Topics and Recurring Pains */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
            {/* Temas Mais Discutidos */}
            <div style={{ background: 'var(--panel-bg)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.2rem' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-main)' }}>Temas Mais Discutidos</h3>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Contagem única por reunião (% sobre o total)</span>
                </div>
                <span style={{ fontSize: '11px', color: 'var(--primary-color)', fontWeight: 600 }}>Ranking Trimestral</span>
              </div>

              {analyticsData.top_topics && analyticsData.top_topics.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {analyticsData.top_topics.slice(0, 7).map((topic, idx) => (
                    <div
                      key={topic.key}
                      style={{
                        background: 'var(--bg-main)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '8px',
                        padding: '10px 12px',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                      onClick={() => handleOpenDrilldown('topic', topic.key)}
                      title="Clique para ver evidências e reuniões deste tema"
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ width: '18px', height: '18px', borderRadius: '50%', background: 'rgba(0, 210, 255, 0.2)', color: 'var(--primary-color)', fontSize: '11px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>
                            {idx + 1}
                          </span>
                          <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-main)' }}>
                            {topic.label}
                          </span>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <span style={{ fontSize: '13px', fontWeight: 'bold', color: 'var(--primary-color)' }}>
                            {topic.percentual_reunioes}%
                          </span>
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: '6px' }}>
                            ({topic.reunioes_com_tema} reuniões)
                          </span>
                        </div>
                      </div>

                      <div style={{ height: '6px', background: 'var(--panel-bg)', borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${Math.min(100, topic.percentual_reunioes)}%`, background: 'var(--primary-color)', borderRadius: '3px' }}></div>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px' }}>
                        <span>Ocorrências totais: {topic.ocorrencias}</span>
                        <span style={{ color: 'var(--primary-color)' }}>Ver evidências →</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ color: 'var(--text-muted)', textAlign: 'center', margin: '2rem 0' }}>Nenhum tema mapeado nas reuniões analisadas.</p>
              )}
            </div>

            {/* Dores Recorrentes */}
            <div style={{ background: 'var(--panel-bg)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.2rem' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-main)' }}>Dores & Alertas Recorrentes</h3>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Gargalos mapeados pela IA por categoria canônica</span>
                </div>
                <span style={{ fontSize: '11px', color: 'var(--danger)', fontWeight: 600 }}>Severidade & Volume</span>
              </div>

              {analyticsData.recurring_pains && analyticsData.recurring_pains.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {analyticsData.recurring_pains.slice(0, 7).map((pain) => (
                    <div
                      key={pain.categoria}
                      style={{
                        background: 'var(--bg-main)',
                        border: `1px solid ${pain.cor}44`,
                        borderLeft: `4px solid ${pain.cor}`,
                        borderRadius: '8px',
                        padding: '10px 12px',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                      onClick={() => handleOpenDrilldown('pain', pain.categoria)}
                      title="Clique para ver evidências e reuniões desta dor"
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-main)' }}>
                            {pain.label}
                          </span>
                          <span style={{
                            fontSize: '10px',
                            background: 'rgba(255,255,255,0.06)',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            color: 'var(--text-muted)',
                            textTransform: 'uppercase'
                          }}>
                            {pain.sistema_totvs}
                          </span>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <span style={{ fontSize: '13px', fontWeight: 'bold', color: pain.cor }}>
                            {pain.percentual_reunioes}%
                          </span>
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: '6px' }}>
                            ({pain.reunioes_afetadas} reuniões)
                          </span>
                        </div>
                      </div>

                      <div style={{ height: '6px', background: 'var(--panel-bg)', borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${Math.min(100, pain.percentual_reunioes)}%`, background: pain.cor, borderRadius: '3px' }}></div>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px' }}>
                        <span>Total de ocorrências: {pain.total_ocorrencias}</span>
                        <span style={{ color: pain.cor }}>Ver evidências →</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ color: 'var(--text-muted)', textAlign: 'center', margin: '2rem 0' }}>Nenhuma dor recorrente detectada no período.</p>
              )}
            </div>
          </div>

          {/* Charts Row: Time Series and Urgency Distribution */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
            {/* Evolução Temporal */}
            <div style={{ background: 'var(--panel-bg)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '1.5rem' }}>
              <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.1rem', color: 'var(--text-main)' }}>
                Evolução Temporal no Período
              </h3>
              {analyticsData.time_series && analyticsData.time_series.length > 0 ? (
                <div style={{ height: '240px', width: '100%' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={analyticsData.time_series}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                      <XAxis dataKey="label" stroke="var(--text-muted)" fontSize={11} />
                      <YAxis stroke="var(--text-muted)" fontSize={11} />
                      <Tooltip
                        contentStyle={{ background: 'var(--panel-bg)', borderColor: 'var(--border-color)', color: 'var(--text-main)', borderRadius: '8px' }}
                      />
                      <Legend wrapperStyle={{ fontSize: '12px' }} />
                      <Bar dataKey="total_reunioes" name="Reuniões" fill="var(--primary-color)" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="total_dores" name="Dores Mapeadas" fill="#ef4444" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="total_tarefas" name="Tarefas" fill="#10b981" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p style={{ color: 'var(--text-muted)', textAlign: 'center', margin: '3rem 0' }}>Sem dados suficientes para série temporal.</p>
              )}
            </div>

            {/* Distribuição de Urgência */}
            <div style={{ background: 'var(--panel-bg)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '1.5rem' }}>
              <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.1rem', color: 'var(--text-main)' }}>
                Distribuição de Urgência
              </h3>
              {urgencyPieData.length > 0 ? (
                <div style={{ display: 'flex', alignItems: 'center', height: '240px' }}>
                  <div style={{ flex: 1, height: '100%' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={urgencyPieData}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          innerRadius={55}
                          outerRadius={85}
                          stroke="none"
                        >
                          {urgencyPieData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{ background: 'var(--panel-bg)', borderColor: 'var(--border-color)', color: 'var(--text-main)', borderRadius: '8px' }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div style={{ width: '150px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {urgencyPieData.map((entry) => (
                      <div
                        key={entry.name}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12px', cursor: 'pointer' }}
                        onClick={() => handleOpenDrilldown('urgency', entry.name)}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: entry.color }}></span>
                          <span style={{ color: 'var(--text-main)' }}>{entry.name}</span>
                        </div>
                        <span style={{ fontWeight: 'bold', color: entry.color }}>{entry.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p style={{ color: 'var(--text-muted)', textAlign: 'center', margin: '3rem 0' }}>Sem dados de urgência disponíveis.</p>
              )}
            </div>
          </div>

          {/* Clientes em Risco & Qualidade de Dados */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
            {/* Clientes com Maior Concentração de Problemas */}
            <div style={{ background: 'var(--panel-bg)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.2rem' }}>
                <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-main)' }}>Clientes com Maior Atenção</h3>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Concentração de dores e ações pendentes</span>
              </div>

              {analyticsData.clients_at_risk && analyticsData.clients_at_risk.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {analyticsData.clients_at_risk.slice(0, 6).map((client) => (
                    <div
                      key={client.codigo_cliente}
                      style={{
                        background: 'var(--bg-main)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '8px',
                        padding: '10px 12px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        cursor: 'pointer'
                      }}
                      onClick={() => handleOpenDrilldown('client', client.codigo_cliente)}
                      title="Ver reuniões deste cliente"
                    >
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                          <span style={{ fontWeight: 'bold', color: 'var(--primary-color)', fontSize: '13px' }}>
                            {client.codigo_cliente}
                          </span>
                          <span style={{
                            fontSize: '10px',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            background: client.urgencia_maxima === 'Crítica' || client.urgencia_maxima === 'Alta' ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)',
                            color: client.urgencia_maxima === 'Crítica' || client.urgencia_maxima === 'Alta' ? 'var(--danger)' : 'var(--warning)',
                            fontWeight: 600
                          }}>
                            {client.urgencia_maxima}
                          </span>
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          {client.dores_principais && client.dores_principais.length > 0 ? (
                            <span>Dores: {client.dores_principais.join(', ')}</span>
                          ) : (
                            <span>{client.total_reunioes} reunião(ões) registradas</span>
                          )}
                        </div>
                      </div>

                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#ef4444' }}>
                          {client.total_dores} dores
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          {client.acoes_pendentes} ações abertas
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ color: 'var(--text-muted)', textAlign: 'center', margin: '2rem 0' }}>Nenhum cliente em situação de risco identificada.</p>
              )}
            </div>

            {/* Qualidade de Dados & Observabilidade */}
            <div style={{ background: 'var(--panel-bg)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.2rem' }}>
                <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-main)' }}>Qualidade de Dados & Saúde do Sistema</h3>
                <span style={{
                  fontSize: '12px',
                  fontWeight: 'bold',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  background: (analyticsData.data_quality?.score_qualidade || 0) >= 80 ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)',
                  color: (analyticsData.data_quality?.score_qualidade || 0) >= 80 ? 'var(--success)' : 'var(--warning)',
                }}>
                  Score: {analyticsData.data_quality?.score_qualidade}%
                </span>
              </div>

              {analyticsData.data_quality && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
                  <div style={{ background: 'var(--bg-main)', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Sem Transcrição</div>
                    <div style={{ fontSize: '1.3rem', fontWeight: 'bold', color: analyticsData.data_quality.reunioes_sem_transcricao > 0 ? 'var(--danger)' : 'var(--success)' }}>
                      {analyticsData.data_quality.reunioes_sem_transcricao}
                    </div>
                  </div>

                  <div style={{ background: 'var(--bg-main)', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Sem Análise IA</div>
                    <div style={{ fontSize: '1.3rem', fontWeight: 'bold', color: analyticsData.data_quality.reunioes_sem_analise > 0 ? 'var(--warning)' : 'var(--success)' }}>
                      {analyticsData.data_quality.reunioes_sem_analise}
                    </div>
                  </div>

                  <div style={{ background: 'var(--bg-main)', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Sem Cliente Identificado</div>
                    <div style={{ fontSize: '1.3rem', fontWeight: 'bold', color: 'var(--text-main)' }}>
                      {analyticsData.data_quality.reunioes_sem_cliente}
                    </div>
                  </div>

                  <div style={{ background: 'var(--bg-main)', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Datas Inválidas</div>
                    <div style={{ fontSize: '1.3rem', fontWeight: 'bold', color: analyticsData.data_quality.datas_invalidas > 0 ? 'var(--danger)' : 'var(--success)' }}>
                      {analyticsData.data_quality.datas_invalidas}
                    </div>
                  </div>

                  <div style={{ background: 'var(--bg-main)', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Análises Antigas</div>
                    <div style={{ fontSize: '1.3rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>
                      {analyticsData.data_quality.analises_antigas}
                    </div>
                  </div>

                  <div style={{ background: 'var(--bg-main)', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Falhas no Ollama</div>
                    <div style={{ fontSize: '1.3rem', fontWeight: 'bold', color: analyticsData.data_quality.falhas_ia > 0 ? 'var(--danger)' : 'var(--success)' }}>
                      {analyticsData.data_quality.falhas_ia}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      ) : null}

      {/* Drilldown Modal */}
      <EvidenceModal
        isOpen={isDrilldownOpen}
        onClose={() => setIsDrilldownOpen(false)}
        drilldownData={drilldownData}
        onOpenMeeting={onOpenMeeting}
      />
    </div>
  );
}
