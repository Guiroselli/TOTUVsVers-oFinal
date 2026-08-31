import React, { useState, useEffect } from 'react';

export default function TotvsIntegrationModal({
  isOpen,
  onClose,
  sistemasTotvs = {},
  onSaveWebhook,
  onDeleteWebhook
}) {
  const [inputs, setInputs] = useState({});

  useEffect(() => {
    if (sistemasTotvs) {
      const initial = {};
      Object.keys(sistemasTotvs).forEach((k) => {
        initial[k] = '';
      });
      setInputs(initial);
    }
  }, [sistemasTotvs]);

  if (!isOpen) return null;

  const handleSave = async (sistema) => {
    if (onSaveWebhook && inputs[sistema]) {
      await onSaveWebhook(sistema, inputs[sistema]);
      setInputs(prev => ({ ...prev, [sistema]: '' }));
    }
  };

  const handleDelete = async (sistema) => {
    if (onDeleteWebhook) {
      await onDeleteWebhook(sistema);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.75)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 400,
        padding: '1rem',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--zoom-bg)',
          border: '1px solid var(--border-color)',
          borderRadius: '12px',
          padding: '2rem',
          maxWidth: '560px',
          width: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 20px 40px rgba(0,0,0,0.6)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <h3 style={{ color: 'var(--text-main)', margin: 0, fontSize: '1.25rem' }}>
            Ecossistema TOTVS
          </h3>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '20px', cursor: 'pointer' }}
          >
            ✕
          </button>
        </div>

        <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '18px', lineHeight: 1.5 }}>
          Conecte o Plano de Ação das reuniões diretamente aos produtos TOTVS. Para credenciais reais de API,
          acesse <a href="https://developers.totvs.com/" target="_blank" rel="noreferrer" style={{ color: 'var(--primary-color)', textDecoration: 'underline' }}>developers.totvs.com</a> ou{' '}
          <a href="https://api.totvs.com.br/" target="_blank" rel="noreferrer" style={{ color: 'var(--primary-color)', textDecoration: 'underline' }}>api.totvs.com.br</a>.
          Sem isso, os envios ficam registrados localmente em modo simulado.
        </p>

        {Object.entries(sistemasTotvs).map(([chave, info]) => (
          <div
            key={chave}
            style={{
              marginBottom: '14px',
              background: 'var(--panel-bg)',
              border: '1px solid var(--border-color)',
              borderRadius: '8px',
              padding: '12px 14px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
              <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-main)' }}>
                {info.nome}
              </label>
              {info.configurado ? (
                <span style={{ fontSize: '11px', color: 'var(--success)', fontWeight: 600 }}>✓ Configurado</span>
              ) : (
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Modo Simulado</span>
              )}
            </div>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px' }}>{info.uso}</p>
            {info.configurado && info.webhook_url && (
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px', background: 'rgba(0,0,0,0.2)', padding: '4px 8px', borderRadius: '4px' }}>
                URL mascarada: <code style={{ color: 'var(--primary-color)' }}>{info.webhook_url}</code>
              </div>
            )}
            <div style={{ display: 'flex', gap: '6px' }}>
              <input
                type="text"
                placeholder={info.configurado ? "Substituir URL do webhook..." : "URL do webhook / endpoint..."}
                value={inputs[chave] || ''}
                onChange={(e) => setInputs(prev => ({ ...prev, [chave]: e.target.value }))}
                style={{
                  flex: 1,
                  padding: '7px 10px',
                  borderRadius: '6px',
                  background: 'var(--bg-main)',
                  color: 'var(--text-main)',
                  border: '1px solid var(--border-color)',
                  outline: 'none',
                  fontSize: '12px'
                }}
              />
              <button
                onClick={() => handleSave(chave)}
                style={{
                  padding: '7px 12px',
                  borderRadius: '6px',
                  background: 'var(--primary-color)',
                  color: '#000',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: 600
                }}
              >
                Salvar
              </button>
              {info.configurado && (
                <button
                  onClick={() => handleDelete(chave)}
                  style={{
                    padding: '7px 10px',
                    borderRadius: '6px',
                    background: 'rgba(239, 68, 68, 0.15)',
                    color: 'var(--danger)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    cursor: 'pointer',
                    fontSize: '12px'
                  }}
                  title="Remover configuração do webhook"
                >
                  Remover
                </button>
              )}
            </div>
          </div>
        ))}

        <button
          onClick={onClose}
          style={{
            marginTop: '10px',
            width: '100%',
            padding: '9px',
            borderRadius: '6px',
            background: 'var(--panel-bg)',
            color: 'var(--text-muted)',
            border: '1px solid var(--border-color)',
            cursor: 'pointer',
            fontSize: '13px'
          }}
        >
          Fechar
        </button>
      </div>
    </div>
  );
}
