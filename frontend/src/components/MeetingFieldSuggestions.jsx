import React, { useState } from 'react';

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
    setEditValue(currentValue || '');
  };

  const handleSaveEdit = async (fieldName) => {
    if (onConfirmSuggestion) {
      await onConfirmSuggestion(meetingId, fieldName, 'edit', editValue);
    }
    setEditingField(null);
  };

  const handleCancelEdit = () => {
    setEditingField(null);
    setEditValue('');
  };

  return (
    <div className="ai-suggestions-panel" style={{
      background: 'linear-gradient(135deg, rgba(14, 165, 233, 0.05), rgba(15, 23, 42, 0.6))',
      border: '1px solid rgba(14, 165, 233, 0.3)',
      borderRadius: '10px',
      padding: '1.25rem',
      marginBottom: '1.5rem',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            width: '24px',
            height: '24px',
            borderRadius: '50%',
            background: 'rgba(14, 165, 233, 0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--primary-color)'
          }}>
            ⚡
          </div>
          <h4 style={{ margin: 0, fontSize: '14px', color: 'var(--text-main)', fontWeight: 600 }}>
            Campos Identificados pela IA
          </h4>
        </div>
        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
          Validação com confirmação humana obrigatória
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
        {Object.entries(suggestions).map(([fieldName, sug]) => {
          const isEditing = editingField === fieldName;
          const status = sug.review_status || 'pending';
          const confPercent = Math.round((sug.confidence || 0) * 100);
          
          let confColor = 'var(--success)';
          if (confPercent < 60) confColor = 'var(--danger)';
          else if (confPercent < 80) confColor = 'var(--warning)';

          return (
            <div key={fieldName} style={{
              background: 'var(--panel-bg)',
              border: `1px solid ${status === 'confirmed' ? 'rgba(16, 185, 129, 0.3)' : status === 'rejected' ? 'rgba(239, 68, 68, 0.3)' : 'var(--border-color)'}`,
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
                    {status === 'confirmed' ? '✓ Confirmado' : status === 'rejected' ? '✗ Rejeitado' : 'Pendente'}
                  </span>
                </div>

                {isEditing ? (
                  <div style={{ marginBottom: '8px' }}>
                    <input
                      type="text"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '6px 8px',
                        borderRadius: '4px',
                        background: 'var(--bg-main)',
                        border: '1px solid var(--primary-color)',
                        color: 'var(--text-main)',
                        fontSize: '13px',
                        outline: 'none',
                        marginBottom: '6px'
                      }}
                      autoFocus
                    />
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        onClick={() => handleSaveEdit(fieldName)}
                        style={{ padding: '4px 10px', borderRadius: '4px', background: 'var(--primary-color)', color: '#000', border: 'none', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}
                      >
                        Salvar
                      </button>
                      <button
                        onClick={handleCancelEdit}
                        style={{ padding: '4px 10px', borderRadius: '4px', background: 'var(--panel-bg)', color: 'var(--text-muted)', border: '1px solid var(--border-color)', fontSize: '11px', cursor: 'pointer' }}
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '8px', wordBreak: 'break-word' }}>
                    {status === 'confirmed' && sug.confirmed_value !== null ? sug.confirmed_value : (sug.suggested_value || 'Não identificado')}
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
                    background: 'rgba(0, 0, 0, 0.2)',
                    padding: '6px 8px',
                    borderRadius: '4px',
                    borderLeft: '2px solid var(--primary-color)',
                    marginBottom: '10px',
                    maxHeight: '70px',
                    overflowY: 'auto'
                  }}>
                    "{sug.evidence}"
                  </div>
                )}
              </div>

              {/* Botões de Ação */}
              {!isEditing && (
                <div style={{ display: 'flex', gap: '6px', marginTop: '6px', paddingTop: '8px', borderTop: '1px solid var(--border-color)' }}>
                  <button
                    onClick={() => onConfirmSuggestion && onConfirmSuggestion(meetingId, fieldName, 'confirm')}
                    disabled={loadingAction}
                    style={{
                      flex: 1,
                      padding: '5px 8px',
                      borderRadius: '4px',
                      background: status === 'confirmed' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(16, 185, 129, 0.1)',
                      border: '1px solid var(--success)',
                      color: 'var(--success)',
                      fontSize: '11px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '4px'
                    }}
                    title="Aceitar a sugestão da IA e gravar no registro oficial"
                  >
                    ✓ Confirmar
                  </button>

                  <button
                    onClick={() => handleStartEdit(fieldName, status === 'confirmed' ? sug.confirmed_value : sug.suggested_value)}
                    disabled={loadingAction}
                    style={{
                      padding: '5px 10px',
                      borderRadius: '4px',
                      background: 'var(--panel-bg)',
                      border: '1px solid var(--border-color)',
                      color: 'var(--text-main)',
                      fontSize: '11px',
                      cursor: 'pointer'
                    }}
                    title="Editar manualmente o valor"
                  >
                    ✎ Editar
                  </button>

                  <button
                    onClick={() => onConfirmSuggestion && onConfirmSuggestion(meetingId, fieldName, 'reject')}
                    disabled={loadingAction}
                    style={{
                      padding: '5px 8px',
                      borderRadius: '4px',
                      background: status === 'rejected' ? 'rgba(239, 68, 68, 0.2)' : 'transparent',
                      border: '1px solid rgba(239, 68, 68, 0.4)',
                      color: 'var(--danger)',
                      fontSize: '11px',
                      cursor: 'pointer'
                    }}
                    title="Rejeitar a sugestão automática"
                  >
                    ✕ Ignorar
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
