import React, { useState } from 'react';
import { Check, X, Pencil, Zap } from 'lucide-react';

export default function MeetingFieldSuggestions({
  meetingId,
  suggestions,
  onConfirmSuggestion,
  loadingAction
}) {
  const [editingField, setEditingField] = useState(null);
  const [editValue, setEditValue] = useState('');

  if (!suggestions || Object.keys(suggestions).length === 0) {
    return null;
  }

  const handleStartEdit = (fieldName, currentValue) => {
    setEditingField(fieldName);
    if (Array.isArray(currentValue)) {
      setEditValue(currentValue.join(', '));
    } else {
      setEditValue(currentValue !== null && currentValue !== undefined ? String(currentValue) : '');
    }
  };

  const handleSaveEdit = async (fieldName) => {
    if (onConfirmSuggestion) {
      let finalVal = editValue;
      if (fieldName === 'participantes') {
        finalVal = editValue.split(',').map(s => s.trim()).filter(Boolean);
      }
      await onConfirmSuggestion(meetingId, fieldName, 'edit', finalVal);
    }
    setEditingField(null);
  };

  const handleCancelEdit = () => {
    setEditingField(null);
    setEditValue('');
  };

  const handlePickCandidate = async (fieldName, candidateName) => {
    if (onConfirmSuggestion) {
      await onConfirmSuggestion(meetingId, fieldName, 'edit', candidateName);
    }
  };

  return (
    <div className="ai-suggestions-panel" style={{
      background: 'var(--panel-bg)',
      border: '1px solid var(--border-color)',
      borderRadius: '8px',
      padding: '1.25rem',
      marginBottom: '1.5rem',
      boxShadow: 'var(--glass-shadow)'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            width: '24px',
            height: '24px',
            borderRadius: '50%',
            background: 'rgba(2, 132, 199, 0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--primary-light)'
          }}>
            <Zap size={13} />
          </div>
          <h4 style={{ margin: 0, fontSize: '14px', color: 'var(--text-main)', fontWeight: 600 }}>
            Campos e Sugestões Identificados pela IA
          </h4>
        </div>
        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
          Confirmação ou edição manual prevalece sobre qualquer sugestão
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem' }}>
        {Object.entries(suggestions).map(([fieldName, sug]) => {
          const isEditing = editingField === fieldName;
          const status = sug.review_status || 'pending';
          const confPercent = Math.round((sug.confidence || 0) * 100);
          const candidates = sug.candidates || [];
          
          let confColor = 'var(--success)';
          if (confPercent < 60) confColor = 'var(--danger)';
          else if (confPercent < 80) confColor = 'var(--warning)';

          // Formatação do valor exibido
          let displayVal = sug.suggested_value;
          if (status === 'confirmed' && sug.confirmed_value !== null && sug.confirmed_value !== undefined) {
            displayVal = sug.confirmed_value;
          }
          if (Array.isArray(displayVal)) {
            displayVal = displayVal.length > 0 ? displayVal.join(', ') : 'Nenhum identificado';
          } else if (displayVal === null || displayVal === undefined || displayVal === '') {
            displayVal = 'Não identificado';
          }

          return (
            <div key={fieldName} style={{
              background: 'var(--panel-bg)',
              border: `1px solid ${status === 'confirmed' ? 'rgba(16, 185, 129, 0.35)' : status === 'rejected' ? 'rgba(239, 68, 68, 0.35)' : 'var(--border-color)'}`,
              borderRadius: '8px',
              padding: '1rem',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              position: 'relative'
            }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--primary-color)', fontWeight: 600, letterSpacing: '0.04em' }}>
                    {sug.label || fieldName.replace('_', ' ')}
                  </span>
                  
                  <span style={{
                    fontSize: '10px',
                    padding: '2px 8px',
                    borderRadius: '10px',
                    fontWeight: 600,
                    background: status === 'confirmed' ? 'rgba(16, 185, 129, 0.15)' : status === 'rejected' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                    color: status === 'confirmed' ? 'var(--success)' : status === 'rejected' ? 'var(--danger)' : 'var(--warning)',
                  }}>
                    {status === 'confirmed' ? 'Confirmado' : status === 'rejected' ? 'Rejeitado' : 'Pendente'}
                  </span>
                </div>

                {isEditing ? (
                  <div style={{ marginBottom: '8px' }}>
                    <input
                      type="text"
                      className="input-pf"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      style={{
                        width: '100%',
                        fontSize: '13px',
                        marginBottom: '6px'
                      }}
                      autoFocus
                    />
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        onClick={() => handleSaveEdit(fieldName)}
                        className="btn-pf btn-pf-primary btn-pf-sm"
                      >
                        <Check size={12} />
                        <span>Salvar</span>
                      </button>
                      <button
                        onClick={handleCancelEdit}
                        className="btn-pf btn-pf-secondary btn-pf-sm"
                      >
                        <X size={12} />
                        <span>Cancelar</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '8px', wordBreak: 'break-word' }}>
                    {displayVal}
                  </div>
                )}

                {/* Confiança */}
                <div style={{ marginBottom: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '3px' }}>
                    <span>Confiança da IA</span>
                    <span style={{ color: confColor, fontWeight: 600 }}>{confPercent}%</span>
                  </div>
                  <div style={{ height: '4px', background: 'var(--bg-main)', borderRadius: '2px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${confPercent}%`, background: confColor, borderRadius: '2px', transition: 'width 0.3s' }}></div>
                  </div>
                </div>

                {/* Evidência Textual */}
                {sug.evidence && (
                  <div style={{
                    fontSize: '11px',
                    color: 'var(--text-muted)',
                    fontStyle: 'italic',
                    background: 'var(--panel-hover)',
                    padding: '6px 8px',
                    borderRadius: '4px',
                    border: '1px solid var(--border-color)',
                    borderLeft: '3px solid var(--primary-color)',
                    marginBottom: '8px',
                    maxHeight: '65px',
                    overflowY: 'auto'
                  }}>
                    "{sug.evidence}"
                  </div>
                )}

                {/* Lista de Múltiplos Candidatos (Seção 2) */}
                {candidates && candidates.length > 1 && status !== 'confirmed' && (
                  <div style={{
                    background: 'rgba(2, 132, 199, 0.08)',
                    border: '1px dashed rgba(56, 189, 248, 0.3)',
                    borderRadius: '6px',
                    padding: '6px 8px',
                    marginBottom: '8px'
                  }}>
                    <span style={{ fontSize: '10px', color: 'var(--primary-color)', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                      Candidatos Identificados:
                    </span>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {candidates.map((c, cIdx) => (
                        <div
                          key={cIdx}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            background: 'var(--bg-main)',
                            padding: '3px 6px',
                            borderRadius: '4px',
                            fontSize: '11px'
                          }}
                        >
                          <div>
                            <strong>{c.name}</strong> <span style={{ color: 'var(--text-muted)', fontSize: '10px' }}>({Math.round(c.score * 100)}% score)</span>
                            {c.reasons && c.reasons[0] && (
                              <div style={{ fontSize: '9px', color: 'var(--text-muted)' }}>{c.reasons[0]}</div>
                            )}
                          </div>
                          <button
                            onClick={() => handlePickCandidate(fieldName, c.name)}
                            className="btn-pf btn-pf-outline-blue btn-pf-sm"
                            style={{ padding: '2px 8px', fontSize: '10px', height: '22px' }}
                            title={`Selecionar candidato ${c.name}`}
                          >
                            Selecionar
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Botões de Ação */}
              {!isEditing && (
                <div style={{ display: 'flex', gap: '6px', marginTop: '6px', paddingTop: '8px', borderTop: '1px solid var(--border-color)' }}>
                  <button
                    onClick={() => onConfirmSuggestion && onConfirmSuggestion(meetingId, fieldName, 'confirm')}
                    disabled={loadingAction}
                    className="btn-pf btn-pf-primary btn-pf-sm"
                    style={{ flex: 1, padding: '5px 8px', fontSize: '11px', fontWeight: 600 }}
                    title="Aceitar a sugestão da IA e gravar no registro oficial"
                  >
                    <Check size={12} />
                    <span>Confirmar</span>
                  </button>

                  <button
                    onClick={() => handleStartEdit(fieldName, status === 'confirmed' ? sug.confirmed_value : sug.suggested_value)}
                    disabled={loadingAction}
                    className="btn-pf btn-pf-secondary btn-pf-sm"
                    style={{ padding: '5px 10px', fontSize: '11px' }}
                    title="Editar manualmente o valor"
                  >
                    <Pencil size={12} />
                    <span>Editar</span>
                  </button>

                  <button
                    onClick={() => onConfirmSuggestion && onConfirmSuggestion(meetingId, fieldName, 'reject')}
                    disabled={loadingAction}
                    className="btn-pf btn-pf-danger btn-pf-sm"
                    style={{ padding: '5px 8px', fontSize: '11px' }}
                    title="Rejeitar a sugestão automática"
                  >
                    <X size={12} />
                    <span>Ignorar</span>
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
