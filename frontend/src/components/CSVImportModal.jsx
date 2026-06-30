import React, { useState, useEffect } from 'react';

export default function CSVImportModal({ isOpen, onClose, onImportStart }) {
  const [file, setFile] = useState(null);
  const [defaultType, setDefaultType] = useState('Softphone');
  const [parsedData, setParsedData] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setFile(null);
      setParsedData([]);
      setError('');
    }
  }, [isOpen]);

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (!selectedFile) return;

    if (!selectedFile.name.endsWith('.csv')) {
      setError('Por favor, selecione apenas arquivos CSV.');
      setFile(null);
      setParsedData([]);
      return;
    }

    setError('');
    setFile(selectedFile);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target.result;
        parseCSV(text);
      } catch (err) {
        setError('Erro ao processar o arquivo CSV. Verifique a formatação.');
      }
    };
    reader.readAsText(selectedFile, 'UTF-8');
  };

  const parseCSV = (text) => {
    const lines = text.split(/\r?\n/);
    if (lines.length === 0) {
      setError('O arquivo CSV está vazio.');
      return;
    }

    const rows = [];
    let headers = [];

    // Parse helper to handle quotes and separators (comma or semicolon)
    const splitCSVLine = (line) => {
      // Auto-detect comma or semicolon separator
      const separator = line.includes(';') ? ';' : ',';
      
      const result = [];
      let current = '';
      let inQuotes = false;

      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === separator && !inQuotes) {
          result.push(current.trim().replace(/^"|"$/g, ''));
          current = '';
        } else {
          current += char;
        }
      }
      result.push(current.trim().replace(/^"|"$/g, ''));
      return { fields: result, separator };
    };

    // Parse header line
    if (lines.length > 0) {
      const { fields } = splitCSVLine(lines[0]);
      headers = fields.map(h => h.toLowerCase());
    }

    // Determine column indices
    let extIndex = headers.indexOf('ramal') !== -1 ? headers.indexOf('ramal') : headers.indexOf('extension');
    let nameIndex = headers.indexOf('nome') !== -1 ? headers.indexOf('nome') : headers.indexOf('name');
    let secretIndex = headers.indexOf('senha') !== -1 ? headers.indexOf('senha') : headers.indexOf('secret');
    let typeIndex = headers.indexOf('tipo') !== -1 ? headers.indexOf('tipo') : headers.indexOf('type');

    // If headers are missing, assume standard order: [ramal, nome, senha, tipo]
    const hasHeaders = extIndex !== -1 || nameIndex !== -1;
    let startIndex = 1;

    if (!hasHeaders) {
      extIndex = 0;
      nameIndex = 1;
      secretIndex = 2;
      typeIndex = 3;
      startIndex = 0;
    }

    for (let i = startIndex; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const { fields } = splitCSVLine(line);
      
      const rawExt = fields[extIndex] || '';
      const rawName = fields[nameIndex] || '';
      // If secret is missing, we will generate a random one later
      const rawSecret = fields[secretIndex] || '';
      
      let rawType = fields[typeIndex] || '';
      if (rawType) {
        // Map common WebRTC / Webphone values
        const typeLower = rawType.toLowerCase();
        if (typeLower.includes('web') || typeLower.includes('webrtc') || typeLower.includes('wss')) {
          rawType = 'Webphone';
        } else {
          rawType = 'Softphone';
        }
      }

      if (rawExt && !isNaN(Number(rawExt))) {
        rows.push({
          extension: rawExt,
          name: rawName || `Ramal ${rawExt}`,
          secret: rawSecret,
          type: rawType || null // dynamic fallback later
        });
      }
    }

    if (rows.length === 0) {
      setError('Nenhum ramal válido encontrado. Verifique as colunas (Ramal, Nome, Senha).');
    } else {
      setParsedData(rows);
    }
  };

  const handleImport = () => {
    if (parsedData.length === 0) return;

    // Apply fallbacks for password generation and default type selection
    const finalizedData = parsedData.map(row => {
      let finalSecret = row.secret;
      if (!finalSecret) {
        const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        finalSecret = '';
        for (let i = 0; i < 12; i++) {
          finalSecret += chars.charAt(Math.floor(Math.random() * chars.length));
        }
      }

      return {
        ...row,
        secret: finalSecret,
        type: row.type || defaultType
      };
    });

    onImportStart(finalizedData);
  };

  if (!isOpen) return null;

  return (
    <div style={styles.overlay}>
      <div className="glass-panel" style={styles.modal}>
        <div style={styles.header}>
          <h2 style={styles.title}>Importar Ramais (CSV)</h2>
          <button style={styles.closeBtn} onClick={onClose}>
            &times;
          </button>
        </div>

        {error && (
          <div style={styles.errorAlert}>
            <span>⚠️</span>
            <p style={styles.errorText}>{error}</p>
          </div>
        )}

        <div style={styles.instructions}>
          <p>O arquivo CSV pode ter cabeçalhos ou ser apenas valores separados por vírgula/ponto-e-vírgula.</p>
          <span style={styles.instructionExample}>
            Exemplo: <code>ramal, nome, senha, tipo</code> (Tipo: Softphone ou Webphone)
          </span>
        </div>

        <div className="form-group" style={{ marginBottom: '16px' }}>
          <label htmlFor="csv-file-input">Selecione o arquivo CSV</label>
          <input
            id="csv-file-input"
            type="file"
            accept=".csv"
            onChange={handleFileChange}
            style={styles.fileInput}
          />
        </div>

        {parsedData.length > 0 && (
          <>
            <div className="form-group" style={{ marginBottom: '16px' }}>
              <label htmlFor="csv-default-type">Tipo Padrão (quando não especificado no CSV)</label>
              <select
                id="csv-default-type"
                className="input-glass select-glass"
                value={defaultType}
                onChange={(e) => setDefaultType(e.target.value)}
              >
                <option value="Softphone">Softphone (PJSIP Padrão)</option>
                <option value="Webphone">Webphone (WebRTC / WSS)</option>
              </select>
            </div>

            <div style={styles.previewContainer}>
              <label style={styles.previewTitle}>Pré-visualização dos Ramais ({parsedData.length}):</label>
              <div style={styles.tableWrapper}>
                <table style={styles.previewTable}>
                  <thead>
                    <tr>
                      <th>Ramal</th>
                      <th>Nome</th>
                      <th>Senha</th>
                      <th>Tipo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedData.map((row, idx) => (
                      <tr key={idx}>
                        <td>{row.extension}</td>
                        <td>{row.name}</td>
                        <td style={{ fontFamily: 'monospace' }}>
                          {row.secret ? '••••••••' : '🎲 Autogerado'}
                        </td>
                        <td>{row.type || `Padrão (${defaultType})`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        <div style={styles.footer}>
          <button className="btn-neon-secondary" style={styles.actionBtn} onClick={onClose}>
            Cancelar
          </button>
          <button
            className="btn-neon-primary"
            style={styles.actionBtn}
            onClick={handleImport}
            disabled={parsedData.length === 0}
          >
            Importar {parsedData.length > 0 ? `(${parsedData.length})` : ''}
          </button>
        </div>
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
    maxWidth: '580px',
    padding: '30px',
    animation: 'modalSlideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    maxHeight: '90vh',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px',
    flexShrink: 0,
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
  },
  instructions: {
    background: 'rgba(255, 255, 255, 0.02)',
    border: '1px solid var(--panel-border)',
    borderRadius: '10px',
    padding: '12px 16px',
    fontSize: '0.85rem',
    color: '#9ca3af',
    marginBottom: '16px',
    flexShrink: 0,
  },
  instructionExample: {
    display: 'block',
    marginTop: '6px',
    color: '#00f2fe',
  },
  fileInput: {
    background: 'rgba(255, 255, 255, 0.02)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '12px',
    padding: '10px',
    color: '#fff',
    cursor: 'pointer',
  },
  previewContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    flexGrow: 1,
    overflow: 'hidden',
    marginBottom: '20px',
  },
  previewTitle: {
    fontFamily: 'Outfit, sans-serif',
    fontWeight: '500',
    fontSize: '0.9rem',
    color: '#9ca3af',
  },
  tableWrapper: {
    overflowY: 'auto',
    border: '1px solid var(--panel-border)',
    borderRadius: '8px',
    maxHeight: '180px',
  },
  previewTable: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '0.85rem',
    textAlign: 'left',
  },
  previewTableTh: {
    background: 'rgba(255, 255, 255, 0.03)',
    color: '#9ca3af',
    padding: '8px 12px',
    borderBottom: '1px solid var(--panel-border)',
  },
  previewTableTd: {
    padding: '8px 12px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.01)',
  },
  footer: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '12px',
    marginTop: 'auto',
    paddingTop: '10px',
    flexShrink: 0,
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
    flexShrink: 0,
  },
  errorText: {
    color: '#fca5a5',
    fontSize: '0.85rem',
    margin: 0,
  },
};
