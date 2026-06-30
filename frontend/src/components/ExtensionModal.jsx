import React, { useState, useEffect } from 'react';
import { API_URL } from '../config';

export default function ExtensionModal({ isOpen, onClose, onSave, isLoading, editData, instance }) {
  const [extension, setExtension] = useState('');
  const [name, setName] = useState('');
  const [secret, setSecret] = useState('');
  const [type, setType] = useState('Softphone');
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [availableQueues, setAvailableQueues] = useState([]);
  const [selectedQueues, setSelectedQueues] = useState([]); // [{ id: "100", type: "static" }]
  const [isDetailLoading, setIsDetailLoading] = useState(false);

  // Load queues and handle editData loading
  useEffect(() => {
    if (isOpen) {
      setError('');
      setShowPassword(false);
      loadQueues();

      if (editData) {
        setExtension(editData.extension || '');
        setName(editData.name || '');
        setType(editData.type || 'Softphone');
        
        // Adapt queues state (can be list of strings or objects)
        const initialQueues = (editData.queues || []).map(q => {
          if (typeof q === 'string') return { id: q, type: 'static' };
          return { id: q.id, type: q.type || 'static' };
        });
        setSelectedQueues(initialQueues);
        setSecret('');
        
        fetchExtensionDetails(editData.id || editData.extension);
      } else {
        setExtension('');
        setName('');
        setType('Softphone');
        setSelectedQueues([]);
        generateRandomSecret();
      }
    }
  }, [isOpen, editData]);

  const loadQueues = async () => {
    try {
      const token = localStorage.getItem('pbx_token');
      const response = await fetch(`${API_URL}/api/queues`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await response.json();
      if (response.ok && data.success) {
        setAvailableQueues(data.queues || []);
      }
    } catch (e) {
      console.error('[Queues] Error loading queues:', e.message);
    }
  };

  const fetchExtensionDetails = async (id) => {
    setIsDetailLoading(true);
    try {
      const token = localStorage.getItem('pbx_token');
      const response = await fetch(`${API_URL}/api/extensions/detail/${id}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await response.json();
      if (response.ok && data.success) {
        setName(data.name || '');
        setSecret(data.secret || '');
        setType(data.type || 'Softphone');
        
        const detailedQueues = (data.queues || []).map(q => {
          if (typeof q === 'string') return { id: q, type: 'static' };
          return { id: q.id, type: q.type || 'static' };
        });
        setSelectedQueues(detailedQueues);
      } else {
        setError(data.error || 'Erro ao carregar detalhes do ramal.');
      }
    } catch (e) {
      console.error('[Details] Error loading details:', e.message);
      setError('Falha ao comunicar com o servidor do PBX.');
    } finally {
      setIsDetailLoading(false);
    }
  };

  const generateRandomSecret = () => {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let pass = '';
    for (let i = 0; i < 12; i++) {
      pass += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setSecret(pass);
  };

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');

    if (!extension || !name || !secret) {
      setError('Por favor, preencha todos os campos.');
      return;
    }

    if (isNaN(Number(extension))) {
      setError('O número do ramal deve conter apenas dígitos numéricos.');
      return;
    }

    if (extension.length < 3 || extension.length > 6) {
      setError('O ramal deve ter entre 3 e 6 dígitos.');
      return;
    }

    onSave({
      extension,
      name,
      secret,
      type,
      queues: selectedQueues
    });
  };

  return (
    <div className="modal-overlay" style={styles.overlay}>
      <div className="glass-panel modal-inner" style={styles.modal}>
        <div style={styles.header}>
          <h2 style={styles.title}>
            {editData ? `Editar Ramal ${editData.extension}` : 'Novo Ramal'}
          </h2>
          <button style={styles.closeBtn} onClick={onClose} disabled={isLoading || isDetailLoading}>
            &times;
          </button>
        </div>

        {error && (
          <div style={styles.errorAlert}>
            <span>⚠️</span>
            <p style={styles.errorText}>{error}</p>
          </div>
        )}

        {isDetailLoading ? (
          <div style={styles.syncOverlay}>
            <div className="loader-glow" style={{ width: '35px', height: '35px' }}></div>
            <span>Sincronizando com o PBX {instance}...</span>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={styles.form}>
            <div className="form-group">
              <label htmlFor="modal-extension">Número do Ramal</label>
              <input
                id="modal-extension"
                type="text"
                className="input-glass"
                placeholder="Ex: 1005"
                value={extension}
                onChange={(e) => setExtension(e.target.value)}
                disabled={isLoading || editData !== null}
                maxLength={6}
              />
            </div>

            <div className="form-group">
              <label htmlFor="modal-name">Nome Exibido</label>
              <input
                id="modal-name"
                type="text"
                className="input-glass"
                placeholder="Ex: João da Silva"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={isLoading}
              />
            </div>

            <div className="form-group">
              <label htmlFor="modal-secret">Senha do Ramal</label>
              <div style={styles.passwordWrapper}>
                <input
                  id="modal-secret"
                  type={showPassword ? 'text' : 'password'}
                  className="input-glass"
                  placeholder="Insira a senha do ramal"
                  value={secret}
                  onChange={(e) => setSecret(e.target.value)}
                  disabled={isLoading}
                  style={styles.passwordInput}
                />
                <button
                  type="button"
                  style={styles.toggleShowBtn}
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex="-1"
                >
                  {showPassword ? '🐵' : '🙈'}
                </button>
                <button
                  type="button"
                  className="btn-neon-secondary"
                  style={styles.generateBtn}
                  onClick={generateRandomSecret}
                  disabled={isLoading}
                >
                  Gerar
                </button>
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="modal-type">Tipo de Ramal</label>
              <select
                id="modal-type"
                className="input-glass select-glass"
                value={type}
                onChange={(e) => setType(e.target.value)}
                disabled={isLoading}
              >
                <option value="Softphone">Softphone (PJSIP Padrão)</option>
                <option value="Webphone">Webphone (WebRTC / WSS)</option>
              </select>
            </div>

            {/* Queues Selector Toggle */}
            <div className="form-group" style={styles.queuesGroup}>
              <label>Participação em Filas (Queues)</label>
              {availableQueues.length === 0 ? (
                <span style={styles.noQueuesText}>Nenhuma fila encontrada no PBX.</span>
              ) : (
                <div className="scroll-glass" style={styles.queuesGrid}>
                  {availableQueues.map((q) => {
                    const queueConfig = selectedQueues.find(item => item.id === q.id);
                    const currentStatus = queueConfig ? queueConfig.type : 'none';

                    return (
                      <div key={q.id} style={styles.queueRow}>
                        <span style={styles.queueName} title={`${q.id} - ${q.name}`}>
                          <strong>{q.id}</strong> - {q.name}
                        </span>
                        
                        <div className="selector-toggle" style={styles.selectorGroup}>
                          <button
                            type="button"
                            className={`select-btn ${currentStatus === 'none' ? 'active-off' : ''}`}
                            onClick={() => {
                              setSelectedQueues(prev => prev.filter(item => item.id !== q.id));
                            }}
                            disabled={isLoading}
                            style={styles.toggleBtn}
                          >
                            Off
                          </button>
                          
                          <button
                            type="button"
                            className={`select-btn ${currentStatus === 'static' ? 'active-static' : ''}`}
                            onClick={() => {
                              setSelectedQueues(prev => {
                                const filtered = prev.filter(item => item.id !== q.id);
                                return [...filtered, { id: q.id, type: 'static' }];
                              });
                            }}
                            disabled={isLoading}
                            style={styles.toggleBtn}
                          >
                            Fixo
                          </button>
                          
                          <button
                            type="button"
                            className={`select-btn ${currentStatus === 'dynamic' ? 'active-dynamic' : ''}`}
                            onClick={() => {
                              setSelectedQueues(prev => {
                                const filtered = prev.filter(item => item.id !== q.id);
                                return [...filtered, { id: q.id, type: 'dynamic' }];
                              });
                            }}
                            disabled={isLoading}
                            style={styles.toggleBtn}
                          >
                            Móvel
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Explanation box */}
            <div style={styles.explanationBox}>
              <h4 style={styles.explanationTitle}>💡 Diferença dos Agentes:</h4>
              <p style={styles.explanationText}>
                📌 <strong>Fixo (Estático):</strong> O ramal está sempre ativo na fila. Ideal para atendentes fixos que nunca saem da operação.
              </p>
              <p style={styles.explanationText}>
                📌 <strong>Móvel (Dinâmico):</strong> O atendente pode entrar e sair da fila discando um código do seu ramal (ex: <code>*45</code>). Ideal para flexibilidade de pausas ou alternar setores.
              </p>
            </div>

            <div style={styles.footer}>
              <button
                type="button"
                className="btn-neon-secondary"
                style={styles.actionBtn}
                onClick={onClose}
                disabled={isLoading}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="btn-neon-primary"
                style={styles.actionBtn}
                disabled={isLoading}
              >
                {isLoading ? 'Salvando...' : (editData ? 'Salvar Alterações' : 'Criar Ramal')}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(5, 6, 10, 0.8)',
    backdropFilter: 'blur(8px)',
    zIndex: 1000,
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    padding: '20px',
  },
  modal: {
    width: '100%',
    maxWidth: '540px',
    padding: '30px',
    animation: 'modalSlideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
    position: 'relative',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px',
  },
  title: {
    fontSize: '1.4rem',
    fontFamily: 'Outfit, sans-serif',
    fontWeight: '600',
    color: '#fff',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    color: '#9ca3af',
    fontSize: '1.8rem',
    cursor: 'pointer',
    padding: '0 4px',
    lineHeight: '1',
    transition: 'color 0.2s',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
  },
  passwordWrapper: {
    display: 'flex',
    gap: '10px',
    alignItems: 'center',
    position: 'relative',
    width: '100%',
  },
  passwordInput: {
    flexGrow: 1,
    paddingRight: '45px',
  },
  toggleShowBtn: {
    position: 'absolute',
    right: '95px',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: '1.1rem',
  },
  generateBtn: {
    padding: '0 16px',
    height: '46px',
    borderRadius: '12px',
    flexShrink: 0,
  },
  footer: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '12px',
    marginTop: '10px',
  },
  actionBtn: {
    flexGrow: 1,
    height: '46px',
  },
  errorAlert: {
    display: 'flex',
    gap: '12px',
    alignItems: 'center',
    background: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid rgba(239, 68, 68, 0.2)',
    padding: '12px 16px',
    borderRadius: '10px',
    marginBottom: '16px',
  },
  errorText: {
    color: '#fca5a5',
    fontSize: '0.85rem',
    margin: 0,
    textAlign: 'left',
  },
  queuesGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    marginTop: '4px',
  },
  queuesGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    maxHeight: '130px',
    overflowY: 'auto',
    background: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid rgba(255, 255, 255, 0.05)',
    borderRadius: '8px',
    padding: '10px',
  },
  queueRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '12px',
    padding: '6px 8px',
    borderRadius: '6px',
    background: 'rgba(255, 255, 255, 0.02)',
  },
  queueName: {
    fontSize: '0.85rem',
    color: '#e5e7eb',
    textAlign: 'left',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    flexGrow: 1,
  },
  selectorGroup: {
    display: 'flex',
    background: 'rgba(5, 6, 10, 0.4)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '8px',
    padding: '2px',
    gap: '2px',
  },
  toggleBtn: {
    padding: '4px 10px',
    border: 'none',
    borderRadius: '6px',
    fontSize: '0.75rem',
    fontWeight: '600',
    cursor: 'pointer',
    background: 'transparent',
    color: '#9ca3af',
    transition: 'all 0.2s ease',
  },
  noQueuesText: {
    fontSize: '0.85rem',
    color: '#9ca3af',
    fontStyle: 'italic',
    textAlign: 'left',
  },
  explanationBox: {
    background: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid rgba(0, 242, 254, 0.1)',
    borderRadius: '10px',
    padding: '12px',
    textAlign: 'left',
  },
  explanationTitle: {
    fontSize: '0.85rem',
    color: '#00f2fe',
    margin: '0 0 6px 0',
    fontFamily: 'Outfit, sans-serif',
    fontWeight: '600',
  },
  explanationText: {
    fontSize: '0.78rem',
    color: '#9ca3af',
    margin: '0 0 4px 0',
    lineHeight: '1.4',
  },
  syncOverlay: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
    padding: '40px 0',
    color: '#00f2fe',
    fontSize: '0.9rem',
    fontWeight: '500',
  },
};
