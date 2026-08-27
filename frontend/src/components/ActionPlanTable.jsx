import React from 'react';

const DORES_SISTEMAS = {
  aprovacao_pendente: 'fluig',
  documento_faltando: 'fluig',
  insatisfacao_cliente: 'crm',
  atraso_prazo: 'protheus',
  gargalo_operacional: 'protheus',
  falta_metricas: 'analytics',
  problemas_equipe: 'rh',
  gestao_estoque: 'supply',
  outro: 'fluig',
};

export default function ActionPlanTable({
  meetingId,
  tarefas = [],
  dores = [],
  sistemasTotvs = {},
  enviosPorReuniao = {},
  onTaskStatusChange,
  onEnviarIntegracao,
  onOpenConfig
}) {
  let sistemasParaSugerir = [];
  if (dores && dores.length > 0) {
    sistemasParaSugerir = Array.from(new Set(dores.map(dor => {
      const cat = (typeof dor === 'object' && dor !== null) ? dor.categoria : 'outro';
      return DORES_SISTEMAS[cat] || 'fluig';
    }).filter(Boolean)));
  }
  if (sistemasParaSugerir.length === 0) {
    sistemasParaSugerir = ['fluig'];
  }
  sistemasParaSugerir = sistemasParaSugerir.slice(0, 3);

  return (
    <div>
      <h4 style={{ marginBottom: '1rem', color: 'var(--primary-color)' }}>Plano de Ação</h4>
      {tarefas && tarefas.length > 0 ? (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-color)', textAlign: 'left', color: 'var(--text-muted)' }}>
                <th style={{ padding: '8px' }}>Tarefa</th>
                <th style={{ padding: '8px' }}>Responsável</th>
                <th style={{ padding: '8px' }}>Prazo</th>
                <th style={{ padding: '8px' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {tarefas.map((tarefa, tIndex) => (
                <tr key={tIndex} style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <td style={{ padding: '8px', color: 'var(--text-main)' }}>{tarefa.tarefa}</td>
                  <td style={{ padding: '8px', color: 'var(--text-main)' }}>{tarefa.responsavel || 'Não identificado'}</td>
                  <td style={{ padding: '8px', color: 'var(--text-main)' }}>{tarefa.prazo || 'Não mencionado'}</td>
                  <td style={{ padding: '8px' }}>
                    <select
                      value={tarefa.status || 'Não Inicializado'}
                      onChange={(e) => onTaskStatusChange && onTaskStatusChange(meetingId, tIndex, e.target.value)}
                      style={{
                        padding: '4px 8px',
                        borderRadius: '4px',
                        background: 'var(--bg-main)',
                        color: 'var(--text-main)',
                        border: '1px solid var(--border-color)',
                        outline: 'none',
                        fontSize: '12px',
                        cursor: 'pointer'
                      }}
                    >
                      <option value="Não Inicializado">Não Inicializado</option>
                      <option value="Em Andamento">Em Andamento</option>
                      <option value="Concluído">Concluído</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
          Nenhuma tarefa gerada para este plano de ação.
        </p>
      )}

      {/* Ecossistema TOTVS */}
      <div style={{ marginTop: '1.5rem', paddingTop: '1.2rem', borderTop: '1px solid var(--border-color)' }}>
        <h5 style={{ color: 'var(--text-main)', marginBottom: '0.8rem', fontSize: '13px' }}>
          Ecossistema TOTVS — Sugestões de Solução
        </h5>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {sistemasParaSugerir.map((chave) => {
            const info = sistemasTotvs[chave] || {
              nome: chave === 'fluig' ? 'TOTVS Fluig' : chave === 'crm' ? 'TOTVS CRM Gestão de Clientes' : 'TOTVS Protheus',
              uso: 'Solução recomendada para os pontos mapeados.'
            };
            const chaveEnvio = `${meetingId}_${chave}`;
            const statusEnvio = enviosPorReuniao[chaveEnvio];
            
            return (
              <button
                key={chave}
                onClick={() => onEnviarIntegracao && onEnviarIntegracao(meetingId, chave, tarefas)}
                disabled={statusEnvio === 'enviando'}
                title={info.uso}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 12px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  cursor: 'pointer',
                  background: statusEnvio?.startsWith('ok') ? 'rgba(16,185,129,0.15)' : 'var(--panel-bg)',
                  border: `1px solid ${statusEnvio?.startsWith('ok') ? 'var(--success)' : 'var(--border-color)'}`,
                  color: statusEnvio?.startsWith('ok') ? 'var(--success)' : 'var(--text-main)',
                  transition: 'all 0.2s ease'
                }}
              >
                {statusEnvio === 'enviando' ? 'Enviando...' :
                 statusEnvio === 'ok_simulado' ? `✓ Simulado — ${info.nome}` :
                 statusEnvio === 'ok_real' ? `✓ Enviado — ${info.nome}` :
                 statusEnvio === 'erro' ? `✗ Erro — ${info.nome}` :
                 `Resolver com ${info.nome}`}
              </button>
            );
          })}
        </div>

        {Object.values(sistemasTotvs).some(s => !s.configurado) && (
          <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px' }}>
            Sem credenciais ainda, os envios ficam registrados localmente (modo simulado). Configure em{' '}
            <button
              onClick={onOpenConfig}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--primary-color)',
                cursor: 'pointer',
                textDecoration: 'underline',
                padding: 0,
                fontSize: '11px'
              }}
            >
              Ecossistema TOTVS
            </button>.
          </p>
        )}
      </div>
    </div>
  );
}
