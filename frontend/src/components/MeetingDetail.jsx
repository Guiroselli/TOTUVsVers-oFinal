import React from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import MeetingFieldSuggestions from './MeetingFieldSuggestions';
import ActionPlanTable from './ActionPlanTable';

const DORES_LABELS = {
  aprovacao_pendente:   'Aprovação pendente',
  atraso_prazo:         'Atraso / prazo em risco',
  documento_faltando:   'Documento não localizado',
  gargalo_operacional:  'Gargalo operacional',
  insatisfacao_cliente: 'Insatisfação do cliente',
  falta_metricas:       'Falta de Métricas/Visão',
  problemas_equipe:     'Sobrecarga/Falta de Pessoal',
  gestao_estoque:       'Problemas de Estoque/Logística',
  outro:                'Ponto de atenção',
};

const DORES_CORES = {
  aprovacao_pendente:   '#ef4444',
  atraso_prazo:         '#f59e0b',
  documento_faltando:   '#eab308',
  gargalo_operacional:  '#ef4444',
  insatisfacao_cliente: '#ec4899',
  falta_metricas:       '#3b82f6',
  problemas_equipe:     '#8b5cf6',
  gestao_estoque:       '#10b981',
  outro:                '#a1a1aa',
};

export default function MeetingDetail({
  meeting,
  sistemasTotvs,
  enviosPorReuniao,
  onConfirmSuggestion,
  onTaskStatusChange,
  onEnviarIntegracao,
  onOpenConfig
}) {
  if (!meeting) return null;

  const resumo = meeting.RESUMO_IA;
  const suggestions = meeting.field_suggestions || (resumo && resumo.field_suggestions) || {};

  return (
    <div style={{ background: 'var(--panel-bg)', borderRadius: '8px', padding: '1.5rem', border: '1px solid var(--border-color)' }}>
      {resumo ? (
        <>
          {/* SLIDE 11 — Perfil do Cliente */}
          {resumo.perfil_cliente && resumo.perfil_cliente.reunioes?.length > 0 && (
            <div style={{
              background: 'linear-gradient(135deg, rgba(0,210,255,0.08), rgba(0,210,255,0.02))',
              border: '1px solid rgba(0,210,255,0.25)',
              borderRadius: '8px',
              padding: '1.2rem',
              marginBottom: '1.5rem'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--primary-color)" strokeWidth="2">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                  <circle cx="12" cy="7" r="4"></circle>
                </svg>
                <strong style={{ color: 'var(--primary-color)', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Perfil do Cliente — {resumo.codigo_cliente || meeting.NOME_SEGMENTO}
                </strong>
              </div>
              <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '8px' }}>
                {resumo.perfil_cliente.reunioes.length} reunião(ões) anteriores no histórico deste cliente.
              </p>
              {Object.keys(resumo.perfil_cliente.dores_recorrentes || {}).length > 0 && (
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {Object.entries(resumo.perfil_cliente.dores_recorrentes).sort((a, b) => b[1] - a[1]).map(([cat, count]) => (
                    <span key={cat} style={{
                      fontSize: '11px',
                      background: 'rgba(239,68,68,0.15)',
                      color: '#ef4444',
                      padding: '3px 10px',
                      borderRadius: '12px',
                      fontWeight: 500
                    }}>
                      {DORES_LABELS[cat] || cat} — {count}x recorrente
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* FUNCIONALIDADE 2 — Painel de Sugestões da IA */}
          <MeetingFieldSuggestions
            meetingId={meeting.ID_MEETING}
            suggestions={suggestions}
            onConfirmSuggestion={onConfirmSuggestion}
          />

          {/* Resumo Executivo */}
          <div style={{
            background: 'var(--bg-main)',
            border: '1px solid var(--border-color)',
            borderRadius: '8px',
            padding: '1.25rem',
            marginBottom: '1.5rem'
          }}>
            <h4 style={{ color: 'var(--primary-color)', marginBottom: '8px', fontSize: '15px' }}>
              Resumo Executivo da Reunião
            </h4>
            <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '6px' }}>
              Tema: {resumo.tema || 'Alinhamento Geral'}
            </div>
            {resumo.contexto && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem', marginTop: '8px' }}>
                {resumo.contexto.problema && (
                  <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                    <strong style={{ color: 'var(--text-main)' }}>Problema Principal:</strong> {resumo.contexto.problema}
                  </div>
                )}
                {resumo.contexto.decisao && (
                  <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                    <strong style={{ color: 'var(--text-main)' }}>Decisão/Encaminhamento:</strong> {resumo.contexto.decisao}
                  </div>
                )}
              </div>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '2rem' }}>
            {/* Lado Esquerdo: Mini Dashboard da Reunião */}
            <div style={{ background: 'var(--bg-main)', borderRadius: '8px', padding: '1.5rem', border: '1px solid var(--border-color)' }}>
              <h4 style={{ color: 'var(--text-main)', marginBottom: '1.5rem' }}>Dashboard da Reunião</h4>
              <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
                <div style={{ flex: 1, background: 'var(--panel-bg)', padding: '1rem', borderRadius: '6px', border: '1px solid var(--border-color)', textAlign: 'center' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>Temas Abordados</div>
                  <div style={{ fontSize: '1.8rem', fontWeight: 'bold', color: 'var(--primary-color)' }}>{resumo.organizacao_por_temas?.length || 0}</div>
                </div>
                <div style={{ flex: 1, background: 'var(--panel-bg)', padding: '1rem', borderRadius: '6px', border: '1px solid var(--border-color)', textAlign: 'center' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>Dores Mapeadas</div>
                  <div style={{ fontSize: '1.8rem', fontWeight: 'bold', color: '#ef4444' }}>{resumo.dores?.length || 0}</div>
                </div>
              </div>

              <h5 style={{ color: 'var(--text-main)', marginBottom: '1rem', fontSize: '13px' }}>Progresso do Plano de Ação</h5>
              {resumo.tarefas && resumo.tarefas.length > 0 ? (() => {
                const counts = { 'Não Inicializado': 0, 'Em Andamento': 0, 'Concluído': 0 };
                resumo.tarefas.forEach(t => {
                  const s = t.status || 'Não Inicializado';
                  counts[s] = (counts[s] || 0) + 1;
                });
                const pieData = [
                  { name: 'Não Inicializado', value: counts['Não Inicializado'], color: '#6b7280' },
                  { name: 'Em Andamento', value: counts['Em Andamento'], color: '#f59e0b' },
                  { name: 'Concluído', value: counts['Concluído'], color: '#10b981' }
                ].filter(d => d.value > 0);
                return (
                  <div style={{ height: '200px', width: '100%' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80} stroke="none">
                          {pieData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={{ background: 'var(--panel-bg)', borderColor: 'var(--border-color)', color: 'var(--text-main)', borderRadius: '8px' }} itemStyle={{ color: 'var(--text-main)' }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                );
              })() : (
                <p style={{ color: 'var(--text-muted)', fontSize: '12px', textAlign: 'center', marginTop: '2rem' }}>Nenhuma tarefa gerada.</p>
              )}

              {/* SLIDE 12 — Dores categorizadas com o trecho */}
              {resumo.dores && resumo.dores.length > 0 && (
                <div style={{ marginTop: '1.5rem' }}>
                  <h5 style={{ color: '#ef4444', marginBottom: '0.8rem', fontSize: '13px' }}>🚨 Gatilhos & Dores Detectados</h5>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '220px', overflowY: 'auto' }}>
                    {resumo.dores.map((dor, dIndex) => {
                      const isObj = typeof dor === 'object' && dor !== null;
                      const categoria = isObj ? dor.categoria : 'outro';
                      const label = DORES_LABELS[categoria] || 'Ponto de atenção';
                      const cor = DORES_CORES[categoria] || '#a1a1aa';
                      return (
                        <div key={dIndex} style={{ background: 'var(--panel-bg)', border: `1px solid ${cor}44`, borderLeft: `3px solid ${cor}`, borderRadius: '6px', padding: '8px 10px' }}>
                          <div style={{ fontSize: '10px', color: cor, textTransform: 'uppercase', fontWeight: 600, marginBottom: '3px' }}>{label}</div>
                          <div style={{ fontSize: '12px', color: 'var(--text-main)' }}>{isObj ? (dor.descricao || dor.trecho) : dor}</div>
                          {isObj && dor.trecho && (
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic', marginTop: '3px' }}>"{dor.trecho}"</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Lado Direito: Plano de Ação */}
            <ActionPlanTable
              meetingId={meeting.ID_MEETING}
              tarefas={resumo.tarefas || []}
              dores={resumo.dores || []}
              sistemasTotvs={sistemasTotvs}
              enviosPorReuniao={enviosPorReuniao}
              onTaskStatusChange={onTaskStatusChange}
              onEnviarIntegracao={onEnviarIntegracao}
              onOpenConfig={onOpenConfig}
            />
          </div>
        </>
      ) : (
        <p style={{ color: 'var(--text-muted)', textAlign: 'center', margin: '2rem 0' }}>
          Nenhum resumo disponível. Sintetize a reunião para extrair os insights.
        </p>
      )}
    </div>
  );
}
