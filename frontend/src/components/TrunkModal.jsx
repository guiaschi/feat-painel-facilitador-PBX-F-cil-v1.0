import React, { useState, useEffect } from 'react';
import { API_URL } from '../config';

export default function TrunkModal({ isOpen, onClose, onSave, editData, token }) {
  const [name, setName] = useState('');
  const [tech, setTech] = useState('pjsip');
  const [callerid, setCallerid] = useState('');
  const [username, setUsername] = useState('');
  const [secret, setSecret] = useState('');
  const [sipServer, setSipServer] = useState('');
  const [sipServerPort, setSipServerPort] = useState('5060');
  const [loading, setLoading] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);

  // WhatsApp Trunk template states
  const [isWhatsApp, setIsWhatsApp] = useState(false);
  const [whatsappNumber, setWhatsappNumber] = useState('');

  useEffect(() => {
    if (isOpen) {
      if (editData) {
        setIsEditMode(true);
        setName(editData.name || '');
        setTech(editData.tech || 'pjsip');
        setCallerid(editData.callerid || '');
        
        // If we only have basic info from listing, inspect the full details from PABX
        fetchDetails(editData.id);
      } else {
        setIsEditMode(false);
        setIsWhatsApp(false);
        setWhatsappNumber('');
        setName('');
        setTech('pjsip');
        setCallerid('');
        setUsername('');
        setSecret('');
        setSipServer('');
        setSipServerPort('5060');
      }
    }
  }, [isOpen, editData]);

  const fetchDetails = async (id) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/trunks/detail/${encodeURIComponent(id)}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const resData = await res.json();
      if (resData.success && resData.trunk) {
        const t = resData.trunk;
        
        // Detect if this is a WhatsApp trunk using the wa.meta.vc template
        const isWA = !!(t.sip_server === 'wa.meta.vc' && t.name === t.username && t.username === t.secret);
        setIsWhatsApp(isWA);
        
        if (isWA) {
          setWhatsappNumber(t.name || '');
        }
        
        setUsername(t.username || '');
        setSecret(t.secret || '');
        setSipServer(t.sip_server || '');
        setSipServerPort(t.sip_server_port || '5060');
      }
    } catch (err) {
      console.error('Erro ao buscar detalhes do tronco:', err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    let finalName = name;
    let finalCallerid = callerid;
    let finalUsername = username;
    let finalSecret = secret;
    let finalSipServer = sipServer;
    let finalSipServerPort = sipServerPort;

    if (isWhatsApp) {
      if (!whatsappNumber) return alert('Por favor, informe o número do WhatsApp.');
      finalName = whatsappNumber.trim();
      finalCallerid = whatsappNumber.trim();
      finalUsername = whatsappNumber.trim();
      finalSecret = whatsappNumber.trim();
      finalSipServer = 'wa.meta.vc';
      finalSipServerPort = '5060';
    } else {
      if (!finalName) return alert('Por favor, informe o nome do tronco.');
      if (tech === 'pjsip' && (!finalUsername || !finalSecret || !finalSipServer)) {
        return alert('Por favor, preencha Usuário, Senha e Servidor SIP para troncos PJSIP.');
      }
    }

    setLoading(true);
    try {
      const url = isEditMode 
        ? `${API_URL}/api/trunks/edit`
        : `${API_URL}/api/trunks/create`;
      
      const payload = {
        name: finalName,
        tech: 'pjsip', // WhatsApp trunks are created as PJSIP
        callerid: finalCallerid,
        username: finalUsername,
        secret: finalSecret,
        sip_server: finalSipServer,
        sip_server_port: isWhatsApp ? 0 : (finalSipServerPort ? parseInt(finalSipServerPort) : 5060),
        maxchans: isWhatsApp ? 30 : undefined,
        authentication: isWhatsApp ? 'off' : undefined,
        registration: isWhatsApp ? 'none' : undefined,
        transport: isWhatsApp ? 'tls' : undefined,
        identify_by: isWhatsApp ? 'Auth Username' : undefined,
        media_encryption: isWhatsApp ? 'SRTP via in-SDP (recommended)' : undefined,
        codecs: isWhatsApp ? ['opus'] : undefined
      };

      if (isEditMode) {
        payload.id = editData.id;
      }

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      const resData = await res.json();
      if (res.ok && resData.success) {
        onSave();
        onClose();
      } else {
        alert(resData.error || 'Erro ao salvar tronco.');
      }
    } catch (error) {
      alert('Erro de rede ao salvar tronco.');
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
            {isEditMode ? '✏️ Editar Tronco' : '➕ Novo Tronco SIP/PJSIP'}
          </h2>
          <button onClick={onClose} style={styles.closeBtn} disabled={loading}>
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '10px', background: 'rgba(255,255,255,0.04)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(16, 185, 129, 0.2)', marginBottom: '10px' }}>
            <input
              type="checkbox"
              id="isWhatsAppTrunk"
              checked={isWhatsApp}
              onChange={(e) => setIsWhatsApp(e.target.checked)}
              disabled={isEditMode || loading}
              style={{ width: '16px', height: '16px', cursor: 'pointer' }}
            />
            <label htmlFor="isWhatsAppTrunk" style={{ cursor: 'pointer', margin: 0, fontSize: '0.85rem', color: '#10b981', fontWeight: 'bold' }}>
              🟢 Configurar como Tronco WhatsApp (wa.meta.vc)
            </label>
          </div>

          {isWhatsApp ? (
            <>
              <div style={styles.fieldGroup}>
                <label style={styles.label}>Número do WhatsApp:</label>
                <input
                  type="text"
                  className="input-glass"
                  placeholder="Ex: 553125760101"
                  value={whatsappNumber}
                  onChange={(e) => setWhatsappNumber(e.target.value.replace(/\D/g, ''))}
                  disabled={isEditMode || loading}
                  style={{ ...styles.input, opacity: isEditMode ? 0.6 : 1 }}
                  required
                />
                {!isEditMode && (
                  <span style={styles.helpText}>
                    Toda a configuração de SIP Server (wa.meta.vc), Usuário, Senha e CallerID será gerada automaticamente usando este número.
                  </span>
                )}
              </div>
            </>
          ) : (
            <>
              <div style={styles.fieldGroup}>
                <label style={styles.label}>Nome do Tronco:</label>
                <input
                  type="text"
                  className="input-glass"
                  placeholder="Ex: Trunk_Vivo"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={loading}
                  style={styles.input}
                  required
                />
              </div>

              <div style={styles.fieldGroup}>
                <label style={styles.label}>CallerID de Saída:</label>
                <input
                  type="text"
                  className="input-glass"
                  placeholder="Ex: 558539246886"
                  value={callerid}
                  onChange={(e) => setCallerid(e.target.value)}
                  disabled={loading}
                  style={styles.input}
                />
              </div>

              <div style={styles.fieldGroup}>
                <label style={styles.label}>Tecnologia:</label>
                <select
                  className="input-glass"
                  value={tech}
                  onChange={(e) => setTech(e.target.value)}
                  disabled={isEditMode || loading}
                  style={{ ...styles.input, background: '#111827', color: '#fff' }}
                >
                  <option value="pjsip">PJSIP (Recomendado)</option>
                  <option value="sip">SIP Legacy (chan_sip)</option>
                </select>
              </div>

              {tech === 'pjsip' && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                    <div style={styles.fieldGroup}>
                      <label style={styles.label}>Servidor SIP / Host:</label>
                      <input
                        type="text"
                        className="input-glass"
                        placeholder="Ex: sip.provedor.com"
                        value={sipServer}
                        onChange={(e) => setSipServer(e.target.value)}
                        disabled={loading}
                        style={styles.input}
                        required
                      />
                    </div>
                    <div style={styles.fieldGroup}>
                      <label style={styles.label}>Porta SIP:</label>
                      <input
                        type="number"
                        className="input-glass"
                        placeholder="5060"
                        value={sipServerPort}
                        onChange={(e) => setSipServerPort(e.target.value)}
                        disabled={loading}
                        style={styles.input}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                    <div style={styles.fieldGroup}>
                      <label style={styles.label}>Usuário / Auth ID:</label>
                      <input
                        type="text"
                        className="input-glass"
                        placeholder="Ex: vivo_user"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        disabled={loading}
                        style={styles.input}
                        required
                      />
                    </div>
                    <div style={styles.fieldGroup}>
                      <label style={styles.label}>Senha (Secret):</label>
                      <input
                        type="password"
                        className="input-glass"
                        placeholder="***"
                        value={secret}
                        onChange={(e) => setSecret(e.target.value)}
                        disabled={loading}
                        style={styles.input}
                        required
                      />
                    </div>
                  </div>
                </>
              )}
            </>
          )}

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
              {loading ? 'Processando...' : 'Salvar Tronco'}
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
    maxWidth: '550px',
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
