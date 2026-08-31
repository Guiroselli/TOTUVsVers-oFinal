import React, { useState } from 'react';

export default function TotvsProductRecommendations({
  meetingId,
  recommendations = [],
  sistemasTotvs = {},
  enviosPorReuniao = {},
  onConfirmRecommendation,
  onEnviarIntegracao,
  onOpenConfig,
  tarefas = []
}) {
  const [expandedKey, setExpandedKey] = useState(null);
  const [evidenceModalKey, setEvidenceModalKey] = useState(null);

  if (!recommendations || recommendations.length === 0) {
    return (
      <div style={{
        marginTop: '1.5rem',
        padding: '1rem',
        background: 'var(--panel-bg)',
        borderRadius: '8px',
        border: '1px solid var(--border-color)',
        color: 'var(--text-muted)',
        fontSize: '13px'
      }}>
        ℹ️ Nenhuma recomendação TOTVS com evidência suficiente encontrada para esta reunião.
      </div>
    );
  }

  const toggleDetails = (key) => {
    setExpandedKey(expandedKey === key ? null : key);
  };

  const activeModalRec = recommendations.find(r => r.product_key === evidenceModalKey);

  return (
    <div style={{ marginTop: '1.5rem', paddingTop: '1.2rem', borderTop: '1px solid var(--border-color)' }}>
      {/* Header com Legenda Explicativa de Fit Score */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h5 style={{ color: 'var(--text-main)', margin: '0 0 2px 0', fontSize: '14px', fontWeight: 600 }}>
              Recomendações Estruturantes do Ecossistema TOTVS
            </h5>
            <span style={{
              fontSize: '10px',
              padding: '1px 6px',
              borderRadius: '4px',
              background: 'rgba(0, 210, 255, 0.1)',
              color: 'var(--primary-color)',
              border: '1px solid rgba(0, 210, 255, 0.2)'
            }}>
              v2.1
            </span>
          </div>
          <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '11px' }}>
            <strong>Legenda do Fit Score:</strong> O percentual mede a <em>adequação funcional</em> (Dores 35% + Tarefas 25% + Urgência 15% + Segmento 15% + Integração 10%), não a certeza absoluta de implantação.
          </p>
        </div>

        <button
          onClick={onOpenConfig}
          style={{
            padding: '5px 12px',
            borderRadius: '6px',
            background: 'var(--bg-main)',
            border: '1px solid var(--border-color)',
            color: 'var(--primary-color)',
            fontSize: '11px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          <span>⚙️</span> Configurar Webhooks TOTVS
        </button>
      </div>

      {/* Grid de Cards TOTVS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem' }}>
        {recommendations.map((rec) => {
          const key = rec.product_key;
          const isExpanded = expandedKey === key;
          const fitPercent = Math.round((rec.fit_score || 0) * 100);
          const confPercent = Math.round((rec.confidence || 0) * 100);
          const status = rec.review_status || 'pending';
          const isConfigurado = Boolean(sistemasTotvs[key]?.configurado || rec.integration_status === 'real');
          const chaveEnvio = `${meetingId}_${key}`;
          const envioStatus = enviosPorReuniao[chaveEnvio];
          const isInsufficientEvidence = rec.confidence < 0.50;

          const totalDoresCount = (rec.trigger_pains || []).length;
          const totalTarefasCount = (rec.trigger_tasks || []).length;

          return (
            <div
              key={key}
              style={{
                background: 'var(--panel-bg)',
                border: `1px solid ${
                  status === 'confirmed' ? 'rgba(16, 185, 129, 0.4)' :
                  status === 'rejected' ? 'rgba(239, 68, 68, 0.4)' :
                  'var(--border-color)'
                }`,
                borderRadius: '8px',
                padding: '1.1rem',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                transition: 'all 0.2s ease',
                position: 'relative'
              }}
            >
              <div>
                {/* Header do Card */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '8px', gap: '8px' }}>
                  <div>
                    <h6 style={{ margin: '0 0 2px 0', fontSize: '14px', color: 'var(--text-main)', fontWeight: 600 }}>
                      {rec.product_name}
                    </h6>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      {rec.product_area}
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-end' }}>
                    <span style={{
                      fontSize: '11px',
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: '12px',
                      background: fitPercent >= 60 ? 'rgba(0, 210, 255, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                      color: fitPercent >= 60 ? 'var(--primary-color)' : 'var(--warning)',
                      border: `1px solid ${fitPercent >= 60 ? 'var(--primary-color)' : 'var(--warning)'}`
                    }}>
                      Adequação ao caso: {fitPercent}%
                    </span>

                    <span style={{
                      fontSize: '10px',
                      fontWeight: 600,
                      padding: '2px 6px',
                      borderRadius: '4px',
                      background: confPercent >= 70 ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                      color: confPercent >= 70 ? 'var(--success)' : 'var(--warning)'
                    }}>
                      Confiança das evidências: {confPercent}%
                    </span>

                    <span style={{
                      fontSize: '10px',
                      padding: '2px 6px',
                      borderRadius: '10px',
                      fontWeight: 600,
                      background: status === 'confirmed' ? 'rgba(16, 185, 129, 0.2)' : status === 'rejected' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(255, 255, 255, 0.1)',
                      color: status === 'confirmed' ? 'var(--success)' : status === 'rejected' ? 'var(--danger)' : 'var(--text-muted)'
                    }}>
                      {status === 'confirmed' ? '✓ Confirmada' : status === 'rejected' ? '✗ Rejeitada' : 'Revisão Pendente'}
                    </span>
                  </div>
                </div>

                {/* Badge de Confiança / Alerta de Evidência Insuficiente */}
                <div style={{ marginBottom: '8px' }}>
                  {isInsufficientEvidence ? (
                    <span style={{
                      fontSize: '10px',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      background: 'rgba(245, 158, 11, 0.15)',
                      color: 'var(--warning)',
                      display: 'inline-block'
                    }}>
                      ⚠️ Evidência insuficiente para recomendar com segurança ({confPercent}%)
                    </span>
                  ) : (
                    <span style={{
                      fontSize: '10px',
                      color: 'var(--text-muted)'
                    }}>
                      Confiança da Evidência: <strong>{confPercent}%</strong> ({rec.confidence_label || 'Alta'})
                    </span>
                  )}
                </div>

                {/* Justificativa Explicável */}
                <p style={{ fontSize: '12px', color: 'var(--text-main)', lineHeight: '1.4', margin: '8px 0' }}>
                  {rec.why_recommended}
                </p>

                {/* Dores e Tarefas com Contadores */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', margin: '10px 0' }}>
                  {totalDoresCount > 0 && (
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      <strong style={{ color: 'var(--warning)' }}>Dores atendidas ({totalDoresCount}):</strong>{' '}
                      {rec.trigger_pains.slice(0, 2).map(p => p.label || p.categoria).join(', ')}
                      {totalDoresCount > 2 && ` +${totalDoresCount - 2}`}
                    </div>
                  )}

                  {totalTarefasCount > 0 && (
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      <strong style={{ color: 'var(--primary-color)' }}>Tarefas compatíveis ({totalTarefasCount}):</strong>{' '}
                      {rec.trigger_tasks[0]?.task}
                      {totalTarefasCount > 1 && ` (+${totalTarefasCount - 1} outra(s))`}
                    </div>
                  )}

                  {/* Botão Ver Todas as Evidências */}
                  {(totalDoresCount > 0 || totalTarefasCount > 0 || (rec.all_evidences && rec.all_evidences.length > 0)) && (
                    <button
                      onClick={() => setEvidenceModalKey(key)}
                      style={{
                        alignSelf: 'flex-start',
                        background: 'none',
                        border: 'none',
                        color: 'var(--primary-color)',
                        fontSize: '11px',
                        cursor: 'pointer',
                        padding: 0,
                        textDecoration: 'underline'
                      }}
                    >
                      🔍 Ver todas as evidências ({totalDoresCount + totalTarefasCount})
                    </button>
                  )}
                </div>

                {/* Próximo Passo */}
                {rec.implementation_next_step && (
                  <div style={{
                    fontSize: '11px',
                    padding: '6px 8px',
                    borderRadius: '4px',
                    background: 'rgba(0, 210, 255, 0.05)',
                    borderLeft: '2px solid var(--primary-color)',
                    color: 'var(--text-main)',
                    margin: '8px 0'
                  }}>
                    <strong>Próximo passo:</strong> {rec.implementation_next_step}
                  </div>
                )}

                {/* Drawer Expandido de Detalhes */}
                {isExpanded && (
                  <div style={{
                    marginTop: '8px',
                    paddingTop: '8px',
                    borderTop: '1px dashed var(--border-color)',
                    fontSize: '11px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px'
                  }}>
                    {rec.recommended_capabilities && (
                      <div>
                        <strong style={{ color: 'var(--primary-color)' }}>Capacidades Compatíveis:</strong>
                        <ul style={{ paddingLeft: '16px', margin: '4px 0', color: 'var(--text-muted)' }}>
                          {rec.recommended_capabilities.map((cap, i) => (
                            <li key={i}>{cap}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {rec.expected_benefits && (
                      <div>
                        <strong style={{ color: 'var(--success)' }}>Benefícios Esperados:</strong>
                        <ul style={{ paddingLeft: '16px', margin: '4px 0', color: 'var(--text-muted)' }}>
                          {rec.expected_benefits.map((ben, i) => (
                            <li key={i}>{ben}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {rec.score_breakdown && (
                      <div style={{ background: 'rgba(0,0,0,0.2)', padding: '6px', borderRadius: '4px' }}>
                        <strong>Fatores da Pontuação (Score Breakdown):</strong>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', marginTop: '4px', color: 'var(--text-muted)' }}>
                          <span>Dores (35%): {Math.round((rec.score_breakdown.pain_coverage || 0) * 100)}%</span>
                          <span>Tarefas (25%): {Math.round((rec.score_breakdown.task_fit || 0) * 100)}%</span>
                          <span>Urgência (15%): {Math.round((rec.score_breakdown.urgency_weight || 0) * 100)}%</span>
                          <span>Segmento (15%): {Math.round((rec.score_breakdown.segment_fit || 0) * 100)}%</span>
                          <span>Integração (10%): {Math.round((rec.score_breakdown.integration_availability || 0) * 100)}%</span>
                        </div>
                      </div>
                    )}

                    {rec.missing_data && rec.missing_data.length > 0 && (
                      <div style={{ color: 'var(--warning)', fontSize: '10px' }}>
                        <strong>Dados faltantes para envio real:</strong> {rec.missing_data.join(', ')}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Ações e Botões do Card */}
              <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                  <button
                    onClick={() => toggleDetails(key)}
                    style={{
                      padding: '5px 8px',
                      borderRadius: '4px',
                      background: 'transparent',
                      border: '1px solid var(--border-color)',
                      color: 'var(--text-muted)',
                      fontSize: '11px',
                      cursor: 'pointer'
                    }}
                  >
                    {isExpanded ? '▲ Menos detalhes' : '▼ Ver detalhes'}
                  </button>

                  {status !== 'confirmed' && (
                    <button
                      onClick={() => onConfirmRecommendation && onConfirmRecommendation(meetingId, key, 'confirm')}
                      style={{
                        padding: '5px 10px',
                        borderRadius: '4px',
                        background: 'rgba(16, 185, 129, 0.15)',
                        border: '1px solid var(--success)',
                        color: 'var(--success)',
                        fontSize: '11px',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                      title="Confirmar recomendação"
                    >
                      ✓ Confirmar
                    </button>
                  )}

                  {status === 'confirmed' && (
                    <button
                      onClick={() => onConfirmRecommendation && onConfirmRecommendation(meetingId, key, 'reject')}
                      style={{
                        padding: '5px 8px',
                        borderRadius: '4px',
                        background: 'transparent',
                        border: '1px solid rgba(255,255,255,0.2)',
                        color: 'var(--text-muted)',
                        fontSize: '10px',
                        cursor: 'pointer'
                      }}
                      title="Desfazer confirmação"
                    >
                      Desfazer
                    </button>
                  )}

                  {status !== 'rejected' && status !== 'confirmed' && (
                    <button
                      onClick={() => onConfirmRecommendation && onConfirmRecommendation(meetingId, key, 'reject')}
                      style={{
                        padding: '5px 8px',
                        borderRadius: '4px',
                        background: 'transparent',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        color: 'var(--danger)',
                        fontSize: '11px',
                        cursor: 'pointer'
                      }}
                      title="Rejeitar recomendação"
                    >
                      ✕ Rejeitar
                    </button>
                  )}

                  {/* Botão de Envio (Bloqueado se não confirmada) */}
                  <button
                    onClick={() => onEnviarIntegracao && onEnviarIntegracao(meetingId, key, tarefas, !isConfigurado, rec.id)}
                    disabled={status !== 'confirmed' || envioStatus === 'enviando'}
                    style={{
                      flex: 1,
                      minWidth: '130px',
                      padding: '5px 10px',
                      borderRadius: '4px',
                      background: status !== 'confirmed'
                        ? 'rgba(255, 255, 255, 0.05)'
                        : envioStatus?.startsWith('ok') ? 'rgba(16, 185, 129, 0.2)' : 'var(--primary-color)',
                      border: 'none',
                      color: status !== 'confirmed' ? 'var(--text-muted)' : (envioStatus?.startsWith('ok') ? 'var(--success)' : '#000'),
                      fontSize: '11px',
                      fontWeight: 600,
                      cursor: status !== 'confirmed' ? 'not-allowed' : 'pointer',
                      transition: 'all 0.2s ease'
                    }}
                    title={status !== 'confirmed' ? 'Envio bloqueado: Confirme a recomendação acima antes de enviar tarefas' : 'Enviar tarefas para integração'}
                  >
                    {envioStatus === 'enviando' ? 'Enviando...' :
                     envioStatus === 'ok_simulado' ? '✓ Simulado' :
                     envioStatus === 'ok_real' ? '✓ Enviado Real' :
                     envioStatus === 'erro' ? '✗ Falha no Envio' :
                     (isConfigurado ? '🚀 Enviar Tarefas' : '🧪 Enviar (Simulado)')}
                  </button>
                </div>

                {!isConfigurado && status === 'confirmed' && (
                  <div style={{ fontSize: '10px', color: 'var(--warning)', marginTop: '4px', textAlign: 'right' }}>
                    Simulação local — nenhuma informação foi enviada à TOTVS.
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal / Drawer de Todas as Evidências */}
      {activeModalRec && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.75)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '1rem'
        }}>
          <div style={{
            background: 'var(--panel-bg)',
            border: '1px solid var(--border-color)',
            borderRadius: '8px',
            maxWidth: '600px',
            width: '100%',
            maxHeight: '80vh',
            overflowY: 'auto',
            padding: '1.5rem'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h5 style={{ margin: 0, color: 'var(--text-main)', fontSize: '16px' }}>
                Evidências Textuais: {activeModalRec.product_name}
              </h5>
              <button
                onClick={() => setEvidenceModalKey(null)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-muted)',
                  fontSize: '18px',
                  cursor: 'pointer'
                }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '12px' }}>
              <div>
                <strong style={{ color: 'var(--warning)' }}>Dores Identificadas na Reunião:</strong>
                {activeModalRec.trigger_pains?.length > 0 ? (
                  <div style={{ marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {activeModalRec.trigger_pains.map((p, i) => (
                      <div key={i} style={{ padding: '8px', background: 'rgba(255,255,255,0.03)', borderRadius: '4px' }}>
                        <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>{p.label || p.categoria}</div>
                        {p.evidence && (
                          <div style={{ fontStyle: 'italic', color: 'var(--text-muted)', marginTop: '2px' }}>
                            "{p.evidence}"
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ color: 'var(--text-muted)' }}>Nenhuma dor direta mapeada.</p>
                )}
              </div>

              <div>
                <strong style={{ color: 'var(--primary-color)' }}>Tarefas Compatíveis:</strong>
                {activeModalRec.trigger_tasks?.length > 0 ? (
                  <div style={{ marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {activeModalRec.trigger_tasks.map((t, i) => (
                      <div key={i} style={{ padding: '8px', background: 'rgba(255,255,255,0.03)', borderRadius: '4px' }}>
                        <div style={{ color: 'var(--text-main)' }}>{t.task}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                          Responsável: {t.responsible} | Prazo: {t.due_date}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ color: 'var(--text-muted)' }}>Nenhuma tarefa específica associada.</p>
                )}
              </div>
            </div>

            <div style={{ marginTop: '1.5rem', textAlign: 'right' }}>
              <button
                onClick={() => setEvidenceModalKey(null)}
                style={{
                  padding: '6px 14px',
                  borderRadius: '4px',
                  background: 'var(--primary-color)',
                  border: 'none',
                  color: '#000',
                  fontWeight: 600,
                  fontSize: '12px',
                  cursor: 'pointer'
                }}
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
