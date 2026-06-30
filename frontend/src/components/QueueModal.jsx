import React, { useState, useEffect } from 'react';
import { API_URL } from '../config';

export default function QueueModal({ isOpen, onClose, onSave, isLoading, editData, extensions, instance }) {
  const [queueId, setQueueId] = useState('');
  const [name, setName] = useState('');
  const [staticAgents, setStaticAgents] = useState([]);
  const [dynamicAgents, setDynamicAgents] = useState([]);
  const [strategy, setStrategy] = useState('ringall');
  const [timeoutVal, setTimeoutVal] = useState('0');
  const [maxwaitVal, setMaxwaitVal] = useState('');
  const [error, setError] = useState('');
  const [isDetailLoading, setIsDetailLoading] = useState(false);

  // Reset/Load details on open
  useEffect(() => {
    if (isOpen) {
      setError('');
      if (editData) {
        setQueueId(editData.id || '');
        setName(editData.name || '');
        setStaticAgents([]);
        setDynamicAgents([]);
        setStrategy('ringall');
        setTimeoutVal('0');
        setMaxwaitVal('');
        fetchQueueDetails(editData.id);
      } else {
        setQueueId('');
        setName('');
        setStaticAgents([]);
        setDynamicAgents([]);
        setStrategy('ringall');
        setTimeoutVal('0');
        setMaxwaitVal('');
      }
    }
  }, [isOpen, editData]);

  const fetchQueueDetails = async (id) => {
    setIsDetailLoading(true);
    try {
      const token = localStorage.getItem('pbx_token');
      const response = await fetch(`${API_URL}/api/queues/detail/${id}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await response.json();
      if (response.ok && data.success) {
        setName(data.queue.name || '');
        setStaticAgents(data.queue.staticAgents || []);
        setDynamicAgents(data.queue.dynamicAgents || []);
        setStrategy(data.queue.strategy || 'ringall');
        setTimeoutVal(data.queue.timeout || '0');
        setMaxwaitVal(data.queue.maxwait || '');
      } else {
        setError(data.error || 'Erro ao carregar detalhes da fila.');
      }
    } catch (e) {
      console.error('[Queue Detail] Failed:', e.message);
      setError('Falha ao comunicar com o servidor para buscar detalhes.');
    } finally {
      setIsDetailLoading(false);
    }
  };

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');

    if (!queueId || !name) {
      setError('Por favor, insira o número e o nome da fila.');
      return;
    }

    if (isNaN(Number(queueId))) {
      setError('O número da fila deve conter apenas dígitos numéricos.');
      return;
    }

    onSave({
      id: queueId,
      name,
      staticAgents,
      dynamicAgents,
      strategy,
      timeout: timeoutVal,
      maxwait: maxwaitVal
    });
  };

  return (
    <div className="modal-overlay" style={styles.overlay}>
      <div className="glass-panel modal-inner" style={styles.modal}>
        <div style={styles.header}>
          <h2 style={styles.title}>
            {editData ? `Editar Fila ${editData.id}` : 'Nova Fila de Atendimento'}
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
            <div className="modal-form-grid" style={styles.grid2Cols}>
              <div className="form-group">
                <label htmlFor="queue-number">Número da Fila</label>
                <input
                  id="queue-number"
                  type="text"
                  className="input-glass"
                  placeholder="Ex: 100"
                  value={queueId}
                  onChange={(e) => setQueueId(e.target.value)}
                  disabled={isLoading || editData !== null}
                />
              </div>

              <div className="form-group">
                <label htmlFor="queue-name">Nome da Fila</label>
                <input
                  id="queue-name"
                  type="text"
                  className="input-glass"
                  placeholder="Ex: Suporte N1"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={isLoading}
                />
              </div>
            </div>

            {/* Strategy & Timing Controls (Grid layout) */}
            <div className="modal-form-grid" style={styles.grid3Cols}>
              <div className="form-group">
                <label htmlFor="queue-strategy">Estratégia</label>
                <select
                  id="queue-strategy"
                  className="input-glass select-glass"
                  value={strategy}
                  onChange={(e) => setStrategy(e.target.value)}
                  disabled={isLoading}
                >
                  <option value="ringall">Ringall (Tocar Todos)</option>
                  <option value="leastrecent">Leastrecent (Mais Ocioso)</option>
                  <option value="fewestcalls">Fewestcalls (Menos Atend.)</option>
                  <option value="random">Random (Aleatório)</option>
                  <option value="rrmemory">Rrmemory (Rotativo c/ Memória)</option>
                  <option value="rrordered">Rrordered (Rotativo Ordenado)</option>
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="queue-timeout">Toque Ramal</label>
                <select
                  id="queue-timeout"
                  className="input-glass select-glass"
                  value={timeoutVal}
                  onChange={(e) => setTimeoutVal(e.target.value)}
                  disabled={isLoading}
                >
                  <option value="0">Fila Decide</option>
                  <option value="10">10s</option>
                  <option value="15">15s</option>
                  <option value="20">20s</option>
                  <option value="30">30s</option>
                  <option value="45">45s</option>
                  <option value="60">60s</option>
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="queue-maxwait">Espera Máxima</label>
                <select
                  id="queue-maxwait"
                  className="input-glass select-glass"
                  value={maxwaitVal}
                  onChange={(e) => setMaxwaitVal(e.target.value)}
                  disabled={isLoading}
                >
                  <option value="">Ilimitado</option>
                  <option value="30">30s</option>
                  <option value="60">1 min</option>
                  <option value="120">2 min</option>
                  <option value="180">3 min</option>
                  <option value="300">5 min</option>
                  <option value="600">10 min</option>
                  <option value="1200">20 min</option>
                </select>
              </div>
            </div>

            {/* Static & Dynamic Agents Selection grid */}
            <div className="form-group" style={styles.agentsGroup}>
              <label>Participação dos Ramais na Fila</label>
              {extensions.length === 0 ? (
                <span style={styles.noAgentsText}>Nenhum ramal cadastrado no sistema.</span>
              ) : (
                <div className="scroll-glass" style={styles.agentsGrid}>
                  {extensions.map((ext) => {
                    const isStatic = staticAgents.includes(ext.extension);
                    const isDynamic = dynamicAgents.includes(ext.extension);
                    const currentStatus = isStatic ? 'static' : (isDynamic ? 'dynamic' : 'none');

                    return (
                      <div key={ext.extension} style={styles.agentRow}>
                        <span style={styles.agentName} title={`${ext.extension} - ${ext.name}`}>
                          <strong>{ext.extension}</strong> - {ext.name}
                        </span>
                        
                        <div className="selector-toggle" style={styles.selectorGroup}>
                          <button
                            type="button"
                            className={`select-btn ${currentStatus === 'none' ? 'active-off' : ''}`}
                            onClick={() => {
                              setStaticAgents(prev => prev.filter(id => id !== ext.extension));
                              setDynamicAgents(prev => prev.filter(id => id !== ext.extension));
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
                              setStaticAgents(prev => prev.includes(ext.extension) ? prev : [...prev, ext.extension]);
                              setDynamicAgents(prev => prev.filter(id => id !== ext.extension));
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
                              setDynamicAgents(prev => prev.includes(ext.extension) ? prev : [...prev, ext.extension]);
                              setStaticAgents(prev => prev.filter(id => id !== ext.extension));
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
                📌 <strong>Fixo (Estático):</strong> O ramal está sempre ativo na fila (atendentes fixos da operação).
              </p>
              <p style={styles.explanationText}>
                📌 <strong>Móvel (Dinâmico):</strong> O atendente entra e sai da fila discando código do seu ramal (ex: <code>*45</code>).
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
                {isLoading ? 'Salvando...' : (editData ? 'Salvar Alterações' : 'Criar Fila')}
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
    maxWidth: '560px',
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
  grid2Cols: {
    display: 'grid',
    gridTemplateColumns: '1fr 1.5fr',
    gap: '12px',
  },
  grid3Cols: {
    display: 'grid',
    gridTemplateColumns: '1.5fr 1fr 1fr',
    gap: '12px',
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
  agentsGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    marginTop: '4px',
  },
  agentsGrid: {
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
  agentRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '12px',
    padding: '6px 8px',
    borderRadius: '6px',
    background: 'rgba(255, 255, 255, 0.02)',
  },
  agentName: {
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
  noAgentsText: {
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

// Inject CSS slidein, scrollbar and selector button styling rules
if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.innerHTML = `
    @keyframes modalSlideIn {
      from {
        transform: translateY(20px);
        opacity: 0;
      }
      to {
        transform: translateY(0);
        opacity: 1;
      }
    }
    .scroll-glass::-webkit-scrollbar {
      width: 6px;
    }
    .scroll-glass::-webkit-scrollbar-track {
      background: rgba(255, 255, 255, 0.01);
      border-radius: 4px;
    }
    .scroll-glass::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.1);
      border-radius: 4px;
    }
    .scroll-glass::-webkit-scrollbar-thumb:hover {
      background: rgba(0, 242, 254, 0.3);
    }
    
    /* Toggle button state designs */
    .select-btn.active-off {
      background: rgba(255, 255, 255, 0.08) !important;
      color: #fff !important;
    }
    .select-btn.active-static {
      background: rgba(0, 242, 254, 0.15) !important;
      color: #00f2fe !important;
      text-shadow: 0 0 8px rgba(0, 242, 254, 0.3);
    }
    .select-btn.active-dynamic {
      background: rgba(157, 78, 221, 0.15) !important;
      color: #c084fc !important;
      text-shadow: 0 0 8px rgba(157, 78, 221, 0.3);
    }
    .select-btn:hover:not(.active-off):not(.active-static):not(.active-dynamic) {
      background: rgba(255, 255, 255, 0.03);
      color: #fff;
    }
  `;
  document.head.appendChild(style);
}
