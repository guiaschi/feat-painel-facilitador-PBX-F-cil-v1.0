import React, { useState, useEffect } from 'react';

export default function DidModal({ isOpen, onClose, onSave, isLoading, editData, extensions, queues }) {
  const [did, setDid] = useState('');
  const [description, setDescription] = useState('');
  const [destType, setDestType] = useState('Extensions'); // Extensions or Queues
  const [destValue, setDestValue] = useState('');
  const [error, setError] = useState('');

  // Load editData or reset form
  useEffect(() => {
    if (isOpen) {
      setError('');
      if (editData) {
        setDid(editData.did || '');
        setDescription(editData.description || '');
        
        // Parse destination from string (e.g. "Extensions: 1000" or "Queues: 100")
        // Or in some systems it could just show the display name
        const destStr = editData.destination || '';
        if (destStr.toLowerCase().includes('queue') || destStr.toLowerCase().includes('fila')) {
          setDestType('Queues');
          // Extract the digits
          const match = destStr.match(/\d+/);
          setDestValue(match ? match[0] : '');
        } else {
          setDestType('Extensions');
          const match = destStr.match(/\d+/);
          setDestValue(match ? match[0] : '');
        }
      } else {
        setDid('');
        setDescription('');
        setDestType('Extensions');
        setDestValue('');
      }
    }
  }, [isOpen, editData]);

  // Handle destination type change
  useEffect(() => {
    if (isOpen && !editData) {
      // Auto-select first item when type changes for new route
      if (destType === 'Extensions' && extensions && extensions.length > 0) {
        setDestValue(extensions[0].extension);
      } else if (destType === 'Queues' && queues && queues.length > 0) {
        setDestValue(queues[0].id);
      } else {
        setDestValue('');
      }
    }
  }, [destType, extensions, queues, isOpen, editData]);

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');

    if (!did && !editData) {
      setError('Por favor, insira o número do DID.');
      return;
    }
    if (!description) {
      setError('Por favor, insira uma descrição para a rota.');
      return;
    }
    if (!destValue) {
      setError('Por favor, selecione um destino válido.');
      return;
    }

    onSave({
      did,
      description,
      destType,
      destValue
    });
  };

  return (
    <div className="modal-overlay" style={styles.overlay}>
      <div className="glass-panel modal-inner" style={styles.modal}>
        <div style={styles.header}>
          <h2 style={styles.title}>
            {editData ? `Editar Entrada ${editData.did}` : 'Nova Entrada de Ligação (DID)'}
          </h2>
          <button style={styles.closeBtn} onClick={onClose} disabled={isLoading}>
            &times;
          </button>
        </div>

        {error && (
          <div style={styles.errorAlert}>
            <span>⚠️</span>
            <p style={styles.errorText}>{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} style={styles.form}>
          <div className="modal-form-grid" style={styles.grid2Cols}>
            <div className="form-group">
              <label htmlFor="did-number">Número do DID</label>
              <input
                id="did-number"
                type="text"
                className="input-glass"
                placeholder="Ex: 1130030033 ou ANY"
                value={did}
                onChange={(e) => setDid(e.target.value)}
                disabled={isLoading || editData !== null}
              />
              <span style={styles.inputTip}>Deixe vazio ou use 'ANY' para qualquer chamada de entrada</span>
            </div>

            <div className="form-group">
              <label htmlFor="did-description">Descrição (Nome)</label>
              <input
                id="did-description"
                type="text"
                className="input-glass"
                placeholder="Ex: Rota Principal Comercial"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={isLoading}
              />
            </div>
          </div>

          <div className="modal-form-grid" style={styles.grid2Cols}>
            <div className="form-group">
              <label htmlFor="dest-type">Encaminhar Para</label>
              <select
                id="dest-type"
                className="input-glass select-glass"
                value={destType}
                onChange={(e) => setDestType(e.target.value)}
                disabled={isLoading}
              >
                <option value="Extensions">Ramal (Extension)</option>
                <option value="Queues">Fila de Atendimento (Queue)</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="dest-value">Selecione o Destino</label>
              <select
                id="dest-value"
                className="input-glass select-glass"
                value={destValue}
                onChange={(e) => setDestValue(e.target.value)}
                disabled={isLoading}
              >
                <option value="">-- Selecione o destino --</option>
                {destType === 'Extensions'
                  ? (extensions || []).map((ext) => (
                      <option key={ext.extension} value={ext.extension}>
                        Ramal {ext.extension} - {ext.name}
                      </option>
                    ))
                  : (queues || []).map((q) => (
                      <option key={q.id} value={q.id}>
                        Fila {q.id} - {q.name}
                      </option>
                    ))
                }
              </select>
            </div>
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
              {isLoading ? (
                <>
                  <div style={styles.spinner}></div>
                  Gravando...
                </>
              ) : editData ? 'Salvar Alterações' : 'Criar Rota'}
            </button>
          </div>
        </form>
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
  grid2Cols: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '12px',
  },
  inputTip: {
    fontSize: '0.72rem',
    color: 'var(--text-muted)',
    marginTop: '4px',
    textAlign: 'left',
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
  spinner: {
    width: '18px',
    height: '18px',
    border: '2px solid rgba(255, 255, 255, 0.3)',
    borderTop: '2px solid #fff',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
    marginRight: '8px',
  },
};
