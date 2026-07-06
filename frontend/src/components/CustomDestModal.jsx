import React, { useState, useEffect } from 'react';
import { API_URL } from '../config';

export default function CustomDestModal({ isOpen, onClose, onSave, editData, token }) {
  const [target, setTarget] = useState('');
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (editData) {
        setIsEditMode(true);
        setTarget(editData.id || '');
        setDescription(editData.description || '');
        setNotes(editData.notes || '');
        
        // If we only have basic info from listing, inspect the full details from PABX
        if (editData.notes === undefined && editData.id) {
          fetchDetails(editData.id);
        }
      } else {
        setIsEditMode(false);
        setTarget('');
        setDescription('');
        setNotes('');
      }
    }
  }, [isOpen, editData]);

  const fetchDetails = async (id) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/custom-destinations/detail/${encodeURIComponent(id)}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const resData = await res.json();
      if (resData.success && resData.data) {
        setDescription(resData.data.description || '');
        setNotes(resData.data.notes || '');
      }
    } catch (err) {
      console.error('Erro ao buscar detalhes do destino:', err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!target) return alert('Por favor, informe o destino (dial string).');
    if (!description) return alert('Por favor, informe uma descrição.');

    setLoading(true);
    try {
      const url = isEditMode 
        ? `${API_URL}/api/custom-destinations/${encodeURIComponent(target)}`
        : `${API_URL}/api/custom-destinations`;
      
      const method = isEditMode ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          id: target,
          description,
          notes
        })
      });

      const resData = await res.json();
      if (res.ok && resData.success) {
        onSave();
        onClose();
      } else {
        alert(resData.error || 'Erro ao salvar destino personalizado.');
      }
    } catch (error) {
      alert('Erro de rede ao salvar destino.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" style={styles.overlay}>
      <div className="glass-panel modal-inner" style={styles.modal}>
        <div style={styles.header}>
          <h2 style={styles.title}>
            {isEditMode ? '✏️ Editar Destino Personalizado' : '➕ Novo Destino Personalizado'}
          </h2>
          <button onClick={onClose} style={styles.closeBtn} disabled={loading}>
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.fieldGroup}>
            <label style={styles.label}>Destino de Discagem (Dial String):</label>
            <input
              type="text"
              className="input-glass"
              placeholder="Ex: custom-upchat,s,1"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              disabled={isEditMode || loading}
              style={{ ...styles.input, opacity: isEditMode ? 0.6 : 1 }}
              required
            />
            {!isEditMode && (
              <span style={styles.helpText}>
                O dial string de destino que o Asterisk usará (contexto,extensão,prioridade).
              </span>
            )}
          </div>

          <div style={styles.fieldGroup}>
            <label style={styles.label}>Descrição (Nome de Exibição):</label>
            <input
              type="text"
              className="input-glass"
              placeholder="Ex: Enviar para Upchat"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={loading}
              style={styles.input}
              required
            />
          </div>

          <div style={styles.fieldGroup}>
            <label style={styles.label}>Notas / Observações:</label>
            <textarea
              className="input-glass"
              placeholder="Notas detalhadas sobre este destino personalizado..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={loading}
              style={{ ...styles.input, minHeight: '80px', resize: 'vertical' }}
            />
          </div>

          <div style={styles.actions}>
            <button
              type="button"
              className="btn-neon-secondary"
              onClick={onClose}
              disabled={loading}
              style={styles.button}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="btn-neon-primary"
              disabled={loading}
              style={styles.button}
            >
              {loading ? 'Processando...' : 'Salvar Destino'}
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
    backgroundColor: 'rgba(5, 6, 10, 0.85)',
    backdropFilter: 'blur(10px)',
    zIndex: 1000,
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    padding: '20px',
  },
  modal: {
    width: '100%',
    maxWidth: '500px',
    padding: '30px',
    borderRadius: '16px',
    boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
    paddingBottom: '15px',
  },
  title: {
    margin: 0,
    fontSize: '1.25rem',
    color: '#fff',
    fontWeight: '600',
    fontFamily: 'Outfit, sans-serif',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    fontSize: '1.8rem',
    color: '#9ca3af',
    cursor: 'pointer',
    padding: 0,
    lineHeight: 1,
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  fieldGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    textAlign: 'left',
  },
  label: {
    fontSize: '0.85rem',
    color: '#d1d5db',
    fontWeight: '500',
  },
  input: {
    width: '100%',
    padding: '10px 14px',
    fontSize: '0.9rem',
  },
  helpText: {
    fontSize: '0.72rem',
    color: '#9ca3af',
    fontStyle: 'italic',
    marginTop: '2px',
  },
  actions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '12px',
    marginTop: '10px',
    borderTop: '1px solid rgba(255, 255, 255, 0.08)',
    paddingTop: '20px',
  },
  button: {
    padding: '10px 20px',
    fontSize: '0.85rem',
    fontWeight: '600',
  },
};
