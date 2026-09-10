import React, { useState, useEffect } from 'react';
import { X, Check, Trash2, RotateCcw } from 'lucide-react';

export default function TotvsIntegrationModal({
  isOpen,
  onClose,
  sistemasTotvs = {},
  onSaveWebhook,
  onDeleteWebhook,
  onResetAllAnalyses
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
            className="btn-pf btn-pf-ghost btn-pf-sm"
            style={{ width: '32px', height: '32px', padding: 0 }}
            title="Fechar"
          >
            <X size={16} />
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
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  color: info.configurado ? 'var(--primary-light)' : 'var(--text-muted)'
                }}
              >
                {info.configurado ? 'Conectado' : 'Não configurado'}
              </span>
            </div>

            <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginBottom: '8px' }}>
              {info.uso}
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                className="input-pf"
                style={{ flex: 1, fontSize: '12px' }}
                placeholder={info.configurado ? 'Webhook configurado (cole nova URL para alterar)' : 'URL do Webhook / API REST'}
                value={inputs[chave] || ''}
                onChange={(e) => setInputs({ ...inputs, [chave]: e.target.value })}
              />
              <button
                onClick={() => handleSave(chave)}
                className="btn-pf btn-pf-primary btn-pf-sm"
                style={{ padding: '0 12px', fontSize: '12px' }}
                title="Salvar integração"
              >
                <Check size={12} />
                <span>Salvar</span>
              </button>
              {info.configurado && (
                <button
                  onClick={() => handleDelete(chave)}
                  className="btn-pf btn-pf-danger btn-pf-sm"
                  style={{ padding: '0 8px' }}
                  title="Desconectar sistema"
                >
                  <Trash2 size={12} />
                  <span>Remover</span>
                </button>
              )}
            </div>
          </div>
        ))}

        {onResetAllAnalyses && (
          <div style={{
            marginTop: '1.25rem',
            paddingTop: '1rem',
            borderTop: '1px solid var(--border-color)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '12px',
            flexWrap: 'wrap'
          }}>
            <div>
              <div style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text-main)' }}>Manutenção da Base</div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Resetar status de análise para reprocessar reuniões pela IA</div>
            </div>
            <button
              onClick={onResetAllAnalyses}
              className="btn-pf btn-pf-danger btn-pf-sm"
              style={{ padding: '6px 12px', fontSize: '11.5px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              title="Resetar todas as análises para novo processamento"
            >
              <RotateCcw size={13} />
              <span>Resetar Análises</span>
            </button>
          </div>
        )}

        <button
          onClick={onClose}
          className="btn-pf btn-pf-secondary"
          style={{
            marginTop: '14px',
            width: '100%',
            padding: '9px',
            fontSize: '13px'
          }}
        >
          <Check size={14} />
          <span>Fechar</span>
        </button>
      </div>
    </div>
  );
}
