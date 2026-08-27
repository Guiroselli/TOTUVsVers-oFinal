import React from 'react';

export default function EvidenceModal({ isOpen, onClose, drilldownData, onOpenMeeting }) {
  if (!isOpen || !drilldownData) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 300,
        padding: '1.5rem',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--panel-bg)',
          border: '1px solid var(--border-color)',
          borderRadius: '12px',
          maxWidth: '750px',
          width: '100%',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          padding: '1.25rem 1.5rem',
          borderBottom: '1px solid var(--border-color)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{
                background: 'rgba(14, 165, 233, 0.15)',
                color: 'var(--primary-color)',
                fontSize: '11px',
                fontWeight: 600,
                padding: '2px 8px',
                borderRadius: '4px',
                textTransform: 'uppercase'
              }}>
                {drilldownData.metric_type}
              </span>
              <h3 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--text-main)' }}>
                {drilldownData.metric_key}
              </h3>
            </div>
            <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>
              Encontradas <strong>{drilldownData.total}</strong> reunião(ões) com evidências deste indicador.
            </p>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              fontSize: '20px',
              cursor: 'pointer',
              padding: '4px 8px',
              borderRadius: '4px',
            }}
          >
            ✕
          </button>
        </div>

        {/* Content list */}
        <div style={{ padding: '1.5rem', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {drilldownData.items && drilldownData.items.length > 0 ? (
            drilldownData.items.map((item, idx) => (
              <div
                key={idx}
                style={{
                  background: 'var(--bg-main)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  padding: '1rem 1.25rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', flexWrap: 'wrap', gap: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontWeight: 600, color: 'var(--primary-color)', fontSize: '13px' }}>
                      ID #{item.meeting_id}
                    </span>
                    <span className="badge" style={{ fontSize: '10px' }}>
                      {item.cliente || 'Geral'}
                    </span>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      📅 {item.data || 'Data não informada'}
                    </span>
                  </div>

                  {item.urgencia && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{
                        fontSize: '11px',
                        padding: '2px 8px',
                        borderRadius: '10px',
                        fontWeight: 600,
                        background: item.urgencia === 'Crítica' || item.urgencia === 'Alta' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                        color: item.urgencia === 'Crítica' || item.urgencia === 'Alta' ? 'var(--danger)' : 'var(--warning)',
                      }}>
                        Urgência: {item.urgencia}
                      </span>
                      {onOpenMeeting && (
                        <button
                          onClick={() => {
                            onOpenMeeting(item.meeting_id);
                            onClose();
                          }}
                          style={{
                            padding: '3px 8px',
                            borderRadius: '4px',
                            background: 'transparent',
                            border: '1px solid var(--primary-color)',
                            color: 'var(--primary-color)',
                            fontSize: '11px',
                            cursor: 'pointer'
                          }}
                        >
                          Ver no Histórico →
                        </button>
                      )}
                    </div>
                  )}
                </div>

                <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-main)', marginBottom: '8px' }}>
                  {item.tema}
                </div>

                {/* Evidências textuais */}
                {item.evidencias && item.evidencias.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '6px' }}>
                    {item.evidencias.map((ev, eIdx) => (
                      <div
                        key={eIdx}
                        style={{
                          fontSize: '12px',
                          color: 'var(--text-muted)',
                          background: 'rgba(0, 0, 0, 0.25)',
                          padding: '6px 10px',
                          borderRadius: '6px',
                          borderLeft: '3px solid var(--primary-color)',
                          lineHeight: 1.4,
                        }}
                      >
                        {ev}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))
          ) : (
            <p style={{ textAlign: 'center', color: 'var(--text-muted)', margin: '2rem 0' }}>
              Nenhuma evidência textual direta encontrada para esta métrica.
            </p>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '1rem 1.5rem',
          borderTop: '1px solid var(--border-color)',
          display: 'flex',
          justifyContent: 'flex-end',
        }}>
          <button
            onClick={onClose}
            className="btn-primary"
            style={{ padding: '7px 18px', fontSize: '13px' }}
          >
            Fechar Visualização
          </button>
        </div>
      </div>
    </div>
  );
}
