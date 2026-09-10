import React, { useState, useEffect, useCallback } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid
} from 'recharts';
import api from '../api/client';
import EvidenceModal from './EvidenceModal';
import { BarChart3, Activity, Scale, RefreshCw, Filter, ChevronDown, ChevronUp, Search, User, Sliders, ArrowRightLeft, Check, X, AlertTriangle, AlertCircle, Calendar, Info, Layers } from 'lucide-react';

export default function QuarterlyAnalyticsPage({ onOpenMeeting }) {
  // Navigation Tabs
  const [activeTab, setActiveTab] = useState('visao_geral'); // 'visao_geral' | 'comparacao' | 'ciclo_vida_dores'
  const [overviewView, setOverviewView] = useState('indicadores'); // 'indicadores' | 'clientes' | 'segmentos'

  // Filter States
  const [mode] = useState('preset'); // 'preset' | 'custom'
  const [selectedYear, setSelectedYear] = useState(2026);
  const [selectedPeriod, setSelectedPeriod] = useState('year'); // 'year' | 'sem1' | 'sem2' | 'q1' | 'q2' | 'q3' | 'q4'
  const [customStartDate] = useState('2026-01-01');
  const [customEndDate] = useState('2026-12-31');

  const [clientFilter, setClientFilter] = useState('');
  const [formatFilter] = useState('');
  const [statusFilter] = useState('');

  const [analyticsData, setAnalyticsData] = useState(null);
  const [_loading, setLoading] = useState(false);
  const [_error, setError] = useState(null);

  // Alertas e Qualidade de Dados
  const [showAllAlerts, setShowAllAlerts] = useState(false);
  const [isDataQualityModalOpen, setIsDataQualityModalOpen] = useState(false);

  // Period Comparison State
  const [compareData, setCompareData] = useState(null);
  const [compareLoading, setCompareLoading] = useState(false);
  const [baseQ, setBaseQ] = useState('2026-01-01:2026-03-31');
  const [compQ, setCompQ] = useState('2025-10-01:2025-12-31');

  // Pains Lifecycle State
  const [lifecycleData, setLifecycleData] = useState(null);
  const [lifecycleLoading, setLifecycleLoading] = useState(false);

  // Client Timeline Modal
  const [selectedClientTimeline, setSelectedClientTimeline] = useState(null);
  const [_timelineLoading, setTimelineLoading] = useState(false);

  // Executive Summary State
  const [executiveSummary, setExecutiveSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [isSummaryModalOpen, setIsSummaryModalOpen] = useState(false);

  // Drilldown Modal
  const [drilldownData, setDrilldownData] = useState(null);
  const [isDrilldownOpen, setIsDrilldownOpen] = useState(false);

  // Load Main Analytics
  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {
        client_code: clientFilter,
        format: formatFilter,
        status: statusFilter,
      };

      if (mode === 'preset') {
        params.year = selectedYear;
        if (selectedPeriod === 'year') {
          params.period_type = 'year';
        } else if (selectedPeriod === 'sem1') {
          params.period_type = 'semester';
          params.period_num = 1;
        } else if (selectedPeriod === 'sem2') {
          params.period_type = 'semester';
          params.period_num = 2;
        } else if (selectedPeriod === 'q1') {
          params.quarter = 1;
        } else if (selectedPeriod === 'q2') {
          params.quarter = 2;
        } else if (selectedPeriod === 'q3') {
          params.quarter = 3;
        } else if (selectedPeriod === 'q4') {
          params.quarter = 4;
        }
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
  }, [mode, selectedYear, selectedPeriod, customStartDate, customEndDate, clientFilter, formatFilter, statusFilter]);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  // Load Comparison Data
  const loadComparison = async () => {
    setCompareLoading(true);
    try {
      const [bStart, bEnd] = baseQ.split(':');
      const [cStart, cEnd] = compQ.split(':');
      const res = await api.comparePeriods({
        base_start: bStart,
        base_end: bEnd,
        compare_start: cStart,
        compare_end: cEnd,
        base_label: 'Período Atual',
        compare_label: 'Período Anterior'
      });
      setCompareData(res);
    } catch (err) {
      console.error('Erro ao comparar períodos:', err);
    } finally {
      setCompareLoading(false);
    }
  };

  // Load Pains Lifecycle
  const loadPainsLifecycle = async () => {
    setLifecycleLoading(true);
    try {
      const res = await api.getPainsLifecycle();
      setLifecycleData(res);
    } catch (err) {
      console.error('Erro ao carregar ciclo de vida:', err);
    } finally {
      setLifecycleLoading(false);
    }
  };

  // Load Client Timeline
  const handleOpenClientTimeline = async (clientCode) => {
    setTimelineLoading(true);
    try {
      const res = await api.getClientTimeline(clientCode);
      setSelectedClientTimeline(res);
    } catch (err) {
      console.error('Erro ao carregar timeline do cliente:', err);
    } finally {
      setTimelineLoading(false);
    }
  };

  // Generate Executive Summary
  const handleGenerateSummary = async () => {
    setSummaryLoading(true);
    setIsSummaryModalOpen(true);
    try {
      const start = analyticsData?.period?.start_date || '2026-01-01';
      const end = analyticsData?.period?.end_date || '2026-12-31';
      const res = await api.generateExecutiveSummary(start, end, clientFilter || null);
      setExecutiveSummary(res);
    } catch (err) {
      console.error('Erro ao gerar resumo executivo:', err);
    } finally {
      setSummaryLoading(false);
    }
  };

  const handleOpenDrilldown = async (metricType, metricKey) => {
    try {
      const params = {
        metric_type: metricType,
        metric_key: metricKey,
        client_code: clientFilter,
        format: formatFilter,
        status: statusFilter,
      };

      if (mode === 'preset') {
        params.year = selectedYear;
        if (selectedPeriod === 'q1') params.quarter = 1;
        else if (selectedPeriod === 'q2') params.quarter = 2;
        else if (selectedPeriod === 'q3') params.quarter = 3;
        else if (selectedPeriod === 'q4') params.quarter = 4;
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

  return (
    <div style={{ padding: '1.5rem', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Header Principal com Resumo Executivo e Sincronização */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ margin: '0 0 4px 0', color: 'var(--primary-color)', fontSize: '22px' }}>
            Visão Executiva & Analytics
          </h2>
          <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '13px' }}>
            {analyticsData?.period?.label || 'Visão Anual e Trimestral'} — Inteligência Corporativa TOTVS
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            onClick={handleGenerateSummary}
            className="btn-pf btn-pf-executive btn-pf-sm"
          >
            <BarChart3 size={14} />
            <span>Gerar Resumo Executivo</span>
          </button>
        </div>
      </div>

      {/* Navegação entre Abas Principais */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px', flexWrap: 'wrap' }}>
        <button
          onClick={() => setActiveTab('visao_geral')}
          className={`btn-pf btn-pf-sm ${activeTab === 'visao_geral' ? 'btn-pf-primary' : 'btn-pf-secondary'}`}
        >
          <Activity size={14} />
          <span>Visão Geral & Indicadores</span>
        </button>

        <button
          onClick={() => {
            setActiveTab('comparacao');
            if (!compareData) loadComparison();
          }}
          className={`btn-pf btn-pf-sm ${activeTab === 'comparacao' ? 'btn-pf-primary' : 'btn-pf-secondary'}`}
        >
          <Scale size={14} />
          <span>Comparação entre Períodos</span>
        </button>

        <button
          onClick={() => {
            setActiveTab('ciclo_vida_dores');
            if (!lifecycleData) loadPainsLifecycle();
          }}
          className={`btn-pf btn-pf-sm ${activeTab === 'ciclo_vida_dores' ? 'btn-pf-primary' : 'btn-pf-secondary'}`}
        >
          <RefreshCw size={14} />
          <span>Resolução e Ciclo de Vida das Dores</span>
        </button>
      </div>

      {/* Barra de Filtros (Quando na Visão Geral) */}
      {activeTab === 'visao_geral' && (
        <div className="filter-bar-pf" style={{ marginBottom: '1.5rem' }}>
          <div>
            <label className="filter-label-pf">
              Ano
            </label>
            <select
              className="select-pf"
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
            >
              <option value={2026}>2026</option>
              <option value={2025}>2025</option>
              <option value={2024}>2024</option>
            </select>
          </div>

          <div>
            <label className="filter-label-pf">
              Período
            </label>
            <select
              className="select-pf"
              value={selectedPeriod}
              onChange={(e) => setSelectedPeriod(e.target.value)}
            >
              <option value="year">Ano Completo</option>
              <option value="sem1">1º Semestre (Jan-Jun)</option>
              <option value="sem2">2º Semestre (Jul-Dez)</option>
              <option value="q1">1º Trimestre (Q1)</option>
              <option value="q2">2º Trimestre (Q2)</option>
              <option value="q3">3º Trimestre (Q3)</option>
              <option value="q4">4º Trimestre (Q4)</option>
            </select>
          </div>

          <div>
            <label className="filter-label-pf">
              Cliente / Segmento
            </label>
            <input
              type="text"
              className="input-pf"
              placeholder="Ex: T27261"
              value={clientFilter}
              onChange={(e) => setClientFilter(e.target.value)}
              style={{ width: '140px' }}
            />
          </div>

          <button
            onClick={loadAnalytics}
            className="btn-pf btn-pf-primary btn-pf-sm"
            style={{ alignSelf: 'flex-end', height: '34px' }}
            title="Filtrar análises trimestrais"
          >
            <Filter size={13} />
            <span>Filtrar</span>
          </button>
        </div>
      )}

      {/* ABA 1: VISÃO GERAL */}
      {activeTab === 'visao_geral' && (
        <>
          {/* Sub-Navegação Direcionada da Visão Geral (Progressive Disclosure) */}
          <div className="subtabs-bar" style={{ marginTop: '0.25rem', marginBottom: '1.25rem' }}>
            <button
              onClick={() => setOverviewView('indicadores')}
              className={`subtab-pill ${overviewView === 'indicadores' ? 'active' : ''}`}
              title="Métricas, Alertas e Gráficos de Tendências"
            >
              <BarChart3 size={13} />
              <span>Indicadores & Gráficos</span>
            </button>

            {analyticsData?.clients_at_risk?.length > 0 && (
              <button
                onClick={() => setOverviewView('clientes')}
                className={`subtab-pill ${overviewView === 'clientes' ? 'active' : ''}`}
                title="Clientes com Dores Recorrentes ou Urgência Crítica"
              >
                <User size={13} />
                <span>Clientes Prioritários</span>
                <span className="subtab-badge">{analyticsData.clients_at_risk.length}</span>
              </button>
            )}

            {analyticsData?.segments_unidentified?.length > 0 && (
              <button
                onClick={() => setOverviewView('segmentos')}
                className={`subtab-pill ${overviewView === 'segmentos' ? 'active' : ''}`}
                title="Segmentos Econômicos e Reuniões Gerais"
              >
                <Layers size={13} />
                <span>Segmentos de Mercado</span>
                <span className="subtab-badge">{analyticsData.segments_unidentified.length}</span>
              </button>
            )}
          </div>

          {/* VISÃO: INDICADORES & GRÁFICOS */}
          {overviewView === 'indicadores' && (
            <>
              {/* Nível 2: Alertas Gerenciais Hierarquizados (Crítico > Atenção > Informativo) */}
          {analyticsData?.managerial_alerts && analyticsData.managerial_alerts.length > 0 && (
            <div style={{
              background: 'var(--panel-bg)',
              border: '1px solid var(--border-color)',
              borderRadius: '8px',
              padding: '1.2rem',
              marginBottom: '1.5rem'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <h4 style={{ margin: 0, color: 'var(--warning)', fontSize: '15px', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}>
                    <AlertTriangle size={16} color="var(--warning)" style={{ flexShrink: 0 }} />
                    <span>Alertas Gerenciais Corporativos ({analyticsData.managerial_alerts.length})</span>
                  </h4>
                  <span style={{
                    fontSize: '11px',
                    padding: '2px 8px',
                    borderRadius: '10px',
                    background: 'rgba(239, 68, 68, 0.15)',
                    color: 'var(--danger)',
                    fontWeight: 600
                  }}>
                    {analyticsData.managerial_alerts.filter(a => a.severity === 'critical' || a.severity === 'danger').length} Críticos
                  </span>
                </div>
                
                {analyticsData.managerial_alerts.length > 4 && (
                  <button
                    onClick={() => setShowAllAlerts(!showAllAlerts)}
                    className="btn-pf btn-pf-outline-blue btn-pf-sm"
                    style={{ fontSize: '11px', padding: '4px 10px' }}
                  >
                    {showAllAlerts ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                    <span>{showAllAlerts ? 'Recolher Alertas' : `Ver Todos os ${analyticsData.managerial_alerts.length} Alertas`}</span>
                  </button>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '10px' }}>
                {(showAllAlerts ? analyticsData.managerial_alerts : analyticsData.managerial_alerts.slice(0, 4)).map((al) => {
                  const isCrit = al.severity === 'critical' || al.severity === 'danger';
                  const isWarn = al.severity === 'warning';
                  const borderColor = isCrit ? 'var(--danger)' : (isWarn ? 'var(--warning)' : 'var(--primary-color)');
                  const badgeBg = isCrit ? 'rgba(239, 68, 68, 0.15)' : (isWarn ? 'rgba(245, 158, 11, 0.15)' : 'rgba(2, 132, 199, 0.15)');
                  const badgeColor = isCrit ? 'var(--danger)' : (isWarn ? 'var(--warning)' : 'var(--primary-color)');

                  return (
                    <div
                      key={al.id}
                      style={{
                        background: 'var(--panel-hover)',
                        borderLeft: `4px solid ${borderColor}`,
                        borderTop: '1px solid var(--border-color)',
                        borderRight: '1px solid var(--border-color)',
                        borderBottom: '1px solid var(--border-color)',
                        borderRadius: '6px',
                        padding: '10px 14px',
                        fontSize: '12px',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between'
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                          <span style={{ fontWeight: 600, color: 'var(--text-main)', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            {isCrit ? <AlertCircle size={14} color="var(--danger)" style={{ flexShrink: 0 }} /> : isWarn ? <AlertTriangle size={14} color="var(--warning)" style={{ flexShrink: 0 }} /> : <Info size={14} color="var(--primary-color)" style={{ flexShrink: 0 }} />}
                            <span>{al.title}</span>
                          </span>
                          <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '4px', background: badgeBg, color: badgeColor, fontWeight: 700 }}>
                            {isCrit ? 'CRÍTICO' : (isWarn ? 'ATENÇÃO' : 'INFORMATIVO')}
                          </span>
                        </div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '11px', lineHeight: '1.4' }}>
                          {al.description}
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
                        {al.metric_key && (
                          <button
                            onClick={() => handleOpenDrilldown('pain', al.metric_key)}
                            className="btn-pf btn-pf-outline-blue btn-pf-sm"
                            style={{ fontSize: '11px', padding: '3px 8px' }}
                          >
                            <Search size={11} />
                            <span>Ver reuniões ({al.count})</span>
                          </button>
                        )}
                        {al.client_code && (
                          <button
                            onClick={() => handleOpenClientTimeline(al.client_code)}
                            className="btn-pf btn-pf-outline-blue btn-pf-sm"
                            style={{ fontSize: '11px', padding: '3px 8px' }}
                          >
                            <User size={11} />
                            <span>Timeline do cliente</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Nível 1: Cards de Métricas Principais */}
          {analyticsData && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
              <div style={{ background: 'var(--panel-bg)', padding: '1.1rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Total de Reuniões</div>
                <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-main)', marginTop: '4px' }}>
                  {analyticsData.meetings?.total || 0}
                </div>
                <div style={{ fontSize: '10px', color: 'var(--success)', marginTop: '2px' }}>
                  {analyticsData.meetings?.analyzed || 0} analisadas com IA
                </div>
              </div>

              <div style={{ background: 'var(--panel-bg)', padding: '1.1rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Ações em Aberto</div>
                <div
                  onClick={() => handleOpenDrilldown('open_actions', 'open')}
                  style={{ fontSize: '24px', fontWeight: 700, color: 'var(--primary-color)', marginTop: '4px', cursor: 'pointer' }}
                  title="Clique para ver ações abertas"
                >
                  {analyticsData.open_actions || 0}
                </div>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>
                  de {analyticsData.total_actions || 0} ações registradas
                </div>
              </div>

              <div style={{ background: 'var(--panel-bg)', padding: '1.1rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Ações Vencidas (SLA)</div>
                <div
                  onClick={() => handleOpenDrilldown('overdue_actions', 'overdue')}
                  style={{ fontSize: '24px', fontWeight: 700, color: 'var(--danger)', marginTop: '4px', cursor: 'pointer' }}
                  title="Clique para ver ações vencidas"
                >
                  {analyticsData.overdue_actions || 0}
                </div>
                <div style={{ fontSize: '10px', color: 'var(--danger)', marginTop: '2px' }}>
                  exigem regularização
                </div>
              </div>

              <div style={{ background: 'var(--panel-bg)', padding: '1.1rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Qualidade Geral</div>
                  <button
                    onClick={() => setIsDataQualityModalOpen(true)}
                    className="btn-pf btn-pf-outline-blue btn-pf-sm"
                    style={{ fontSize: '11px', padding: '2px 8px' }}
                  >
                    <Sliders size={11} />
                    <span>Detalhar</span>
                  </button>
                </div>
                <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--success)', marginTop: '4px' }}>
                  {analyticsData.data_quality?.score_qualidade || 100}%
                </div>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>
                  Dados: {analyticsData.data_quality?.score_qualidade_dados || 100}% (50%) | IA: {analyticsData.data_quality?.score_qualidade_ia || 100}% (50%)
                </div>
              </div>
            </div>
          )}

          {/* Nível 3: Gráficos de Temas e Dores */}
          {analyticsData && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))', gap: '1.5rem', marginBottom: '1.5rem' }}>
              {/* Gráfico de Temas Mais Discutidos */}
              <div style={{ background: 'var(--panel-bg)', padding: '1.2rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                <h4 style={{ margin: '0 0 1rem 0', fontSize: '14px', color: 'var(--text-main)' }}>
                  Temas Mais Discutidos nas Reuniões
                </h4>
                <div style={{ height: '240px' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={(analyticsData.top_topics || []).slice(0, 6)} layout="vertical" margin={{ left: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                      <XAxis type="number" stroke="var(--text-muted)" fontSize={11} />
                      <YAxis type="category" dataKey="label" stroke="var(--text-muted)" fontSize={11} width={130} />
                      <Tooltip contentStyle={{ background: 'var(--panel-bg)', border: '1px solid var(--border-color)', color: 'var(--text-main)', fontSize: '12px' }} />
                      <Bar dataKey="reunioes_com_tema" name="Reuniões" fill="var(--primary-color)" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Gráfico de Dores Recorrentes */}
              <div style={{ background: 'var(--panel-bg)', padding: '1.2rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                <h4 style={{ margin: '0 0 1rem 0', fontSize: '14px', color: 'var(--text-main)' }}>
                  Dores Críticas e Gargalos Operacionais
                </h4>
                <div style={{ height: '240px' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={(analyticsData.recurring_pains || []).slice(0, 6)} layout="vertical" margin={{ left: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                      <XAxis type="number" stroke="var(--text-muted)" fontSize={11} />
                      <YAxis type="category" dataKey="label" stroke="var(--text-muted)" fontSize={11} width={130} />
                      <Tooltip contentStyle={{ background: 'var(--panel-bg)', border: '1px solid var(--border-color)', color: 'var(--text-main)', fontSize: '12px' }} />
                      <Bar dataKey="reunioes_afetadas" name="Reuniões Afetadas" fill="var(--warning)" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}
        </>
      )}

          {/* Nível 4: Clientes que Exigem Acompanhamento Prioritário */}
          {overviewView === 'clientes' && (
            analyticsData?.clients_at_risk && analyticsData.clients_at_risk.length > 0 ? (
              <div style={{ background: 'var(--panel-bg)', padding: '1.2rem', borderRadius: '8px', border: '1px solid var(--border-color)', marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <h4 style={{ margin: 0, fontSize: '14px', color: 'var(--text-main)' }}>
                    Clientes que Exigem Acompanhamento Prioritário
                  </h4>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    Clientes identificados com dores críticas ou reuniões recorrentes
                  </span>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border-color)', textAlign: 'left', color: 'var(--text-muted)' }}>
                        <th style={{ padding: '8px' }}>Código do Cliente</th>
                        <th style={{ padding: '8px' }}>Reuniões</th>
                        <th style={{ padding: '8px' }}>Total de Dores</th>
                        <th style={{ padding: '8px' }}>Dores Principais</th>
                        <th style={{ padding: '8px' }}>Urgência Máxima</th>
                        <th style={{ padding: '8px' }}>Ações Pendentes</th>
                        <th style={{ padding: '8px' }}>Ação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analyticsData.clients_at_risk.map((cli, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                          <td style={{ padding: '8px', fontWeight: 600, color: 'var(--primary-color)' }}>
                            {cli.codigo_cliente}
                          </td>
                          <td style={{ padding: '8px' }}>{cli.total_reunioes}</td>
                          <td style={{ padding: '8px', color: 'var(--warning)', fontWeight: 600 }}>{cli.total_dores}</td>
                          <td style={{ padding: '8px', color: 'var(--text-muted)' }}>{cli.dores_principais?.join(', ') || '-'}</td>
                          <td style={{ padding: '8px' }}>
                            <span style={{
                              padding: '2px 6px',
                              borderRadius: '4px',
                              fontSize: '11px',
                              fontWeight: 600,
                              background: cli.urgencia_maxima === 'Crítica' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                              color: cli.urgencia_maxima === 'Crítica' ? 'var(--danger)' : 'var(--warning)'
                            }}>
                              {cli.urgencia_maxima}
                            </span>
                          </td>
                          <td style={{ padding: '8px' }}>{cli.acoes_pendentes}</td>
                          <td style={{ padding: '8px' }}>
                            <button
                              onClick={() => handleOpenClientTimeline(cli.codigo_cliente)}
                              className="btn-pf btn-pf-outline-blue btn-pf-sm"
                              style={{ fontSize: '11px', padding: '3px 8px' }}
                            >
                              <User size={11} />
                              <span>Ver Timeline</span>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div style={{ background: 'var(--panel-bg)', padding: '2rem', borderRadius: '8px', border: '1px solid var(--border-color)', textAlign: 'center', color: 'var(--text-muted)' }}>
                Nenhum cliente prioritário identificado com os filtros atuais.
              </div>
            )
          )}

          {/* Nível 5: Segmentos e Reuniões sem Cliente Identificado */}
          {overviewView === 'segmentos' && (
            analyticsData?.segments_unidentified && analyticsData.segments_unidentified.length > 0 ? (
              <div style={{ background: 'var(--panel-bg)', padding: '1.2rem', borderRadius: '8px', border: '1px solid var(--border-color)', marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <h4 style={{ margin: 0, fontSize: '14px', color: 'var(--text-main)' }}>
                    Segmentos e Reuniões sem Cliente Específico Identificado
                  </h4>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    Reuniões gerais, institucionais ou vinculadas apenas ao segmento econômico
                  </span>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border-color)', textAlign: 'left', color: 'var(--text-muted)' }}>
                        <th style={{ padding: '8px' }}>Segmento / Origem</th>
                        <th style={{ padding: '8px' }}>Total de Reuniões</th>
                        <th style={{ padding: '8px' }}>Total de Dores</th>
                        <th style={{ padding: '8px' }}>Dores Mapeadas</th>
                        <th style={{ padding: '8px' }}>Urgência Máxima</th>
                        <th style={{ padding: '8px' }}>Ações Pendentes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analyticsData.segments_unidentified.map((seg, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                          <td style={{ padding: '8px', fontWeight: 600, color: 'var(--text-main)' }}>
                            <span className="badge" style={{ fontSize: '11px' }}>{seg.segment_or_source}</span>
                          </td>
                          <td style={{ padding: '8px' }}>{seg.total_reunioes}</td>
                          <td style={{ padding: '8px', color: 'var(--warning)', fontWeight: 600 }}>{seg.total_dores}</td>
                          <td style={{ padding: '8px', color: 'var(--text-muted)' }}>{seg.dores_principais?.join(', ') || '-'}</td>
                          <td style={{ padding: '8px' }}>
                            <span style={{
                              padding: '2px 6px',
                              borderRadius: '4px',
                              fontSize: '11px',
                              fontWeight: 600,
                              background: seg.urgencia_maxima === 'Crítica' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                              color: seg.urgencia_maxima === 'Crítica' ? 'var(--danger)' : 'var(--warning)'
                            }}>
                              {seg.urgencia_maxima}
                            </span>
                          </td>
                          <td style={{ padding: '8px' }}>{seg.acoes_pendentes}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div style={{ background: 'var(--panel-bg)', padding: '2rem', borderRadius: '8px', border: '1px solid var(--border-color)', textAlign: 'center', color: 'var(--text-muted)' }}>
                Nenhum segmento geral ou institucional mapeado para este período.
              </div>
            )
          )}
        </>
      )}

      {/* ABA 2: COMPARAÇÃO ENTRE PERÍODOS */}
      {activeTab === 'comparacao' && (
        <div style={{ background: 'var(--panel-bg)', padding: '1.5rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <h3 style={{ margin: '0 0 4px 0', fontSize: '16px', color: 'var(--text-main)' }}>
                Comparativo Entre Trimestres e Intervalos
              </h3>
              <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '12px' }}>
                Cálculo determinístico de deltas de pautas, dores resolvidas e novos riscos.
              </p>
            </div>

            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <div>
                <span className="filter-label-pf" style={{ display: 'inline-block', marginRight: '6px' }}>Base:</span>
                <select
                  className="select-pf"
                  value={baseQ}
                  onChange={(e) => setBaseQ(e.target.value)}
                  style={{ fontSize: '12px' }}
                >
                  <option value="2026-01-01:2026-03-31">1º Tri 2026 (Jan-Mar)</option>
                  <option value="2026-04-01:2026-06-30">2º Tri 2026 (Abr-Jun)</option>
                  <option value="2026-07-01:2026-09-30">3º Tri 2026 (Jul-Set)</option>
                </select>
              </div>

              <div>
                <span className="filter-label-pf" style={{ display: 'inline-block', marginRight: '6px' }}>vs Comparado:</span>
                <select
                  className="select-pf"
                  value={compQ}
                  onChange={(e) => setCompQ(e.target.value)}
                  style={{ fontSize: '12px' }}
                >
                  <option value="2025-10-01:2025-12-31">4º Tri 2025 (Out-Dez)</option>
                  <option value="2025-07-01:2025-09-30">3º Tri 2025 (Jul-Set)</option>
                  <option value="2026-01-01:2026-03-31">1º Tri 2026 (Jan-Mar)</option>
                </select>
              </div>

              <button
                onClick={loadComparison}
                disabled={compareLoading}
                className="btn-pf btn-pf-primary btn-pf-sm"
                style={{ opacity: compareLoading ? 0.7 : 1 }}
              >
                <ArrowRightLeft size={13} />
                <span>{compareLoading ? 'Calculando...' : 'Comparar'}</span>
              </button>
            </div>
          </div>

          {compareData && (
            <div>
              {/* Resumo de Deltas */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                <div style={{ padding: '1rem', background: 'rgba(0,0,0,0.2)', borderRadius: '6px' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Variação de Reuniões</div>
                  <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-main)', marginTop: '4px' }}>
                    {compareData.total_meetings_base} vs {compareData.total_meetings_compare}
                    <span style={{ fontSize: '12px', marginLeft: '6px', color: compareData.total_meetings_delta >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                      ({compareData.total_meetings_delta >= 0 ? `+${compareData.total_meetings_delta}` : compareData.total_meetings_delta})
                    </span>
                  </div>
                </div>

                <div style={{ padding: '1rem', background: 'rgba(0,0,0,0.2)', borderRadius: '6px' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Dores Novas Detectadas</div>
                  <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--warning)', marginTop: '4px' }}>
                    {compareData.new_pains?.length > 0 ? compareData.new_pains.join(', ') : 'Nenhuma dor nova'}
                  </div>
                </div>

                <div style={{ padding: '1rem', background: 'rgba(0,0,0,0.2)', borderRadius: '6px' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Dores Resolvidas / Não Recorrentes</div>
                  <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--success)', marginTop: '4px' }}>
                    {compareData.resolved_pains?.length > 0 ? compareData.resolved_pains.join(', ') : 'Nenhuma'}
                  </div>
                </div>
              </div>

              {/* Tabela de Variação de Temas */}
              <h4 style={{ margin: '0 0 10px 0', fontSize: '14px', color: 'var(--text-main)' }}>
                Evolução das Pautas e Assuntos
              </h4>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-color)', textAlign: 'left', color: 'var(--text-muted)' }}>
                      <th style={{ padding: '8px' }}>Tema</th>
                      <th style={{ padding: '8px' }}>Período Atual</th>
                      <th style={{ padding: '8px' }}>Período Anterior</th>
                      <th style={{ padding: '8px' }}>Variação Absoluta</th>
                      <th style={{ padding: '8px' }}>Tendência</th>
                    </tr>
                  </thead>
                  <tbody>
                    {compareData.topics_comparison?.map((top, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '8px', fontWeight: 600, color: 'var(--text-main)' }}>{top.label}</td>
                        <td style={{ padding: '8px' }}>{top.base_count}</td>
                        <td style={{ padding: '8px' }}>{top.compare_count}</td>
                        <td style={{ padding: '8px', color: top.delta_count > 0 ? 'var(--warning)' : (top.delta_count < 0 ? 'var(--success)' : 'var(--text-muted)') }}>
                          {top.delta_count > 0 ? `+${top.delta_count}` : top.delta_count} ({top.delta_percent}%)
                        </td>
                        <td style={{ padding: '8px' }}>
                          <span style={{
                            padding: '2px 6px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: 600,
                            background: top.trend === 'aumentou' ? 'rgba(245, 158, 11, 0.15)' : (top.trend === 'diminuiu' ? 'rgba(16, 185, 129, 0.15)' : 'var(--panel-hover)'),
                            border: top.trend === 'aumentou' || top.trend === 'diminuiu' ? 'none' : '1px solid var(--border-color)',
                            color: top.trend === 'aumentou' ? 'var(--warning)' : (top.trend === 'diminuiu' ? 'var(--success)' : 'var(--text-muted)')
                          }}>
                            {top.trend === 'aumentou' ? '▲ Aumentou' : (top.trend === 'diminuiu' ? '▼ Diminuiu' : '― Estável')}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ABA 3: CICLO DE VIDA E RESOLUÇÃO DE DORES */}
      {activeTab === 'ciclo_vida_dores' && (
        <div style={{ background: 'var(--panel-bg)', padding: '1.5rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
          <div style={{ marginBottom: '1.2rem' }}>
            <h3 style={{ margin: '0 0 4px 0', fontSize: '16px', color: 'var(--text-main)' }}>
              Acompanhamento de Resolução das Dores Corporativas
            </h3>
            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '12px' }}>
              Rastreabilidade de primeira e última aparição, taxa de conclusão de ações e produtos TOTVS recomendados.
            </p>
          </div>

          {lifecycleLoading ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Carregando dados de ciclo de vida...</p>
          ) : lifecycleData?.items ? (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-color)', textAlign: 'left', color: 'var(--text-muted)' }}>
                    <th style={{ padding: '8px' }}>Dor Identificada</th>
                    <th style={{ padding: '8px' }}>1ª Aparição</th>
                    <th style={{ padding: '8px' }}>Última Aparição</th>
                    <th style={{ padding: '8px' }}>Reuniões</th>
                    <th style={{ padding: '8px' }}>Clientes</th>
                    <th style={{ padding: '8px' }}>Ações Resolvidas</th>
                    <th style={{ padding: '8px' }}>Tendência</th>
                    <th style={{ padding: '8px' }}>Solução TOTVS Sugerida</th>
                  </tr>
                </thead>
                <tbody>
                  {lifecycleData.items.map((item, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '8px', fontWeight: 600, color: 'var(--text-main)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: item.cor }}></span>
                          {item.label}
                        </div>
                        {item.has_unresolved_alert && (
                          <span style={{ fontSize: '10px', color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                            <AlertTriangle size={11} style={{ flexShrink: 0 }} />
                            <span>Recorrente em 3+ reuniões sem resolução</span>
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '8px', color: 'var(--text-muted)' }}>{item.first_seen_date || '-'}</td>
                      <td style={{ padding: '8px', color: 'var(--text-muted)' }}>{item.last_seen_date || '-'}</td>
                      <td style={{ padding: '8px', fontWeight: 600 }}>{item.meetings_count}</td>
                      <td style={{ padding: '8px' }}>{item.affected_clients_count} {item.affected_clients_count === 1 ? 'cliente' : 'clientes'}</td>
                      <td style={{ padding: '8px' }}>
                        <span style={{ color: item.completed_tasks_count > 0 ? 'var(--success)' : 'var(--warning)' }}>
                          {item.completed_tasks_count} / {item.related_tasks_count}
                        </span>
                        {item.overdue_tasks_count > 0 && (
                          <span style={{ color: 'var(--danger)', marginLeft: '4px' }}>
                            ({item.overdue_tasks_count} vencidas)
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '8px' }}>
                        <span style={{
                          padding: '2px 6px',
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontWeight: 600,
                          background: item.trend === 'aumentando' ? 'rgba(239, 68, 68, 0.15)' : (item.trend === 'reduzindo' ? 'rgba(16, 185, 129, 0.15)' : 'var(--panel-hover)'),
                          border: item.trend === 'aumentando' || item.trend === 'reduzindo' ? 'none' : '1px solid var(--border-color)',
                          color: item.trend === 'aumentando' ? 'var(--danger)' : (item.trend === 'reduzindo' ? 'var(--success)' : 'var(--text-muted)')
                        }}>
                          {item.trend === 'aumentando' ? '▲ Aumentando' : (item.trend === 'reduzindo' ? '▼ Reduzindo' : '― Estável')}
                        </span>
                      </td>
                      <td style={{ padding: '8px', color: 'var(--primary-color)', fontWeight: 500 }}>
                        {item.associated_totvs_product}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      )}

      {/* MODAL: LINHA DO TEMPO DO CLIENTE */}
      {selectedClientTimeline && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1100,
          padding: '1rem'
        }}>
          <div style={{
            background: 'var(--panel-bg)',
            border: '1px solid var(--border-color)',
            borderRadius: '8px',
            maxWidth: '750px',
            width: '100%',
            maxHeight: '85vh',
            overflowY: 'auto',
            padding: '1.5rem'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div>
                <h3 style={{ margin: '0 0 2px 0', fontSize: '18px', color: 'var(--text-main)' }}>
                  Jornada e Linha do Tempo: {selectedClientTimeline.client_code}
                </h3>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  Saúde da Conta:{' '}
                  <strong style={{
                    color: selectedClientTimeline.relationship_health === 'Crítico' ? 'var(--danger)' :
                           (selectedClientTimeline.relationship_health === 'Atenção' ? 'var(--warning)' : 'var(--success)')
                  }}>
                    {selectedClientTimeline.relationship_health}
                  </strong>{' '}
                  | {selectedClientTimeline.total_meetings} {selectedClientTimeline.total_meetings === 1 ? 'reunião' : 'reuniões'}
                </span>
              </div>
              <button
                onClick={() => setSelectedClientTimeline(null)}
                className="btn-pf btn-pf-ghost"
                style={{ width: '32px', height: '32px', padding: 0, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                title="Fechar"
              >
                <X size={16} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
              {selectedClientTimeline.timeline?.map((item, idx) => (
                <div
                  key={idx}
                  style={{
                    borderLeft: '2px solid var(--primary-color)',
                    paddingLeft: '1rem',
                    position: 'relative'
                  }}
                >
                  <div style={{ fontSize: '11px', color: 'var(--primary-color)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Calendar size={12} style={{ flexShrink: 0 }} />
                    <span>{item.date || 'Data não informada'}</span>
                  </div>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-main)', margin: '2px 0' }}>
                    {item.tema}
                  </div>
                  {item.dores?.length > 0 && (
                    <div style={{ fontSize: '11px', color: 'var(--warning)', marginTop: '2px' }}>
                      <strong>Dores:</strong> {item.dores.join(', ')}
                    </div>
                  )}
                  {item.decisao && item.decisao !== 'Não mencionado' && (
                    <div style={{ fontSize: '11px', color: 'var(--success)', marginTop: '2px' }}>
                      <strong>Decisão:</strong> {item.decisao}
                    </div>
                  )}
                  {item.recomendacoes_totvs?.length > 0 && (
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      <strong>Sistemas TOTVS:</strong> {item.recomendacoes_totvs.join(', ')}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div style={{ marginTop: '1.5rem', textAlign: 'right' }}>
              <button
                onClick={() => setSelectedClientTimeline(null)}
                className="btn-pf btn-pf-primary btn-pf-sm"
              >
                <Check size={13} />
                <span>Fechar</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: RESUMO EXECUTIVO CONTROLADO */}
      {isSummaryModalOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1100,
          padding: '1rem'
        }}>
          <div style={{
            background: 'var(--panel-bg)',
            border: '1px solid var(--border-color)',
            borderRadius: '8px',
            maxWidth: '700px',
            width: '100%',
            maxHeight: '85vh',
            overflowY: 'auto',
            padding: '1.5rem'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0, fontSize: '18px', color: 'var(--primary-color)' }}>
                Resumo Executivo Estruturado
              </h3>
              <button
                onClick={() => setIsSummaryModalOpen(false)}
                className="btn-pf btn-pf-ghost"
                style={{ width: '32px', height: '32px', padding: 0, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                title="Fechar"
              >
                <X size={16} />
              </button>
            </div>

            {summaryLoading ? (
              <p style={{ color: 'var(--text-muted)' }}>Consolidando dados executivos...</p>
            ) : executiveSummary ? (
              <div style={{ fontSize: '13px', lineHeight: '1.5', color: 'var(--text-main)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ padding: '10px', background: 'rgba(2, 132, 199, 0.08)', borderRadius: '6px', borderLeft: '3px solid var(--primary-color)' }}>
                  {executiveSummary.resumo_executivo_texto}
                </div>

                <div>
                  <strong style={{ color: 'var(--primary-color)' }}>Principais Assuntos Discutidos:</strong>
                  <ul style={{ margin: '4px 0', paddingLeft: '18px', color: 'var(--text-muted)' }}>
                    {executiveSummary.principais_assuntos?.map((ass, i) => (
                      <li key={i}>{ass}</li>
                    ))}
                  </ul>
                </div>

                <div>
                  <strong style={{ color: 'var(--warning)' }}>Dores e Gargalos Persistentes:</strong>
                  <ul style={{ margin: '4px 0', paddingLeft: '18px', color: 'var(--text-muted)' }}>
                    {executiveSummary.dores_persistentes?.map((dor, i) => (
                      <li key={i}>{dor}</li>
                    ))}
                  </ul>
                </div>

                {executiveSummary.recomendacoes_proximos_passos?.length > 0 && (
                  <div>
                    <strong style={{ color: 'var(--success)' }}>Recomendações de Próximos Passos:</strong>
                    <ul style={{ margin: '4px 0', paddingLeft: '18px', color: 'var(--text-muted)' }}>
                      {executiveSummary.recomendacoes_proximos_passos.map((rec, i) => (
                        <li key={i}>{rec}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : null}

            <div style={{ marginTop: '1.5rem', textAlign: 'right' }}>
              <button
                onClick={() => setIsSummaryModalOpen(false)}
                className="btn-pf btn-pf-primary btn-pf-sm"
              >
                <Check size={13} />
                <span>Concluído</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: DETALHAMENTO DA QUALIDADE DOS DADOS & IA */}
      {isDataQualityModalOpen && analyticsData?.data_quality && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1100,
          padding: '1rem'
        }}>
          <div style={{
            background: 'var(--panel-bg)',
            border: '1px solid var(--border-color)',
            borderRadius: '8px',
            maxWidth: '650px',
            width: '100%',
            maxHeight: '85vh',
            overflowY: 'auto',
            padding: '1.5rem'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0, fontSize: '18px', color: 'var(--primary-color)' }}>
                Composição do Score de Qualidade
              </h3>
              <button
                onClick={() => setIsDataQualityModalOpen(false)}
                className="btn-pf btn-pf-ghost"
                style={{ width: '32px', height: '32px', padding: 0, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                title="Fechar"
              >
                <X size={16} />
              </button>
            </div>

            <p style={{ color: 'var(--text-muted)', fontSize: '12px', marginBottom: '1.2rem' }}>
              {analyticsData.data_quality.calculation_breakdown?.formula_geral || 'O índice geral é calculado pela média ponderada de 50% Qualidade dos Dados + 50% Qualidade da IA.'}
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '1.5rem' }}>
              <div style={{ background: 'rgba(0,0,0,0.2)', padding: '12px', borderRadius: '6px', borderLeft: '3px solid var(--primary-color)' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  Qualidade dos Dados ({analyticsData.data_quality.calculation_breakdown?.peso_dados_geral || 50}%)
                </div>
                <div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--primary-color)', marginTop: '4px' }}>
                  {analyticsData.data_quality.score_qualidade_dados || 100}%
                </div>
              </div>
              <div style={{ background: 'rgba(0,0,0,0.2)', padding: '12px', borderRadius: '6px', borderLeft: '3px solid var(--success)' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  Qualidade da IA ({analyticsData.data_quality.calculation_breakdown?.peso_ia_geral || 50}%)
                </div>
                <div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--success)', marginTop: '4px' }}>
                  {analyticsData.data_quality.score_qualidade_ia || 100}%
                </div>
              </div>
            </div>

            <h4 style={{ margin: '0 0 10px 0', fontSize: '13px', color: 'var(--text-main)' }}>
              Componentes de Qualidade dos Dados (Peso: {analyticsData.data_quality.calculation_breakdown?.peso_dados_geral || 50}% do total):
            </h4>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px', marginBottom: '1.2rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '6px' }}>
                <span style={{ color: 'var(--text-main)' }}>
                  Transcrições Válidas ({analyticsData.data_quality.calculation_breakdown?.pesos_dados?.transcricao?.peso || 35}%):
                </span>
                <strong style={{ color: 'var(--success)' }}>
                  {analyticsData.data_quality.reunioes_com_transcricao || 0} de {analyticsData.data_quality.total_reunioes || 0} reuniões ({analyticsData.data_quality.calculation_breakdown?.pesos_dados?.transcricao?.valor_percentual || 100}%)
                </strong>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '6px' }}>
                <span style={{ color: 'var(--text-main)' }}>
                  Clientes Válidos Identificados ({analyticsData.data_quality.calculation_breakdown?.pesos_dados?.clientes?.peso || 25}%):
                </span>
                <strong style={{ color: 'var(--primary-color)' }}>
                  {analyticsData.data_quality.clientes_identificados || 0} de {analyticsData.data_quality.total_reunioes || 0} reuniões ({analyticsData.data_quality.calculation_breakdown?.pesos_dados?.clientes?.valor_percentual || 100}%)
                </strong>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '6px' }}>
                <span style={{ color: 'var(--text-main)' }}>
                  Datas Padronizadas ISO ({analyticsData.data_quality.calculation_breakdown?.pesos_dados?.datas?.peso || 20}%):
                </span>
                <strong style={{ color: 'var(--success)' }}>
                  {analyticsData.data_quality.datas_validas || 0} de {analyticsData.data_quality.total_reunioes || 0} reuniões ({analyticsData.data_quality.calculation_breakdown?.pesos_dados?.datas?.valor_percentual || 100}%)
                </strong>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '6px' }}>
                <span style={{ color: 'var(--text-main)' }}>
                  Tarefas com Responsável ({analyticsData.data_quality.calculation_breakdown?.pesos_dados?.tarefas_responsavel?.peso || 10}%):
                </span>
                <strong style={{ color: 'var(--success)' }}>
                  {analyticsData.data_quality.tarefas_com_responsavel || 0} de {analyticsData.data_quality.total_tarefas || 0} tarefas ({analyticsData.data_quality.calculation_breakdown?.pesos_dados?.tarefas_responsavel?.valor_percentual || 100}%)
                </strong>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '6px' }}>
                <span style={{ color: 'var(--text-main)' }}>
                  Tarefas com Prazo Definido ({analyticsData.data_quality.calculation_breakdown?.pesos_dados?.tarefas_prazo?.peso || 10}%):
                </span>
                <strong style={{ color: 'var(--success)' }}>
                  {analyticsData.data_quality.tarefas_com_prazo || 0} de {analyticsData.data_quality.total_tarefas || 0} tarefas ({analyticsData.data_quality.calculation_breakdown?.pesos_dados?.tarefas_prazo?.valor_percentual || 100}%)
                </strong>
              </div>
            </div>

            <h4 style={{ margin: '0 0 10px 0', fontSize: '13px', color: 'var(--text-main)' }}>
              Componentes de Qualidade da IA (Peso: {analyticsData.data_quality.calculation_breakdown?.peso_ia_geral || 50}% do total):
            </h4>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '6px' }}>
                <span style={{ color: 'var(--text-main)' }}>
                  Reuniões Analisadas ({analyticsData.data_quality.calculation_breakdown?.pesos_ia?.analises_concluidas?.peso || 60}%):
                </span>
                <strong style={{ color: 'var(--primary-color)' }}>
                  {analyticsData.data_quality.reunioes_analisadas || 0} de {analyticsData.data_quality.total_reunioes || 0} reuniões ({analyticsData.data_quality.calculation_breakdown?.pesos_ia?.analises_concluidas?.valor_percentual || 100}%)
                </strong>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '6px' }}>
                <span style={{ color: 'var(--text-main)' }}>
                  Ausência de Falhas Técnicas ({analyticsData.data_quality.calculation_breakdown?.pesos_ia?.ausencia_falhas?.peso || 40}%):
                </span>
                <strong style={{ color: analyticsData.data_quality.falhas_ia > 0 ? 'var(--danger)' : 'var(--success)' }}>
                  {(analyticsData.data_quality.falhas_ia || 0) === 1 ? '1 falha registrada' : `${analyticsData.data_quality.falhas_ia || 0} falhas registradas`} ({analyticsData.data_quality.calculation_breakdown?.pesos_ia?.ausencia_falhas?.valor_percentual || 100}%)
                </strong>
              </div>
            </div>

            <div style={{ marginTop: '1.5rem', textAlign: 'right' }}>
              <button
                onClick={() => setIsDataQualityModalOpen(false)}
                className="btn-pf btn-pf-primary btn-pf-sm"
              >
                <Check size={13} />
                <span>Fechar</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Drilldown */}
      <EvidenceModal
        isOpen={isDrilldownOpen}
        onClose={() => setIsDrilldownOpen(false)}
        drilldownData={drilldownData}
        onOpenMeeting={onOpenMeeting}
      />
    </div>
  );
}
