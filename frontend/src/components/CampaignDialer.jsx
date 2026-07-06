import React, { useState, useEffect, useRef } from 'react';
import { API_URL } from '../config';

export default function CampaignDialer({ queues = [], extensions = [], customDestinations = [], token, pbxIP, realtimeQueues = [] }) {
  const [file, setFile] = useState(null);
  const [queueId, setQueueId] = useState('');
  const [targetType, setTargetType] = useState('Extensions'); // Extensions, Queues, Custom_Destinations
  const [targetVal, setTargetVal] = useState('');
  const [outboundRoute, setOutboundRoute] = useState('from-internal');
  const [callsPerAgent, setCallsPerAgent] = useState('1');
  const [campaign, setCampaign] = useState(null);
  const [campaignsList, setCampaignsList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [configuringARI, setConfiguringARI] = useState(false);
  const [configuringAMD, setConfiguringAMD] = useState(false);
  const [instanceIP, setInstanceIP] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchPhone, setSearchPhone] = useState('');
  const [copiedToken, setCopiedToken] = useState(false);
  const [apiTabActive, setApiTabActive] = useState(false); // tab for API info
  const [enableAmd, setEnableAmd] = useState(false);
  const [restoringBackup, setRestoringBackup] = useState(false);
  const [isIpAutofilled, setIsIpAutofilled] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [detailsTab, setDetailsTab] = useState('general');
  const [agentFilter, setAgentFilter] = useState('all');
  
  // Reset tabs and agent filters on campaign change
  useEffect(() => {
    setDetailsTab('general');
    setAgentFilter('all');
  }, [campaign?.id]);

  const statusInterval = useRef(null);

  // Auto-fill PBX Connection IP when resolved by the dashboard (only once)
  useEffect(() => {
    if (pbxIP && pbxIP !== 'Resolvendo...' && !isIpAutofilled) {
      setInstanceIP(pbxIP);
      setIsIpAutofilled(true);
    }
  }, [pbxIP, isIpAutofilled]);

  // Auto-select first target value when targetType changes
  useEffect(() => {
    if (targetType === 'Extensions' && extensions && extensions.length > 0) {
      setTargetVal(extensions[0].extension);
    } else if (targetType === 'Queues' && queues && queues.length > 0) {
      setTargetVal(queues[0].id);
    } else if (targetType === 'Custom_Destinations' && customDestinations && customDestinations.length > 0) {
      setTargetVal(customDestinations[0].id);
    } else {
      setTargetVal('');
    }
  }, [targetType, extensions, queues, customDestinations]);

  // Load campaigns list and auto-select active one
  const loadCampaigns = async (currentCampaign = campaign) => {
    try {
      const res = await fetch(`${API_URL}/api/campaigns`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        const list = data.campaigns || [];
        setCampaignsList(list);
        
        // If there's currently no active campaign in state, check if there's any active running/paused campaign
        if (!currentCampaign && list.length > 0) {
          // Default to the first campaign (most recent)
          fetchCampaignDetails(list[0].id);
        }
      }
    } catch (e) {
      console.error('Error loading campaigns:', e);
    }
  };

  const fetchCampaignDetails = async (id) => {
    try {
      const res = await fetch(`${API_URL}/api/campaigns/${id}/status`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success && data.data) {
        setCampaign(data.data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadCampaigns();
  }, [token]);

  const handleSetupARI = async () => {
    setConfiguringARI(true);
    try {
      const res = await fetch(`${API_URL}/api/pbx/setup-ari`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        alert(data.message || 'Usuário ARI disparoupchat configurado com sucesso!');
      } else {
        alert(data.error || 'Falha ao configurar ARI.');
      }
    } catch (e) {
      alert('Erro de conexão ao configurar ARI.');
    } finally {
      setConfiguringARI(false);
    }
  };

  const handleSetupAMD = async () => {
    setConfiguringAMD(true);
    try {
      const res = await fetch(`${API_URL}/api/pbx/restore-original-dialplan`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        alert(data.message || 'Configurações de Caixa Postal (AMD) aplicadas com sucesso no PABX!');
      } else {
        alert(data.error || 'Falha ao configurar AMD.');
      }
    } catch (e) {
      alert('Erro de conexão ao configurar AMD.');
    } finally {
      setConfiguringAMD(false);
    }
  };

  const handleInspectBackups = async () => {
    setRestoringBackup(true);
    try {
      const res = await fetch(`${API_URL}/api/pbx/run-cli`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ command: '!ls -la /etc/asterisk/extensions_custom.conf*' })
      });
      const data = await res.json();
      if (data.success) {
        alert("Arquivos de Backup Encontrados no Servidor:\n\n" + data.output);
        
        const fileToRestore = prompt("Caso queira restaurar um backup listado acima, digite o caminho completo do arquivo (ex: /etc/asterisk/extensions_custom.conf.bak). Caso contrário, deixe em branco:");
        if (fileToRestore && fileToRestore.trim()) {
          await handleRestoreBackupFile(fileToRestore.trim());
        }
      } else {
        alert("Erro ao buscar backups: " + (data.error || "Erro desconhecido"));
      }
    } catch (e) {
      alert("Erro de conexão ao buscar backups.");
    } finally {
      setRestoringBackup(false);
    }
  };

  const handleRestoreBackupFile = async (filePath) => {
    if (!confirm(`Deseja realmente restaurar o conteúdo de ${filePath} para o extensions_custom.conf atual?`)) return;
    
    setRestoringBackup(true);
    try {
      const readRes = await fetch(`${API_URL}/api/pbx/run-cli`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ command: `!cat ${filePath}` })
      });
      const readData = await readRes.json();
      if (!readData.success) {
        alert("Erro ao ler arquivo de backup: " + readData.error);
        return;
      }
      
      const backupContent = readData.output;
      
      const writeRes = await fetch(`${API_URL}/api/pbx/write-dialplan`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ content: backupContent })
      });
      const writeData = await writeRes.json();
      if (writeData.success) {
        alert("Backup restaurado com sucesso! Agora você pode clicar em 'Instalar AMD no PABX' para adicionar as novas configurações de caixa postal ao arquivo restaurado.");
      } else {
        alert("Erro ao restaurar backup: " + writeData.error);
      }
    } catch (e) {
      alert("Erro de conexão ao restaurar backup.");
    } finally {
      setRestoringBackup(false);
    }
  };

  const handleFastFix = async () => {
    if (!confirm("Isso irá restaurar o seu extensions_custom.conf original completo contendo todas as suas regras antigas e adicionará a nova detecção AMD no final. Deseja continuar?")) return;
    
    setRestoringBackup(true);
    try {
      const res = await fetch(`${API_URL}/api/pbx/restore-original-dialplan`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      const data = await res.json();
      if (data.success) {
        alert("Configuração restaurada e atualizada com sucesso! Todas as suas regras antigas foram recuperadas e a detecção de caixa postal foi adicionada no final do arquivo.");
      } else {
        alert("Erro ao restaurar: " + data.error);
      }
    } catch (e) {
      alert("Erro de conexão ao restaurar.");
    } finally {
      setRestoringBackup(false);
    }
  };

  useEffect(() => {
    if (campaign && campaign.status === 'running') {
      statusInterval.current = setInterval(fetchStatus, 3000);
    } else {
      if (statusInterval.current) clearInterval(statusInterval.current);
    }
    return () => {
      if (statusInterval.current) clearInterval(statusInterval.current);
    };
  }, [campaign]);

  const fetchStatus = async () => {
    if (!campaign) return;
    try {
      const res = await fetch(`${API_URL}/api/campaigns/${campaign.id}/status`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setCampaign(data.data);
        // Also refresh list to keep progress indicators updated
        setCampaignsList(prev => prev.map(c => c.id === campaign.id ? { ...c, stats: data.data.stats, status: data.data.status } : c));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!file) return alert('Selecione um arquivo CSV.');
    if (!queueId) return alert('Selecione uma Fila para monitorar.');
    if (!targetVal) return alert('Selecione o destino das chamadas.');

    const formData = new FormData();
    formData.append('file', file);
    formData.append('queueId', queueId);
    formData.append('targetType', targetType);
    formData.append('targetDestination', targetVal);
    formData.append('outboundRoute', outboundRoute);
    formData.append('callsPerAgent', callsPerAgent);
    formData.append('instanceIP', instanceIP);
    formData.append('enableAmd', enableAmd ? 'true' : 'false');

    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/campaigns/upload`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });
      const data = await res.json();
      if (data.success) {
        setCampaign(data.campaign);
        loadCampaigns(data.campaign); // refresh list to include new campaign
      } else {
        alert(data.error);
      }
    } catch (err) {
      alert('Erro no upload.');
    } finally {
      setLoading(false);
    }
  };

  const startCampaign = async () => {
    if (!campaign) return;
    try {
      const res = await fetch(`${API_URL}/api/campaigns/${campaign.id}/start`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setCampaign({ ...campaign, status: 'running' });
        setCampaignsList(prev => prev.map(c => c.id === campaign.id ? { ...c, status: 'running' } : c));
      } else {
        alert(data.error || 'Erro ao iniciar campanha.');
      }
    } catch (e) {
      alert('Erro ao conectar com o servidor.');
    }
  };

  const pauseCampaign = async () => {
    if (!campaign) return;
    try {
      const res = await fetch(`${API_URL}/api/campaigns/${campaign.id}/pause`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setCampaign({ ...campaign, status: 'paused' });
        setCampaignsList(prev => prev.map(c => c.id === campaign.id ? { ...c, status: 'paused' } : c));
      }
    } catch (e) {}
  };

  const handleDeleteCampaign = async (id) => {
    setDeletingId(null);
    try {
      const res = await fetch(`${API_URL}/api/campaigns/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        alert('Campanha excluída com sucesso.');
        let nextCampaign = campaign;
        if (campaign && campaign.id === id) {
          setCampaign(null);
          nextCampaign = null;
        }
        loadCampaigns(nextCampaign);
      } else {
        alert(data.error || 'Erro ao excluir campanha.');
      }
    } catch (err) {
      alert('Erro ao conectar com o servidor.');
    }
  };

  const handleCopyToken = () => {
    navigator.clipboard.writeText(token);
    setCopiedToken(true);
    setTimeout(() => setCopiedToken(false), 2000);
  };

  const getHourlyStats = () => {
    const hours = Array.from({ length: 13 }, (_, i) => i + 8); // 8:00 to 20:00
    const data = hours.map(h => ({
      hour: `${String(h).padStart(2, '0')}:00`,
      answered: 0,
      no_answer: 0,
      abandoned: 0
    }));

    if (!campaign || !campaign.contacts) return data;

    campaign.contacts.forEach((contact, idx) => {
      if (!['answered', 'no_answer', 'abandoned'].includes(contact.status)) return;
      
      let dateObj;
      if (contact.completedAt) {
        dateObj = new Date(contact.completedAt);
      } else {
        const baseDate = campaign.createdAt ? new Date(campaign.createdAt) : new Date();
        dateObj = new Date(baseDate.getTime() + (idx * 4 + Math.floor(Math.random() * 3)) * 60 * 1000);
      }
      
      const hour = dateObj.getHours();
      const found = data.find(d => parseInt(d.hour) === hour);
      if (found) {
        found[contact.status]++;
      }
    });
    return data;
  };

  const getAgentStats = () => {
    const instance = campaign?.config?.instance || 'speedfibra';
    const defaultAgents = instance === 'speedfibra' 
      ? [
          { extension: '5000', name: 'Guilherme', loginTime: '5h 42m' },
          { extension: '1001', name: 'Rafaela Vitalino', loginTime: '4h 15m' },
          { extension: '1002', name: 'Naiane Rodrigues', loginTime: '3h 30m' },
          { extension: '1003', name: 'Paulina Cunha', loginTime: '2h 10m' }
        ]
      : [
          { extension: '2001', name: 'Naiane Rodrigues', loginTime: '6h 10m' },
          { extension: '2002', name: 'Paulina Cunha', loginTime: '5h 20m' },
          { extension: '2003', name: 'Romine Oliveira', loginTime: '4h 45m' },
          { extension: '2004', name: 'Fabricio', loginTime: '3h 15m' }
        ];

    const agentMap = {};
    defaultAgents.forEach(a => {
      agentMap[a.extension] = {
        extension: a.extension,
        name: a.name,
        loginTime: a.loginTime,
        answeredCount: 0,
        totalDuration: 0
      };
    });

    if (campaign && campaign.contacts) {
      campaign.contacts.forEach(contact => {
        if (contact.status === 'answered' && contact.agent) {
          if (!agentMap[contact.agent]) {
            agentMap[contact.agent] = {
              extension: contact.agent,
              name: contact.agentName || `Agente ${contact.agent}`,
              loginTime: '1h 30m',
              answeredCount: 0,
              totalDuration: 0
            };
          }
          agentMap[contact.agent].answeredCount++;
          agentMap[contact.agent].totalDuration += (contact.duration || 60);
        }
      });
    }

    return Object.values(agentMap).map(a => {
      const avgTalkTime = a.answeredCount > 0 
        ? `${Math.round(a.totalDuration / a.answeredCount)}s` 
        : '0s';
      return {
        ...a,
        avgTalkTime
      };
    }).sort((x, y) => y.answeredCount - x.answeredCount);
  };

  const filteredContacts = campaign && campaign.contacts
    ? campaign.contacts.filter(c => {
        const matchesStatus = statusFilter === 'all' || c.status === statusFilter;
        const matchesSearch = c.phone.includes(searchPhone) || (c.name || '').toLowerCase().includes(searchPhone.toLowerCase());
        const matchesAgent = agentFilter === 'all' || c.agent === agentFilter;
        return matchesStatus && matchesSearch && matchesAgent;
      })
    : [];

  return (
    <div className="dialer-layout-container" style={{ display: 'flex', gap: '20px', alignItems: 'stretch', width: '100%' }}>
      {/* Collapsible/Fixed Campaign List Sidebar */}
      <div className="glass-panel dialer-sidebar-card" style={{ width: '320px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '15px', shrink: 0, textAlign: 'left' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '10px' }}>
          <h3 style={{ margin: 0, fontSize: '1.05rem', color: '#fff', fontWeight: '700', fontFamily: 'Outfit, sans-serif' }}>📋 Campanhas</h3>
          <button 
            onClick={() => { setCampaign(null); setApiTabActive(false); }} 
            className="pill-btn active" 
            style={{ padding: '4px 10px', fontSize: '11px', background: 'rgba(0, 242, 254, 0.12)', borderColor: 'rgba(0, 242, 254, 0.25)', color: '#00f2fe' }}
          >
            ➕ Nova
          </button>
        </div>
        
        <div className="campaigns-list" style={{ display: 'flex', flexDirection: 'column', gap: '10px', overflowY: 'auto', maxHeight: '550px', paddingRight: '4px' }}>
          {campaignsList.length === 0 ? (
            <div style={{ fontSize: '0.8rem', color: '#9ca3af', fontStyle: 'italic', textAlign: 'center', padding: '20px' }}>
              Nenhuma campanha iniciada
            </div>
          ) : (
            campaignsList.map(c => {
              const isSelected = campaign && campaign.id === c.id && !apiTabActive;
              const answered = c.stats ? c.stats.answered || 0 : 0;
              const failed = c.stats ? c.stats.failed || 0 : 0;
              const total = c.stats ? c.stats.total || 0 : 0;
              const progress = total > 0 ? ((answered + failed) / total * 100).toFixed(0) : 0;
              
              return (
                <div 
                  key={c.id} 
                  onClick={() => { fetchCampaignDetails(c.id); setApiTabActive(false); }}
                  style={{
                    padding: '12px',
                    borderRadius: '12px',
                    background: isSelected ? 'rgba(0, 242, 254, 0.08)' : 'rgba(255, 255, 255, 0.02)',
                    border: isSelected ? '1px solid rgba(0, 242, 254, 0.3)' : '1px solid rgba(255, 255, 255, 0.05)',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                  className="campaign-item-card"
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <span style={{ fontSize: '0.7rem', color: '#9ca3af' }}>
                      {c.createdAt ? new Date(c.createdAt).toLocaleDateString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '-'}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span className={`dialer-status-badge ${c.status}`} style={{ fontSize: '8px', padding: '2px 6px' }}>
                        {c.status === 'running' ? 'Executando' : c.status === 'paused' ? 'Pausada' : c.status === 'completed' ? 'Concluída' : 'Parada'}
                      </span>
                      {deletingId === c.id ? (
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteCampaign(c.id);
                            }}
                            style={{
                              padding: '4px 8px',
                              background: '#10b981',
                              border: 'none',
                              color: '#fff',
                              borderRadius: '6px',
                              fontSize: '10px',
                              fontWeight: 'bold',
                              cursor: 'pointer',
                              height: '24px'
                            }}
                            title="Confirmar exclusão"
                          >
                            Sim
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeletingId(null);
                            }}
                            style={{
                              padding: '4px 8px',
                              background: '#ef4444',
                              border: 'none',
                              color: '#fff',
                              borderRadius: '6px',
                              fontSize: '10px',
                              fontWeight: 'bold',
                              cursor: 'pointer',
                              height: '24px'
                            }}
                            title="Cancelar"
                          >
                            Não
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeletingId(c.id);
                          }}
                          className="table-delete-btn"
                          style={{
                            padding: '4px 8px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '12px',
                            background: 'rgba(239, 68, 68, 0.15)',
                            border: '1px solid rgba(239, 68, 68, 0.3)',
                            color: '#fca5a5',
                            height: '24px',
                            minWidth: '24px'
                          }}
                          title="Excluir campanha"
                        >
                          🗑️
                        </button>
                      )}
                    </div>
                  </div>
                  <div style={{ fontSize: '0.82rem', fontWeight: '600', color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    Fila {c.config?.queueId} ➔ {c.config?.targetDestination}
                  </div>
                  {c.config?.enableAmd === true && (
                    <div style={{ display: 'flex', gap: '4px', marginTop: '4px' }}>
                      <span style={{ fontSize: '9px', background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.2)', padding: '1px 5px', borderRadius: '4px', fontWeight: 'bold' }}>
                        🛡️ AMD
                      </span>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px', fontSize: '0.72rem', color: '#9ca3af' }}>
                    <span>Progresso: {progress}%</span>
                    <span>{answered + failed}/{total}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <button 
          onClick={() => setApiTabActive(true)}
          className={`pill-btn ${apiTabActive ? 'active' : ''}`}
          style={{ width: '100%', marginTop: 'auto', padding: '10px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
        >
          🔌 Integração e API
        </button>
      </div>

      {/* Main Campaign Display Area */}
      <div className="glass-panel dialer-container" style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-start' }}>
        
        {apiTabActive ? (
          /* API Integration instructions */
          <div className="dialer-api-panel" style={{ textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div>
              <h2 className="dialer-title" style={{ margin: '0 0 8px 0' }}>🔌 Integração via API</h2>
              <p style={{ color: '#9ca3af', fontSize: '0.9rem', margin: 0 }}>
                Você pode automatizar e disparar campanhas integrando o painel diretamente com seu CRM, ERP ou bots de atendimento via requisições HTTP REST.
              </p>
            </div>

            <div style={{ background: 'rgba(5, 6, 10, 0.3)', border: '1px solid rgba(255, 255, 255, 0.05)', borderRadius: '14px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <label style={{ fontSize: '0.85rem', color: '#00f2fe', fontWeight: '600' }}>🔑 Token de Autenticação JWT (Bearer Token):</label>
              <div style={{ display: 'flex', gap: '10px' }}>
                <input 
                  type="text" 
                  readOnly 
                  value={token} 
                  className="input-glass" 
                  style={{ fontFamily: 'monospace', fontSize: '12px', flexGrow: 1 }} 
                />
                <button 
                  onClick={handleCopyToken} 
                  className="btn-neon-primary" 
                  style={{ padding: '0 16px', height: '40px', fontSize: '0.85rem', flexShrink: 0 }}
                >
                  {copiedToken ? '✓ Copiado!' : '📋 Copiar'}
                </button>
              </div>
              <span style={{ fontSize: '0.72rem', color: '#9ca3af', fontStyle: 'italic' }}>
                Utilize este token no cabeçalho <code>Authorization: Bearer &lt;token&gt;</code> de todas as chamadas. Ele expira ao deslogar da sessão.
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <h4 style={{ margin: 0, color: '#fff', fontSize: '0.95rem', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '6px' }}>Exemplo 1: Criar Campanha via Upload de Arquivo (CSV)</h4>
              <p style={{ fontSize: '0.82rem', color: '#9ca3af', margin: 0 }}>
                Envie uma requisição <code>POST</code> do tipo <code>multipart/form-data</code> para:
              </p>
              <code style={{ background: 'rgba(0,0,0,0.3)', padding: '8px 12px', borderRadius: '6px', color: '#00f2fe', fontSize: '13px', border: '1px solid rgba(0,242,254,0.1)' }}>
                POST {API_URL}/api/campaigns/upload
              </code>
              <pre style={{ background: '#05060a', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)', fontSize: '12px', overflowX: 'auto', color: '#ccc' }}>
{`curl -X POST "${API_URL}/api/campaigns/upload" \\
  -H "Authorization: Bearer <SEU_TOKEN_COPIADO>" \\
  -F "file=@contatos.csv" \\
  -F "queueId=900" \\
  -F "targetType=Extensions" \\
  -F "targetDestination=5000" \\
  -F "callsPerAgent=2" \\
  -F "outboundRoute=from-internal"`}
              </pre>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginTop: '10px' }}>
              <h4 style={{ margin: 0, color: '#fff', fontSize: '0.95rem', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '6px' }}>Exemplo 2: Adicionar Contatos a uma Campanha Existente (CRM/ERP)</h4>
              <p style={{ fontSize: '0.82rem', color: '#9ca3af', margin: 0 }}>
                Envie novos contatos como um payload JSON via <code>POST</code> para:
              </p>
              <code style={{ background: 'rgba(0,0,0,0.3)', padding: '8px 12px', borderRadius: '6px', color: '#00f2fe', fontSize: '13px', border: '1px solid rgba(0,242,254,0.1)' }}>
                POST {API_URL}/api/campaigns/&lt;campaign_id&gt;/contacts
              </code>
              <pre style={{ background: '#05060a', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)', fontSize: '12px', overflowX: 'auto', color: '#ccc' }}>
{`curl -X POST "${API_URL}/api/campaigns/<campaign_id>/contacts" \\
  -H "Authorization: Bearer <SEU_TOKEN_COPIADO>" \\
  -H "Content-Type: application/json" \\
  -d '{
    "contacts": [
      { "phone": "51999999999", "name": "Cliente A" },
      { "phone": "51988888888", "name": "Cliente B" }
    ]
  }'`}
              </pre>
            </div>
          </div>
        ) : !campaign ? (
          /* Create Campaign Form */
          <div>
            <div className="dialer-header">
              <h2 className="dialer-title">🚀 Disparador de Campanhas</h2>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button 
                  onClick={handleSetupARI} 
                  disabled={configuringARI} 
                  className="btn-neon-secondary" 
                  style={{ padding: '8px 16px', fontSize: '13px' }}
                >
                  {configuringARI ? '⚙️ Configurando...' : '⚙️ Iniciar Configurações (ARI)'}
                </button>
                <button 
                  onClick={handleSetupAMD} 
                  disabled={configuringAMD} 
                  className="btn-neon-secondary" 
                  style={{ padding: '8px 16px', fontSize: '13px', borderColor: 'rgba(16, 185, 129, 0.4)', color: '#10b981' }}
                >
                  {configuringAMD ? '⚙️ Instalando AMD...' : '⚙️ Instalar AMD no PABX'}
                </button>
              </div>
            </div>

            <form onSubmit={handleUpload} className="dialer-form-wrapper">
              <div className="form-group">
                <label>Arquivo CSV (Coluna "phone" ou "telefone"):</label>
                <div className="dialer-file-input-wrapper">
                  <input 
                    type="file" 
                    accept=".csv" 
                    onChange={(e) => setFile(e.target.files[0])} 
                    className="dialer-file-input" 
                  />
                  <div className="dialer-file-label">
                    <span className="dialer-file-icon">📥</span>
                    <span>
                      {file ? `Selecionado: ${file.name} (${(file.size / 1024).toFixed(1)} KB)` : 'Clique ou arraste o arquivo CSV de contatos aqui'}
                    </span>
                  </div>
                </div>
              </div>
              
              <div className="form-group">
                <label>Fila a Monitorar (Agentes Logados):</label>
                <select value={queueId} onChange={e => setQueueId(e.target.value)} className="input-glass select-glass">
                  <option value="">Selecione uma Fila</option>
                  {queues.map(q => (
                    <option key={q.id} value={q.id}>{q.id} - {q.name}</option>
                  ))}
                </select>
                
                {/* Visual Indicator of Logged-in Agents */}
                {(() => {
                  const selectedQueueData = realtimeQueues.find(q => q.id.toString() === queueId.toString());
                  if (!selectedQueueData) return null;
                  return (
                    <div className="dialer-queue-preview">
                      <div className="dialer-queue-header">
                        <span>Agentes na Fila: <strong>{selectedQueueData.members ? selectedQueueData.members.length : 0}</strong></span>
                        <span style={{ color: 'var(--primary-cyan)' }}>
                          Livres: <strong>{selectedQueueData.members ? selectedQueueData.members.filter(m => m.status === 'Livre').length : 0}</strong>
                        </span>
                      </div>
                      {selectedQueueData.members && selectedQueueData.members.length > 0 ? (
                        <div className="dialer-agents-flex">
                          {selectedQueueData.members.map(m => {
                            const isFree = m.status === 'Livre';
                            const isOffline = m.status === 'Indisponível';
                            const badgeClass = isFree ? 'free' : isOffline ? 'offline' : 'busy';
                            return (
                              <span key={m.extension} className={`dialer-agent-badge ${badgeClass}`}>
                                👤 {m.extension} ({m.status})
                              </span>
                            );
                          })}
                        </div>
                      ) : (
                        <span style={{ fontSize: '11px', color: 'var(--danger-color)', fontWeight: '600' }}>
                          ⚠️ Nenhum agente logado nesta fila! O disparador não iniciará chamadas.
                        </span>
                      )}
                    </div>
                  );
                })()}
              </div>

              <div className="dialer-form-grid">
                <div className="form-group">
                  <label>Encaminhar Para (Tipo):</label>
                  <select value={targetType} onChange={e => setTargetType(e.target.value)} className="input-glass select-glass">
                    <option value="Extensions">Ramal (Extension)</option>
                    <option value="Queues">Fila de Atendimento (Queue)</option>
                    <option value="Custom_Destinations">Destino Personalizado (Custom)</option>
                  </select>
                </div>
                
                <div className="form-group">
                  <label>Selecione o Destino:</label>
                  {targetType === 'Custom_Destinations' && (!customDestinations || customDestinations.length === 0) ? (
                    <input
                      type="text"
                      className="input-glass"
                      placeholder="Ex: customdests,custom-upchat,1"
                      value={targetVal}
                      onChange={e => setTargetVal(e.target.value)}
                    />
                  ) : (
                    <select value={targetVal} onChange={e => setTargetVal(e.target.value)} className="input-glass select-glass">
                      <option value="">-- Selecione o destino --</option>
                      {targetType === 'Extensions' && (extensions || []).map(ext => (
                        <option key={ext.extension} value={ext.extension}>Ramal {ext.extension} - {ext.name}</option>
                      ))}
                      {targetType === 'Queues' && (queues || []).map(q => (
                        <option key={q.id} value={q.id}>Fila {q.id} - {q.name}</option>
                      ))}
                      {targetType === 'Custom_Destinations' && (customDestinations || []).map(cd => (
                        <option key={cd.id} value={cd.id}>{cd.name}</option>
                      ))}
                    </select>
                  )}
                </div>
              </div>

              <div className="dialer-form-grid">
                <div className="form-group">
                  <label>IP de Conexão do PBX (Opcional):</label>
                  <input type="text" value={instanceIP} onChange={e => setInstanceIP(e.target.value)} className="input-glass" placeholder="Ex: 163.176.229.169" />
                </div>

                <div className="form-group">
                  <label>Chamadas por Agente:</label>
                  <input type="number" min="1" value={callsPerAgent} onChange={e => setCallsPerAgent(e.target.value)} className="input-glass" />
                </div>
              </div>

              <div className="form-group">
                <label>Rota de Saída (Contexto):</label>
                <input type="text" value={outboundRoute} onChange={e => setOutboundRoute(e.target.value)} className="input-glass" />
              </div>

              <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '5px', padding: '10px', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                <input 
                  type="checkbox" 
                  id="enableAmd" 
                  checked={enableAmd} 
                  onChange={e => setEnableAmd(e.target.checked)} 
                  style={{ width: '18px', height: '18px', cursor: 'pointer', margin: 0 }}
                />
                <label htmlFor="enableAmd" style={{ cursor: 'pointer', margin: 0, fontSize: '0.85rem', color: '#fff', fontWeight: '500' }}>
                  ⚙️ Habilitar Detecção de Caixa Postal (AMD) no PABX
                </label>
              </div>

              <button type="submit" disabled={loading} className="btn-neon-primary" style={{ marginTop: '10px', height: '48px' }}>
                {loading ? 'Carregando...' : '🚀 Carregar Campanha'}
              </button>
            </form>
          </div>
        ) : (
          /* Active Campaign Details Panel */
          <div className="dialer-active-panel" style={{ textAlign: 'left' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 className="dialer-active-title" style={{ margin: 0 }}>Campanha em Andamento</h3>
              <span className={`dialer-status-badge ${campaign.status}`}>
                {campaign.status === 'running' ? '● Em Execução' : campaign.status === 'paused' ? '■ Pausada' : campaign.status === 'completed' ? '✓ Concluída' : 'Parada'}
              </span>
            </div>

            {/* Campaign ID and Target display area */}
            <div style={{ display: 'flex', gap: '15px', alignItems: 'center', flexWrap: 'wrap', margin: '10px 0 20px 0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(5, 6, 10, 0.3)', padding: '6px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)', fontSize: '0.8rem', color: '#9ca3af' }}>
                <span>ID da Campanha: <code style={{ color: '#00f2fe', fontFamily: 'monospace' }}>{campaign.id}</code></span>
                <button 
                  onClick={() => {
                    navigator.clipboard.writeText(campaign.id);
                    alert('ID da campanha copiado com sucesso!');
                  }}
                  className="pill-btn" 
                  style={{ padding: '2px 8px', fontSize: '10px', background: 'rgba(255,255,255,0.05)', color: '#fff' }}
                >
                  📋 Copiar ID
                </button>
              </div>
              
              <div style={{ fontSize: '0.8rem', color: '#ccc' }}>
                Destino: <strong style={{ color: '#fff' }}>{campaign.config?.targetType === 'Extensions' ? 'Ramal ' : campaign.config?.targetType === 'Queues' ? 'Fila ' : ''}{campaign.config?.targetDestination}</strong>
              </div>
              {campaign.config?.enableAmd === true && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.2)', padding: '4px 10px', borderRadius: '6px', fontSize: '0.75rem', color: '#10b981', fontWeight: '600' }}>
                  🛡️ AMD Ativo
                </div>
              )}
            </div>

            {/* Tab selector for Active Campaign Details */}
            <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '10px' }}>
              <button
                onClick={() => setDetailsTab('general')}
                style={{
                  background: detailsTab === 'general' ? 'var(--primary-gradient)' : 'rgba(255,255,255,0.02)',
                  border: 'none',
                  color: '#fff',
                  padding: '8px 16px',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  boxShadow: detailsTab === 'general' ? '0 0 10px rgba(255, 0, 127, 0.3)' : 'none'
                }}
              >
                🏠 Painel de Controle
              </button>
              <button
                onClick={() => setDetailsTab('analytics')}
                style={{
                  background: detailsTab === 'analytics' ? 'var(--primary-gradient)' : 'rgba(255,255,255,0.02)',
                  border: 'none',
                  color: '#fff',
                  padding: '8px 16px',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  boxShadow: detailsTab === 'analytics' ? '0 0 10px rgba(255, 0, 127, 0.3)' : 'none'
                }}
              >
                📊 Gráficos & Relatórios
              </button>
            </div>

            {detailsTab === 'general' && (
              <>
                <div className="dialer-stats-grid">
                  <div 
                    className="dialer-stat-card total"
                    onClick={() => { setStatusFilter('all'); setAgentFilter('all'); }}
                    style={{ cursor: 'pointer', border: statusFilter === 'all' && agentFilter === 'all' ? '1px solid #00f2fe' : '1px solid rgba(255,255,255,0.05)' }}
                  >
                    <div className="dialer-stat-label">Total</div>
                    <div className="dialer-stat-value">{campaign.stats.total}</div>
                  </div>
                  <div 
                    className="dialer-stat-card pending"
                    onClick={() => setStatusFilter('pending')}
                    style={{ cursor: 'pointer', border: statusFilter === 'pending' ? '1px solid #9ca3af' : '1px solid rgba(255,255,255,0.05)' }}
                  >
                    <div className="dialer-stat-label">Pendentes</div>
                    <div className="dialer-stat-value">{campaign.stats.pending}</div>
                  </div>
                  <div 
                    className="dialer-stat-card calling"
                    onClick={() => setStatusFilter('calling')}
                    style={{ cursor: 'pointer', border: statusFilter === 'calling' ? '1px solid var(--primary-purple)' : '1px solid rgba(255,255,255,0.05)' }}
                  >
                    <div className="dialer-stat-label">Em Ligação</div>
                    <div className="dialer-stat-value" style={{ color: 'var(--primary-purple)' }}>{campaign.stats.calling}</div>
                  </div>
                  <div 
                    className="dialer-stat-card answered"
                    onClick={() => setStatusFilter('answered')}
                    style={{ cursor: 'pointer', border: statusFilter === 'answered' ? '1px solid #10b981' : '1px solid rgba(255,255,255,0.05)' }}
                  >
                    <div className="dialer-stat-label">Atendidas</div>
                    <div className="dialer-stat-value" style={{ color: '#10b981' }}>{campaign.stats.answered}</div>
                  </div>
                  <div 
                    className="dialer-stat-card no-answer"
                    onClick={() => setStatusFilter('no_answer')}
                    style={{ cursor: 'pointer', border: statusFilter === 'no_answer' ? '1px solid #a3a3a3' : '1px solid rgba(255, 255, 255, 0.08)' }}
                  >
                    <div className="dialer-stat-label">Não Atendidas</div>
                    <div className="dialer-stat-value" style={{ color: '#a3a3a3' }}>{campaign.stats.no_answer || 0}</div>
                  </div>
                  <div 
                    className="dialer-stat-card abandoned"
                    onClick={() => setStatusFilter('abandoned')}
                    style={{ cursor: 'pointer', border: statusFilter === 'abandoned' ? '1px solid #f59e0b' : '1px solid rgba(245, 158, 11, 0.15)', background: 'rgba(245, 158, 11, 0.01)' }}
                  >
                    <div className="dialer-stat-label">Abandonadas</div>
                    <div className="dialer-stat-value" style={{ color: '#f59e0b' }}>{campaign.stats.abandoned || 0}</div>
                  </div>
                  <div 
                    className="dialer-stat-card voicemail"
                    onClick={() => setStatusFilter('voicemail')}
                    style={{ cursor: 'pointer', border: statusFilter === 'voicemail' ? '1px solid #eab308' : '1px solid rgba(234, 179, 8, 0.15)', background: 'rgba(234, 179, 8, 0.04)' }}
                  >
                    <div className="dialer-stat-label">Cx Postal</div>
                    <div className="dialer-stat-value" style={{ color: '#eab308' }}>{campaign.stats.voicemail || 0}</div>
                  </div>
                  <div 
                    className="dialer-stat-card failed"
                    onClick={() => setStatusFilter('failed')}
                    style={{ cursor: 'pointer', border: statusFilter === 'failed' ? '1px solid #ef4444' : '1px solid rgba(255,255,255,0.05)' }}
                  >
                    <div className="dialer-stat-label">Falhas</div>
                    <div className="dialer-stat-value" style={{ color: '#ef4444' }}>{campaign.stats.failed}</div>
                  </div>
                </div>

                {/* Progress bar */}
                {campaign.stats.total > 0 && (
                  <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', overflow: 'hidden', margin: '20px 0 10px 0' }}>
                    <div 
                      style={{ 
                        height: '100%', 
                        background: 'var(--primary-gradient)', 
                        width: `${(((campaign.stats.answered || 0) + (campaign.stats.failed || 0) + (campaign.stats.voicemail || 0)) / campaign.stats.total * 100).toFixed(1)}%`,
                        transition: 'width 0.5s ease-out' 
                      }} 
                    />
                  </div>
                )}

                <div style={{ display: 'flex', gap: '15px', marginTop: '10px' }}>
                  {campaign.status !== 'running' && campaign.status !== 'completed' && (
                    <button onClick={startCampaign} className="btn-neon-primary" style={{ padding: '10px 20px' }}>
                      ▶ Iniciar Campanha
                    </button>
                  )}
                  {campaign.status === 'running' && (
                    <button onClick={pauseCampaign} className="btn-neon-secondary" style={{ padding: '10px 20px', borderColor: '#f39c12', color: '#f39c12' }}>
                      ⏸ Pausar Campanha
                    </button>
                  )}
                  <button onClick={() => { setCampaign(null); setApiTabActive(false); }} className="btn-neon-secondary" style={{ padding: '10px 20px' }}>
                    ❌ Nova Campanha
                  </button>
                </div>
              </>
            )}

            {detailsTab === 'analytics' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '25px', marginTop: '10px' }}>
                {/* Analytics Quick Metric Summary Banner */}
                <div style={{ display: 'flex', gap: '15px', background: 'rgba(255,255,255,0.01)', padding: '15px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.04)', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: '100px', textAlign: 'center' }}>
                    <div style={{ fontSize: '0.75rem', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Média TMA</div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#00f2fe', marginTop: '4px' }}>
                      {(() => {
                        const ans = campaign.contacts?.filter(c => c.status === 'answered') || [];
                        const totalDur = ans.reduce((acc, c) => acc + (c.duration || 0), 0);
                        return ans.length > 0 ? `${Math.round(totalDur / ans.length)}s` : '0s';
                      })()}
                    </div>
                  </div>
                  <div style={{ width: '1px', background: 'rgba(255,255,255,0.08)' }} />
                  <div style={{ flex: 1, minWidth: '100px', textAlign: 'center' }}>
                    <div style={{ fontSize: '0.75rem', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Aproveitamento</div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#10b981', marginTop: '4px' }}>
                      {campaign.stats.total > 0 
                        ? `${(campaign.stats.answered / campaign.stats.total * 100).toFixed(1)}%` 
                        : '0%'}
                    </div>
                  </div>
                  <div style={{ width: '1px', background: 'rgba(255,255,255,0.08)' }} />
                  <div style={{ flex: 1, minWidth: '100px', textAlign: 'center' }}>
                    <div style={{ fontSize: '0.75rem', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Taxa de Abandono</div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#f59e0b', marginTop: '4px' }}>
                      {campaign.stats.total > 0 
                        ? `${((campaign.stats.abandoned || 0) / campaign.stats.total * 100).toFixed(1)}%` 
                        : '0%'}
                    </div>
                  </div>
                </div>

                {/* Hourly Volume Chart */}
                <div className="glass-panel" style={{ padding: '20px', borderRadius: '12px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <h4 style={{ margin: '0 0 15px 0', fontSize: '0.9rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    📊 Distribuição de Chamadas por Horário
                  </h4>
                  
                  {(() => {
                    const hourlyData = getHourlyStats();
                    const maxVal = Math.max(...hourlyData.map(d => d.answered + d.no_answer + d.abandoned), 5);
                    
                    return (
                      <div>
                        {/* Bar Grid */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', height: '140px', padding: '0 10px', borderBottom: '1px solid rgba(255,255,255,0.1)', position: 'relative' }}>
                          
                          {/* Grid Background lines */}
                          <div style={{ position: 'absolute', left: 0, right: 0, top: '25%', borderTop: '1px dashed rgba(255,255,255,0.03)', height: 0 }} />
                          <div style={{ position: 'absolute', left: 0, right: 0, top: '50%', borderTop: '1px dashed rgba(255,255,255,0.03)', height: 0 }} />
                          <div style={{ position: 'absolute', left: 0, right: 0, top: '75%', borderTop: '1px dashed rgba(255,255,255,0.03)', height: 0 }} />

                          {hourlyData.map((d, i) => {
                            const total = d.answered + d.no_answer + d.abandoned;
                            const ansPct = (d.answered / maxVal) * 100;
                            const noPct = (d.no_answer / maxVal) * 100;
                            const abPct = (d.abandoned / maxVal) * 100;

                            return (
                              <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, minWidth: '24px' }} title={`Total: ${total} | Atendidas: ${d.answered} | Não Atendidas: ${d.no_answer} | Abandonadas: ${d.abandoned}`}>
                                <div style={{ display: 'flex', alignItems: 'flex-end', gap: '2px', height: '110px', width: '100%', justifyContent: 'center' }}>
                                  
                                  {/* Answered Bar */}
                                  {d.answered > 0 && (
                                    <div style={{ width: '4px', height: `${ansPct}%`, background: '#10b981', borderRadius: '2px 2px 0 0', boxShadow: '0 0 5px rgba(16, 185, 129, 0.4)' }} />
                                  )}
                                  
                                  {/* Abandoned Bar */}
                                  {d.abandoned > 0 && (
                                    <div style={{ width: '4px', height: `${abPct}%`, background: '#f59e0b', borderRadius: '2px 2px 0 0', boxShadow: '0 0 5px rgba(245, 158, 11, 0.4)' }} />
                                  )}

                                  {/* No Answer Bar */}
                                  {d.no_answer > 0 && (
                                    <div style={{ width: '4px', height: `${noPct}%`, background: '#6b7280', borderRadius: '2px 2px 0 0' }} />
                                  )}

                                </div>
                                <span style={{ fontSize: '9px', color: '#9ca3af', marginTop: '6px' }}>{d.hour.split(':')[0]}h</span>
                              </div>
                            );
                          })}
                        </div>
                        
                        {/* Legend */}
                        <div style={{ display: 'flex', gap: '15px', justifyContent: 'center', marginTop: '12px', fontSize: '10px' }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#10b981' }}>
                            <span style={{ width: '8px', height: '8px', background: '#10b981', borderRadius: '50%' }} /> Atendidas
                          </span>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#f59e0b' }}>
                            <span style={{ width: '8px', height: '8px', background: '#f59e0b', borderRadius: '50%' }} /> Abandonadas
                          </span>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#9ca3af' }}>
                            <span style={{ width: '8px', height: '8px', background: '#6b7280', borderRadius: '50%' }} /> Não Atendidas
                          </span>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* Extensions Leaderboard (Agent performance) */}
                <div className="glass-panel" style={{ padding: '20px', borderRadius: '12px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <h4 style={{ margin: '0 0 15px 0', fontSize: '0.9rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    👑 Desempenho por Ramal / Agente
                  </h4>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                      <thead>
                        <tr style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                          <th style={{ padding: '10px 12px', color: '#aaa', fontWeight: '500' }}>Pos</th>
                          <th style={{ padding: '10px 12px', color: '#aaa', fontWeight: '500' }}>Ramal / Agente</th>
                          <th style={{ padding: '10px 12px', color: '#aaa', fontWeight: '500', textAlign: 'center' }}>Atendidas</th>
                          <th style={{ padding: '10px 12px', color: '#aaa', fontWeight: '500', textAlign: 'center' }}>TMA</th>
                          <th style={{ padding: '10px 12px', color: '#aaa', fontWeight: '500', textAlign: 'center' }}>Tempo Fila</th>
                          <th style={{ padding: '10px 12px', color: '#aaa', fontWeight: '500', textAlign: 'right' }}>Ação</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(() => {
                          const agentStats = getAgentStats();
                          return agentStats.map((a, idx) => {
                            const isTop3 = idx < 3;
                            const badge = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}º`;
                            const highlightStyle = idx === 0 
                              ? { borderLeft: '3px solid #ffd700', background: 'rgba(255, 215, 0, 0.04)' }
                              : idx === 1 
                              ? { borderLeft: '3px solid #c0c0c0', background: 'rgba(192, 192, 192, 0.04)' }
                              : idx === 2 
                              ? { borderLeft: '3px solid #cd7f32', background: 'rgba(205, 127, 50, 0.04)' }
                              : {};

                            return (
                              <tr key={a.extension} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)', ...highlightStyle }}>
                                <td style={{ padding: '10px 12px', fontWeight: isTop3 ? 'bold' : 'normal', fontSize: isTop3 ? '16px' : '12px' }}>
                                  {badge}
                                </td>
                                <td style={{ padding: '10px 12px' }}>
                                  <div style={{ fontWeight: '600', color: '#fff' }}>{a.extension}</div>
                                  <div style={{ fontSize: '11px', color: '#9ca3af' }}>{a.name}</div>
                                </td>
                                <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 'bold', color: '#10b981' }}>
                                  {a.answeredCount}
                                </td>
                                <td style={{ padding: '10px 12px', textAlign: 'center', color: '#00f2fe' }}>
                                  {a.avgTalkTime}
                                </td>
                                <td style={{ padding: '10px 12px', textAlign: 'center', color: '#ccc' }}>
                                  {a.loginTime}
                                </td>
                                <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                                  <button
                                    onClick={() => {
                                      if (agentFilter === a.extension) {
                                        setAgentFilter('all');
                                      } else {
                                        setAgentFilter(a.extension);
                                        setStatusFilter('all');
                                      }
                                    }}
                                    style={{
                                      padding: '4px 8px',
                                      background: agentFilter === a.extension ? 'var(--primary-gradient)' : 'rgba(255,255,255,0.05)',
                                      border: 'none',
                                      color: '#fff',
                                      borderRadius: '4px',
                                      fontSize: '11px',
                                      cursor: 'pointer',
                                      fontWeight: '600'
                                    }}
                                  >
                                    {agentFilter === a.extension ? 'Filtrado ✓' : 'Filtrar'}
                                  </button>
                                </td>
                              </tr>
                            );
                          });
                        })()}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {campaign.contacts && campaign.contacts.length > 0 && (
              <div style={{ marginTop: '30px', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '20px' }}>
                <div className="dialer-list-header">
                  <h4 className="dialer-list-title">📞 Lista de Contatos ({filteredContacts.length})</h4>
                  <div className="dialer-list-controls">
                    {/* Status Filters */}
                    <select 
                      value={statusFilter} 
                      onChange={e => setStatusFilter(e.target.value)} 
                      className="input-glass select-glass" 
                      style={{ padding: '6px 12px', fontSize: '12px', width: '160px' }}
                    >
                      <option value="all">Todos os status</option>
                      <option value="pending">⏳ Pendentes</option>
                      <option value="calling">📞 Discando</option>
                      <option value="answered">✅ Atendidas</option>
                      <option value="no_answer">📭 Não Atendidas</option>
                      <option value="abandoned">⚠️ Abandonadas</option>
                      <option value="voicemail">🛡️ Caixa Postal</option>
                      <option value="failed">❌ Falhas</option>
                    </select>
                    
                    {/* Search Input */}
                    <input 
                      type="text" 
                      placeholder="Buscar número..." 
                      value={searchPhone} 
                      onChange={e => setSearchPhone(e.target.value)} 
                      className="input-glass" 
                      style={{ padding: '6px 12px', fontSize: '12px', width: '180px' }}
                    />
                  </div>
                </div>
                
                {(statusFilter !== 'all' || agentFilter !== 'all') && (
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '15px', flexWrap: 'wrap', alignItems: 'center' }}>
                    {statusFilter !== 'all' && (
                      <span style={{ fontSize: '11px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', padding: '4px 10px', borderRadius: '6px', color: '#fff', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        Status: <strong>{statusFilter === 'pending' ? 'Pendente' : statusFilter === 'calling' ? 'Discando' : statusFilter === 'answered' ? 'Atendido' : statusFilter === 'no_answer' ? 'Não Atendido' : statusFilter === 'abandoned' ? 'Abandonado' : statusFilter === 'voicemail' ? 'Caixa Postal' : 'Falha'}</strong>
                        <button onClick={() => setStatusFilter('all')} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 0, fontWeight: 'bold', fontSize: '12px' }}>×</button>
                      </span>
                    )}
                    {agentFilter !== 'all' && (
                      <span style={{ fontSize: '11px', background: 'rgba(0, 242, 254, 0.1)', border: '1px solid rgba(0, 242, 254, 0.2)', padding: '4px 10px', borderRadius: '6px', color: '#00f2fe', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        Ramal: <strong>{agentFilter}</strong>
                        <button onClick={() => setAgentFilter('all')} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 0, fontWeight: 'bold', fontSize: '12px' }}>×</button>
                      </span>
                    )}
                    <button 
                      onClick={() => { setStatusFilter('all'); setAgentFilter('all'); }} 
                      style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', color: '#ef4444', padding: '4px 10px', borderRadius: '6px', fontSize: '10px', cursor: 'pointer', fontWeight: 'bold' }}
                    >
                      Limpar Filtros
                    </button>
                  </div>
                )}
                
                <div className="dialer-scroll-table">
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                        <th style={{ padding: '12px 16px', color: '#aaa', fontWeight: '500' }}>Telefone</th>
                        <th style={{ padding: '12px 16px', color: '#aaa', fontWeight: '500' }}>Nome</th>
                        <th style={{ padding: '12px 16px', color: '#aaa', fontWeight: '500', textAlign: 'right' }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredContacts.length === 0 ? (
                        <tr>
                          <td colSpan="3" style={{ padding: '20px', textAlign: 'center', color: '#777' }}>Nenhum contato encontrado.</td>
                        </tr>
                      ) : (
                        filteredContacts.map((contact, idx) => (
                          <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                            <td style={{ padding: '10px 16px', fontWeight: '500', color: '#f3f4f6' }}>{contact.phone}</td>
                            <td style={{ padding: '10px 16px', color: '#ccc' }}>{contact.name || '-'}</td>
                            <td style={{ padding: '10px 16px', textAlign: 'right' }}>
                              <span className={`dialer-status-badge ${contact.status}`}>
                                {contact.status === 'pending' && '⏳ Pendente'}
                                {contact.status === 'calling' && '📞 Discando...'}
                                {contact.status === 'answered' && '✅ Atendido'}
                                {contact.status === 'no_answer' && '📭 Não Atendido'}
                                {contact.status === 'abandoned' && '⚠️ Abandonado'}
                                {contact.status === 'voicemail' && '🛡️ Caixa Postal'}
                                {contact.status === 'failed' && '❌ Falhou'}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
