import React, { useState, useEffect, useRef } from 'react';
import DidModal from './DidModal';
import CampaignDialer from './CampaignDialer';
import { API_URL } from '../config';

export default function Dashboard({ 
  extensions = [], 
  queues = [], 
  dids = [],
  customDestinations = [],
  instance, 
  user, 
  onLogout, 
  onCreateExtension, 
  onEditExtension, 
  onImportCSVClick, 
  onDeleteExtension, 
  onCreateQueue,
  onEditQueue,
  onDeleteQueue,
  onCreateDid,
  onEditDid,
  onDeleteDid,
  onCreateCustomDest,
  onEditCustomDest,
  onDeleteCustomDest,
  isOperationLoading, 
  currentOperationText, 
  onRefresh 
}) {
  const [activeTab, setActiveTab] = useState('extensions');
  const [searchTerm, setSearchTerm] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [confirmDeleteQueueId, setConfirmDeleteQueueId] = useState(null);
  const [confirmDeleteCustomDestId, setConfirmDeleteCustomDestId] = useState(null);

  // Real-time monitor states
  const [realtimeData, setRealtimeData] = useState({ extensions: [], queues: [], trunks: [], pbxIP: '' });
  const [realtimeLoading, setRealtimeLoading] = useState(false);
  const [realtimeFilter, setRealtimeFilter] = useState('all'); // all, online, offline
  const [realtimeSearch, setRealtimeSearch] = useState('');
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true);
  const [countdown, setCountdown] = useState(15);

  // DID states
  const [isDidModalOpen, setIsDidModalOpen] = useState(false);
  const [editDidData, setEditDidData] = useState(null);
  const [confirmDeleteDidId, setConfirmDeleteDidId] = useState(null);

  const autoRefreshTimerRef = useRef(null);
  const countdownTimerRef = useRef(null);

  // Load realtime status
  const fetchRealtimeStatus = async () => {
    setRealtimeLoading(true);
    try {
      const token = localStorage.getItem('pbx_token');
      const response = await fetch(`${API_URL}/api/realtime/status`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await response.json();
      if (response.ok && data.success) {
        // Normalize each queue to always have members array and required fields
        const normalizeQueue = (q) => ({
          id: q.id || '',
          name: q.name || '',
          strategy: q.strategy || '',
          callsInWait: q.callsInWait ?? 0,
          completedCalls: q.completedCalls ?? 0,
          abandonedCalls: q.abandonedCalls ?? 0,
          serviceLevel: q.serviceLevel || '0%',
          members: Array.isArray(q.members) ? q.members.map(m => ({
            extension: m.extension || '',
            name: m.name || '',
            status: m.status || '',
            statusRaw: m.statusRaw || '',
            callsTaken: m.callsTaken ?? 0,
          })) : [],
        });
        const normalizePeer = (p) => ({
          extension: p.extension || '',
          status: p.status || 'offline',
          state: p.state || 'Indisponível',
          latency: p.latency || null,
        });
        setRealtimeData({
          extensions: (data.extensions || []).map(normalizePeer),
          queues: (data.queues || []).map(normalizeQueue),
          trunks: data.trunks || [],
          pbxIP: data.pbxIP || ''
        });
      }
    } catch (e) {
      console.error('[Realtime Monitor] Failed to fetch status:', e.message);
    } finally {
      setRealtimeLoading(false);
      setCountdown(15);
    }
  };

  // Load PBX NAT IP once on dashboard mount
  useEffect(() => {
    fetchRealtimeStatus();
  }, []);

  // Timer effect for auto-refresh
  useEffect(() => {
    if (activeTab === 'realtime') {
      fetchRealtimeStatus();

      if (autoRefreshEnabled) {
        autoRefreshTimerRef.current = setInterval(() => {
          fetchRealtimeStatus();
        }, 15000);

        countdownTimerRef.current = setInterval(() => {
          setCountdown(prev => {
            if (prev <= 1) return 15;
            return prev - 1;
          });
        }, 1000);
      }
    } else {
      if (autoRefreshTimerRef.current) clearInterval(autoRefreshTimerRef.current);
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    }

    return () => {
      if (autoRefreshTimerRef.current) clearInterval(autoRefreshTimerRef.current);
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    };
  }, [activeTab, autoRefreshEnabled]);

  const filteredExtensions = (extensions || []).filter(ext => {
    if (!ext) return false;
    const term = searchTerm.toLowerCase();
    return (
      (ext.extension || '').toLowerCase().includes(term) ||
      (ext.name || '').toLowerCase().includes(term) ||
      (ext.type ? ext.type.toLowerCase().includes(term) : false) ||
      (ext.tech || '').toLowerCase().includes(term)
    );
  });

  const filteredQueues = (queues || []).filter(q => {
    if (!q) return false;
    const term = searchTerm.toLowerCase();
    return (
      (q.id || '').toLowerCase().includes(term) ||
      (q.name || '').toLowerCase().includes(term)
    );
  });

  const filteredDids = (dids || []).filter(d => {
    if (!d) return false;
    const term = searchTerm.toLowerCase();
    return (
      (d.did || '').toLowerCase().includes(term) ||
      (d.description || '').toLowerCase().includes(term) ||
      (d.destination || '').toLowerCase().includes(term)
    );
  });

  const filteredCustomDests = (customDestinations || []).filter(cd => {
    if (!cd) return false;
    const term = searchTerm.toLowerCase();
    return (
      (cd.id || '').toLowerCase().includes(term) ||
      (cd.description || '').toLowerCase().includes(term)
    );
  });

  // Filter and sort realtime elements
  const filteredRealtimeExtensions = (realtimeData.extensions || [])
    .filter(peer => {
      if (!peer || !peer.extension) return false;
      const term = realtimeSearch.toLowerCase();
      const extName = (extensions.find(e => e.extension === peer.extension)?.name || '').toLowerCase();
      const matchesSearch = (peer.extension || '').toLowerCase().includes(term) || extName.includes(term);

      if (realtimeFilter === 'online') {
        return matchesSearch && peer.status === 'online';
      }
      if (realtimeFilter === 'offline') {
        return matchesSearch && peer.status === 'offline';
      }
      return matchesSearch;
    })
    .sort((a, b) => a.extension.localeCompare(b.extension, undefined, { numeric: true }));

  const filteredRealtimeQueues = (realtimeData.queues || [])
    .filter(q => {
      if (!q || !q.id) return false;
      const term = realtimeSearch.toLowerCase();
      const configQueue = (queues || []).find(item => item.id === q.id);
      const qName = q.name || '';
      const displayName = qName.includes('Fila') && configQueue ? (configQueue.name || qName) : qName;
      
      return (q.id || '').toLowerCase().includes(term) || displayName.toLowerCase().includes(term);
    })
    .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));

  const handleDeleteClick = (id) => {
    setConfirmDeleteId(id);
  };

  const handleConfirmDelete = (id) => {
    onDeleteExtension(id);
    setConfirmDeleteId(null);
  };

  const handleCancelDelete = () => {
    setConfirmDeleteId(null);
  };

  const handleConfirmDeleteQueue = (id) => {
    onDeleteQueue(id);
    setConfirmDeleteQueueId(null);
  };

  const renderTechBadge = (ext) => {
    if (ext.type === 'Webphone') {
      return <span style={styles.badgeWeb}>WSS Webphone</span>;
    }
    return <span style={styles.badgeSip}>SIP Softphone</span>;
  };

  // Check if any trunk is offline
  const offlineTrunks = (realtimeData.trunks || []).filter(t => !t.isOnline);
  const hasOfflineTrunks = offlineTrunks.length > 0;

  return (
    <div className="dashboard-container" style={styles.container}>
      {/* Header bar */}
      <header className="glass-panel navbar-inner" style={styles.navbar}>
        <div style={styles.logo}>
          <span style={styles.logoIcon}>🚀</span>
          <div>
            <h1 style={styles.logoTitle}>PBX Fácil</h1>
            <span style={styles.logoSubtitle}>Gestão Simplificada Asterisk</span>
          </div>
        </div>
        
        <div className="session-info-bar" style={styles.sessionInfo}>
          <div style={styles.statusContainer}>
            <div className="status-dot-pulse"></div>
            <span style={styles.statusText}>
              Conectado: <strong>{instance}</strong>
              {realtimeData.pbxIP && (
                <span style={{ marginLeft: '10px', color: '#00f2fe' }} title="IP do Servidor PABX (NAT Public IP / External Address)">
                  ({realtimeData.pbxIP})
                </span>
              )}
            </span>
          </div>
          <span className="navbar-divider" style={styles.divider}>|</span>
          <span style={styles.userText}>Usuário: <strong>{user}</strong></span>
          
          <button className="btn-neon-secondary" style={styles.logoutBtn} onClick={onLogout}>
            Desconectar
          </button>
        </div>
      </header>

      {/* Main Console Content */}
      <main style={styles.mainContent}>
        {/* Quick Stats Panel */}
        <div className="stats-grid" style={styles.statsContainer}>
          <div className="glass-panel" style={styles.statCard}>
            <div style={styles.statIcon}>📊</div>
            <div style={styles.statInfo}>
              <span style={styles.statLabel}>Total de Ramais</span>
              <span style={styles.statNumber}>{extensions.length}</span>
            </div>
          </div>
          
          <div className="glass-panel" style={styles.statCard}>
            <div style={styles.statIcon}>👥</div>
            <div style={styles.statInfo}>
              <span style={styles.statLabel}>Filas de Atendimento</span>
              <span style={styles.statNumber}>{queues.length}</span>
            </div>
          </div>
        </div>

        {/* Tab Selector */}
        <div className="tab-container" style={styles.tabContainer}>
          <button
            className={`tab-btn ${activeTab === 'extensions' ? 'active' : ''}`}
            onClick={() => { setActiveTab('extensions'); setSearchTerm(''); }}
          >
            📞 Ramais ({extensions.length})
          </button>
          <button
            className={`tab-btn ${activeTab === 'queues' ? 'active' : ''}`}
            onClick={() => { setActiveTab('queues'); setSearchTerm(''); }}
          >
            👥 Filas (Queues) ({queues.length})
          </button>
          <button
            className={`tab-btn ${activeTab === 'dids' ? 'active' : ''}`}
            onClick={() => { setActiveTab('dids'); setSearchTerm(''); }}
          >
            📞 Entrada de Ligações (DIDs) ({dids.length})
          </button>
          <button
            className={`tab-btn ${activeTab === 'customdests' ? 'active' : ''}`}
            onClick={() => { setActiveTab('customdests'); setSearchTerm(''); }}
          >
            ⚙️ Destinos Custom ({customDestinations.length})
          </button>
          <button
            className={`tab-btn ${activeTab === 'dialer' ? 'active' : ''}`}
            onClick={() => { setActiveTab('dialer'); setSearchTerm(''); }}
          >
            🚀 Disparador (Campanhas)
          </button>
          <button
            className={`tab-btn ${activeTab === 'realtime' ? 'active' : ''}`}
            onClick={() => { setActiveTab('realtime'); setRealtimeSearch(''); }}
          >
            🖥️ Monitoramento (Realtime)
          </button>
        </div>

        {/* Search & Actions Bar */}
        <div className="actions-bar" style={styles.actionsBar}>
          {activeTab !== 'realtime' && activeTab !== 'dialer' ? (
            <>
              <div style={styles.searchWrapper}>
                <input
                  type="text"
                  className="input-glass"
                  placeholder={
                    activeTab === 'extensions' 
                      ? 'Buscar ramal por número, nome ou tipo...' 
                      : activeTab === 'queues' 
                        ? 'Buscar fila por número ou nome...' 
                        : activeTab === 'dids'
                          ? 'Buscar DID por número, descrição ou destino...'
                          : 'Buscar destino por dial string ou descrição...'
                  }
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  style={styles.searchInput}
                />
                {searchTerm && (
                  <button style={styles.clearSearch} onClick={() => setSearchTerm('')}>
                    &times;
                  </button>
                )}
              </div>

              <div style={styles.rightButtons}>
                <button className="btn-neon-secondary" onClick={onRefresh} disabled={isOperationLoading} style={styles.refreshBtn}>
                  🔄 Atualizar
                </button>
                
                {activeTab === 'extensions' && (
                  <>
                    <button className="btn-neon-secondary" onClick={onImportCSVClick} disabled={isOperationLoading}>
                      📥 Importar CSV
                    </button>
                    <button className="btn-neon-primary" onClick={onCreateExtension} disabled={isOperationLoading}>
                      ➕ Novo Ramal
                    </button>
                  </>
                )}
                {activeTab === 'queues' && (
                  <button className="btn-neon-primary" onClick={onCreateQueue} disabled={isOperationLoading}>
                    ➕ Nova Fila
                  </button>
                )}
                {activeTab === 'dids' && (
                  <button className="btn-neon-primary" onClick={() => { setEditDidData(null); setIsDidModalOpen(true); }} disabled={isOperationLoading}>
                    ➕ Nova Rota de Entrada
                  </button>
                )}
                {activeTab === 'customdests' && (
                  <button className="btn-neon-primary" onClick={onCreateCustomDest} disabled={isOperationLoading}>
                    ➕ Novo Destino Custom
                  </button>
                )}
              </div>
            </>
          ) : (
            /* Realtime Controls */
            <div className="realtime-controls-bar" style={styles.realtimeControlsBar}>
              <div style={styles.searchWrapper}>
                <input
                  type="text"
                  className="input-glass"
                  placeholder="Filtrar monitor por número, nome ou fila..."
                  value={realtimeSearch}
                  onChange={(e) => setRealtimeSearch(e.target.value)}
                  style={styles.searchInput}
                />
                {realtimeSearch && (
                  <button style={styles.clearSearch} onClick={() => setRealtimeSearch('')}>
                    &times;
                  </button>
                )}
              </div>

              <div style={styles.realtimeActions}>
                {/* Peer status filter capsules */}
                <div style={styles.pillGroup}>
                  <button
                    className={`pill-btn ${realtimeFilter === 'all' ? 'active' : ''}`}
                    onClick={() => setRealtimeFilter('all')}
                  >
                    Todos
                  </button>
                  <button
                    className={`pill-btn ${realtimeFilter === 'online' ? 'active' : ''}`}
                    onClick={() => setRealtimeFilter('online')}
                  >
                    Registrados ({realtimeData.extensions.filter(p => p.status === 'online').length})
                  </button>
                  <button
                    className={`pill-btn ${realtimeFilter === 'offline' ? 'active' : ''}`}
                    onClick={() => setRealtimeFilter('offline')}
                  >
                    Não Registrados ({realtimeData.extensions.filter(p => p.status === 'offline').length})
                  </button>
                </div>

                {/* Auto Refresh toggle */}
                <div style={styles.autoRefreshContainer}>
                  <label style={styles.switchLabel}>
                    <input
                      type="checkbox"
                      checked={autoRefreshEnabled}
                      onChange={(e) => setAutoRefreshEnabled(e.target.checked)}
                      style={styles.switchInput}
                    />
                    <span style={styles.switchText}>
                      Autoatualizar {autoRefreshEnabled && `(${countdown}s)`}
                    </span>
                  </label>
                </div>

                <button 
                  className="btn-neon-primary" 
                  onClick={fetchRealtimeStatus} 
                  disabled={realtimeLoading}
                  style={styles.realtimeRefreshBtn}
                >
                  {realtimeLoading ? '🔄 Carregando...' : '🔄 Atualizar Agora'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Extensions, Queues or DIDs content */}
        {activeTab === 'dialer' ? (
          <CampaignDialer 
            queues={queues} 
            realtimeQueues={realtimeData.queues || []} 
            extensions={extensions}
            customDestinations={customDestinations}
            token={localStorage.getItem('pbx_token')} 
            pbxIP={realtimeData.pbxIP} 
          />
        ) : activeTab !== 'realtime' ? (
          <div className="glass-panel" style={styles.tablePanel}>
            {activeTab === 'extensions' && (
              /* Extensions Table view */
              filteredExtensions.length === 0 ? (
                <div style={styles.emptyState}>
                  <span style={styles.emptyIcon}>📂</span>
                  <h3>Nenhum ramal encontrado</h3>
                  <p>Comece criando um novo ramal ou limpe seus filtros de busca.</p>
                </div>
              ) : (
                <div className="glass-table-container">
                  <table className="glass-table">
                    <thead>
                      <tr>
                        <th>Ramal</th>
                        <th>Nome de Exibição</th>
                        <th>Tipo / Tecnologia</th>
                        <th style={{ textAlign: 'right' }}>Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredExtensions.map((ext) => (
                        <tr key={ext.id || ext.extension}>
                          <td style={styles.extensionNumber}>{ext.extension}</td>
                          <td style={styles.extensionName}>{ext.name}</td>
                          <td>{renderTechBadge(ext)}</td>
                          <td style={styles.actionsCol}>
                            {confirmDeleteId === (ext.id || ext.extension) ? (
                              <div style={styles.confirmDeleteGroup}>
                                <span style={styles.confirmText}>Excluir?</span>
                                <button
                                  style={styles.confirmYes}
                                  onClick={() => handleConfirmDelete(ext.id || ext.extension)}
                                >
                                  Sim
                                </button>
                                <button style={styles.confirmNo} onClick={handleCancelDelete}>
                                  Não
                                </button>
                              </div>
                            ) : (
                              <div style={styles.actionsGroup}>
                                <button
                                  className="table-edit-btn"
                                  onClick={() => onEditExtension(ext)}
                                  title="Editar Ramal"
                                  disabled={isOperationLoading}
                                  style={{ marginRight: '8px' }}
                                >
                                  ✏️ Editar
                                </button>
                                <button
                                  className="table-delete-btn"
                                  onClick={() => handleDeleteClick(ext.id || ext.extension)}
                                  title="Excluir Ramal"
                                  disabled={isOperationLoading}
                                >
                                  🗑️ Excluir
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            )}

            {activeTab === 'queues' && (
              /* Queues Table view */
              filteredQueues.length === 0 ? (
                <div style={styles.emptyState}>
                  <span style={styles.emptyIcon}>👥</span>
                  <h3>Nenhuma fila encontrada</h3>
                  <p>Crie uma nova fila de atendimento clicando no botão "Nova Fila".</p>
                </div>
              ) : (
                <div className="glass-table-container">
                  <table className="glass-table">
                    <thead>
                      <tr>
                        <th>Número da Fila</th>
                        <th>Nome da Fila</th>
                        <th style={{ textAlign: 'right' }}>Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredQueues.map((q) => (
                        <tr key={q.id}>
                          <td style={styles.extensionNumber}>{q.id}</td>
                          <td style={styles.extensionName}>{q.name}</td>
                          <td style={styles.actionsCol}>
                            {confirmDeleteQueueId === q.id ? (
                              <div style={styles.confirmDeleteGroup}>
                                <span style={styles.confirmText}>Excluir?</span>
                                <button
                                  style={styles.confirmYes}
                                  onClick={() => handleConfirmDeleteQueue(q.id)}
                                >
                                  Sim
                                </button>
                                <button style={styles.confirmNo} onClick={() => setConfirmDeleteQueueId(null)}>
                                  Não
                                </button>
                              </div>
                            ) : (
                              <div style={styles.actionsGroup}>
                                <button
                                  className="table-edit-btn"
                                  onClick={() => onEditQueue(q)}
                                  title="Editar Fila"
                                  disabled={isOperationLoading}
                                  style={{ marginRight: '8px' }}
                                >
                                  ✏️ Editar
                                </button>
                                <button
                                  className="table-delete-btn"
                                  onClick={() => setConfirmDeleteQueueId(q.id)}
                                  title="Excluir Fila"
                                  disabled={isOperationLoading}
                                >
                                  🗑️ Excluir
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            )}

            {activeTab === 'dids' && (
              /* DIDs Table view */
              filteredDids.length === 0 ? (
                <div style={styles.emptyState}>
                  <span style={styles.emptyIcon}>📞</span>
                  <h3>Nenhuma rota de entrada encontrada</h3>
                  <p>Comece criando uma rota clicando em "Nova Rota de Entrada".</p>
                </div>
              ) : (
                <div className="glass-table-container">
                  <table className="glass-table">
                    <thead>
                      <tr>
                        <th style={{ paddingLeft: '15px' }}>Número do DID</th>
                        <th>Descrição</th>
                        <th>Destino Encaminhado</th>
                        <th style={{ textAlign: 'right', paddingRight: '15px' }}>Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredDids.map((route) => (
                        <tr key={route.id}>
                          <td style={styles.extensionNumber}>{route.did}</td>
                          <td style={styles.extensionName}>{route.description}</td>
                          <td>
                            <span style={styles.badgeSip}>{route.destination}</span>
                          </td>
                          <td style={styles.actionsCol}>
                            {confirmDeleteDidId === route.id ? (
                              <div style={styles.confirmDeleteGroup}>
                                <span style={styles.confirmText}>Excluir?</span>
                                <button
                                  style={styles.confirmYes}
                                  onClick={() => { onDeleteDid(route.id); setConfirmDeleteDidId(null); }}
                                  disabled={isOperationLoading}
                                  style={{ marginRight: '8px' }}
                                >
                                  Sim
                                </button>
                                <button
                                  style={styles.confirmNo}
                                  onClick={() => setConfirmDeleteDidId(null)}
                                  disabled={isOperationLoading}
                                >
                                  Não
                                </button>
                              </div>
                            ) : (
                              <div style={styles.actionsGroup}>
                                <button
                                  className="table-edit-btn"
                                  onClick={() => { setEditDidData(route); setIsDidModalOpen(true); }}
                                  disabled={isOperationLoading}
                                  style={{ marginRight: '8px' }}
                                >
                                  ✏️ Editar
                                </button>
                                <button
                                  className="table-delete-btn"
                                  onClick={() => setConfirmDeleteDidId(route.id)}
                                  disabled={isOperationLoading}
                                >
                                  🗑️ Excluir
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            )}

            {activeTab === 'customdests' && (
              filteredCustomDests.length === 0 ? (
                <div style={styles.emptyState}>
                  <span style={styles.emptyIcon}>⚙️</span>
                  <h3>Nenhum destino personalizado encontrado</h3>
                  <p>Crie um novo clicando em "Novo Destino Personalizado".</p>
                </div>
              ) : (
                <div className="glass-table-container">
                  <table className="glass-table">
                    <thead>
                      <tr>
                        <th style={{ paddingLeft: '15px' }}>Destino (Dial String)</th>
                        <th>Descrição</th>
                        <th style={{ textAlign: 'right', paddingRight: '15px' }}>Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredCustomDests.map((cd) => (
                        <tr key={cd.id}>
                          <td style={styles.extensionNumber}>
                            <code style={{ background: 'rgba(0,0,0,0.3)', padding: '2px 6px', borderRadius: '4px', color: '#00f2fe', fontFamily: 'monospace', fontSize: '13px' }}>
                              {cd.id}
                            </code>
                          </td>
                          <td style={styles.extensionName}>{cd.description}</td>
                          <td style={styles.actionsCol}>
                            {confirmDeleteCustomDestId === cd.id ? (
                              <div style={styles.confirmDeleteGroup}>
                                <span style={styles.confirmText}>Excluir?</span>
                                <button
                                  style={{ ...styles.confirmYes, marginRight: '8px' }}
                                  onClick={() => { onDeleteCustomDest(cd.id); setConfirmDeleteCustomDestId(null); }}
                                  disabled={isOperationLoading}
                                >
                                  Sim
                                </button>
                                <button
                                  style={styles.confirmNo}
                                  onClick={() => setConfirmDeleteCustomDestId(null)}
                                  disabled={isOperationLoading}
                                >
                                  Não
                                </button>
                              </div>
                            ) : (
                              <div style={styles.actionsGroup}>
                                <button
                                  className="table-edit-btn"
                                  onClick={() => onEditCustomDest(cd)}
                                  disabled={isOperationLoading}
                                  style={{ marginRight: '8px' }}
                                >
                                  ✏️ Editar
                                </button>
                                <button
                                  className="table-delete-btn"
                                  onClick={() => setConfirmDeleteCustomDestId(cd.id)}
                                  disabled={isOperationLoading}
                                >
                                  🗑️ Excluir
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            )}
          </div>
        ) : (
          /* REALTIME MONITOR WALLBOARD */
          <div style={styles.realtimeContainer}>
            {/* Trunk Loss Registration Alert */}
            {hasOfflineTrunks && (
              <div style={styles.trunkAlertBar}>
                <span style={styles.alertIcon}>⚠️</span>
                <div style={styles.alertDetails}>
                  <strong style={styles.alertTitle}>TELEFONIA EM RISCO! Conexão de Tronco Perdida</strong>
                  <p style={styles.alertText}>
                    Os seguintes troncos perderam o registro: <strong>{offlineTrunks.map(t => t.name).join(', ')}</strong>. A telefonia de entrada/saída pode estar inativa!
                  </p>
                </div>
              </div>
            )}

            {/* Trunks Registrations Panel */}
            <div className="glass-panel" style={styles.trunksPanel}>
              <h3 style={styles.panelTitle}>
                🔗 Registro dos Troncos de Telefonia (Trunks)
              </h3>
              
              {realtimeLoading && (!realtimeData.trunks || realtimeData.trunks.length === 0) ? (
                <div style={styles.trunksLoading}>
                  <div className="loader-glow" style={{ width: '20px', height: '20px' }}></div>
                  <span>Verificando registros de troncos SIP/PJSIP...</span>
                </div>
              ) : !realtimeData.trunks || realtimeData.trunks.length === 0 ? (
                <div style={styles.trunksLoading}>
                  <span style={{ fontSize: '1.4rem' }}>📡</span>
                  <div>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
                      Nenhum tronco com registro SIP/PJSIP detectado.
                    </span>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem', display: 'block', marginTop: '4px' }}>
                      Provedores configurados como IP estático (sem autenticação de registro) não aparecem aqui. Verifique o módulo <code>Registries</code> no Asterisk Info do seu PABX.
                    </span>
                  </div>
                </div>
              ) : (
                <div className="trunks-flex-row" style={styles.trunksFlexRow}>
                  {realtimeData.trunks.map(t => (
                    <div key={t.name} className="trunk-card" style={t.isOnline ? styles.trunkCardOnline : styles.trunkCardOffline}>
                      <div style={styles.trunkCardHeader}>
                        <div className={t.isOnline ? "status-dot-pulse" : "status-dot-pulse offline"}></div>
                        <strong style={styles.trunkName}>{t.name}</strong>
                      </div>
                      <div style={styles.trunkMetaRow}>
                        <span style={styles.trunkTypeTag}>{t.type}</span>
                        <span style={t.isOnline ? styles.trunkStatusOnline : styles.trunkStatusOffline}>
                          {t.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="realtime-grid" style={styles.realtimeGrid}>
              {/* Extensions Registration Status panel */}
              <div className="glass-panel" style={styles.realtimePeersPanel}>
                <h3 style={styles.panelTitle}>
                  📞 Registro dos Ramais ({filteredRealtimeExtensions.length})
                </h3>
                
                {realtimeLoading && (realtimeData.extensions || []).length === 0 ? (
                  <div style={styles.panelLoading}>
                    <div className="loader-glow" style={{ width: '30px', height: '30px' }}></div>
                    <span>Escaneando ramais no Asterisk...</span>
                  </div>
                ) : filteredRealtimeExtensions.length === 0 ? (
                  <div style={styles.emptyStateCompact}>
                    <span>📂</span>
                    <p>Nenhum ramal com o filtro selecionado.</p>
                  </div>
                ) : (
                  <div className="scroll-glass peers-grid" style={styles.peersGrid}>
                    {filteredRealtimeExtensions.map(peer => {
                      const mainExt = extensions.find(e => e.extension === peer.extension);
                      const name = mainExt ? mainExt.name : 'Desconhecido';
                      const isOnline = peer.status === 'online';

                      return (
                        <div key={peer.extension} style={styles.peerCard}>
                          <div style={styles.peerHeader}>
                            <div style={styles.peerStatusRow}>
                              <div className={isOnline ? "status-dot-pulse" : "status-dot-pulse offline"}></div>
                              <span style={styles.peerNumber}>{peer.extension}</span>
                            </div>
                            {peer.latency && (
                              <span style={styles.peerLatency}>⚡ {peer.latency}</span>
                            )}
                          </div>
                          <span style={styles.peerName} title={name}>{name}</span>
                          <span style={isOnline ? styles.statusLabelOnline : styles.statusLabelOffline}>
                            {peer.state}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Queues Callers and Agent Status panel */}
              <div className="glass-panel" style={styles.realtimeQueuesPanel}>
                <h3 style={styles.panelTitle}>
                  👥 Filas de Atendimento ({filteredRealtimeQueues.length})
                </h3>

                {realtimeLoading && (realtimeData.queues || []).length === 0 ? (
                  <div style={styles.panelLoading}>
                    <div className="loader-glow" style={{ width: '30px', height: '30px' }}></div>
                    <span>Extraindo métricas das filas...</span>
                  </div>
                ) : filteredRealtimeQueues.length === 0 ? (
                  <div style={styles.emptyStateCompact}>
                    <span>👥</span>
                    <p>Nenhuma fila disponível no monitor.</p>
                  </div>
                ) : (
                  <div className="scroll-glass" style={styles.queuesMonitorList}>
                    {filteredRealtimeQueues.map(q => {
                      const configQueue = (queues || []).find(item => item.id === q.id);
                      const qNameSafe = q.name || '';
                      const displayName = qNameSafe.includes('Fila') && configQueue ? (configQueue.name || qNameSafe) : qNameSafe;
                      const hasWaiting = q.callsInWait > 0;

                      return (
                        <div key={q.id} style={styles.queueMonitorCard}>
                          <div style={styles.queueCardHeader}>
                            <div>
                              <h4 style={styles.queueMonitorName}>
                                Fila {q.id} - {displayName}
                              </h4>
                              <span style={styles.queueMonitorStrategy}>
                                Estratégia: <code>{q.strategy}</code>
                              </span>
                            </div>
                            
                            <div style={hasWaiting ? styles.waitingBadgeGlow : styles.waitingBadgeNormal}>
                              <span>Espera: <strong>{q.callsInWait}</strong></span>
                            </div>
                          </div>

                          {/* Queue quick Stats */}
                          <div style={styles.queueStatsRow}>
                            <div style={styles.queueStatBox}>
                              <span style={styles.queueStatVal}>{q.completedCalls}</span>
                              <span style={styles.queueStatLabel} title="Total de chamadas atendidas por esta fila desde o último reinício do Asterisk">
                                Atendidas ℹ️
                              </span>
                            </div>
                            <div style={styles.queueStatBox}>
                              <span style={styles.queueStatVal}>{q.abandonedCalls}</span>
                              <span style={styles.queueStatLabel} title="Total de chamadas abandonadas (cliente desligou antes de ser atendido) desde o último reinício do Asterisk">
                                Perdidas ℹ️
                              </span>
                            </div>
                            <div style={styles.queueStatBox}>
                              <span style={{ ...styles.queueStatVal, color: parseFloat(q.serviceLevel) >= 80 ? '#10b981' : parseFloat(q.serviceLevel) >= 60 ? '#f59e0b' : '#ef4444' }}>
                                {q.serviceLevel}
                              </span>
                              <span 
                                style={styles.queueStatLabel} 
                                title="SLA (Nível de Serviço): % de chamadas atendidas dentro do tempo-limite configurado na fila. Ex: 80% significa que 80% das chamadas foram atendidas antes de o cliente esperar demais. Os dados são acumulativos desde o último reinício do Asterisk."
                              >
                                Nível SLA ℹ️
                              </span>
                            </div>
                          </div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '-4px', fontStyle: 'italic' }}>
                            ℹ️ Contadores acumulados desde o último reinício do Asterisk
                          </div>

                          {/* Queue Members List */}
                          <div style={styles.queueMembersArea}>
                            <span style={styles.membersTitle}>Membros da Fila:</span>
                            {!(q.members && q.members.length > 0) ? (
                              <span style={styles.noMembers}>Sem agentes logados nesta fila</span>
                            ) : (
                              <div style={styles.membersGrid}>
                                {(q.members || []).slice().sort((a, b) => a.extension.localeCompare(b.extension, undefined, { numeric: true })).map(member => {
                                  const statusColor = 
                                    member.statusRaw === 'Unavailable' ? '#ef4444' : 
                                    member.statusRaw === 'Not in use' ? '#10b981' : 
                                    member.statusRaw === 'In use' || member.statusRaw === 'Busy' ? '#f59e0b' : 
                                    '#06b6d4'; // ringing / other

                                  return (
                                    <div key={member.extension} style={styles.memberTag}>
                                      <div style={{...styles.memberDot, background: statusColor, boxShadow: `0 0 6px ${statusColor}`}}></div>
                                      <span style={styles.memberName} title={`${member.name} (${member.extension})`}>
                                        <strong>{member.extension}</strong> - {member.name}
                                      </span>
                                      <span style={{...styles.memberStatusText, color: statusColor}}>
                                        {member.status} {member.callsTaken > 0 && `(📞 ${member.callsTaken})`}
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Modern Puppeteer Execution Overlay */}
      {isOperationLoading && (
        <div style={styles.loadingOverlay}>
          <div className="glass-panel pulse-glow" style={styles.loadingCard}>
            <div className="loader-glow"></div>
            <h3 style={styles.loadingTitle}>Orquestrando Puppeteer</h3>
            <p style={styles.loadingText}>{currentOperationText}</p>
            <span style={styles.loadingNote}>
              Navegando silenciosamente pelo PBX {instance}. Isso pode levar alguns segundos...
            </span>
          </div>
        </div>
      )}
      <DidModal
        isOpen={isDidModalOpen}
        onClose={() => setIsDidModalOpen(false)}
        onSave={(data) => {
          setIsDidModalOpen(false);
          if (editDidData) {
            onEditDid(editDidData.id, data);
          } else {
            onCreateDid(data);
          }
        }}
        isLoading={isOperationLoading}
        editData={editDidData}
        extensions={extensions}
        queues={queues}
        customDestinations={customDestinations}
      />
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    minHeight: '100vh',
    padding: '24px',
    maxWidth: '1200px',
    margin: '0 auto',
    width: '100%',
    gap: '24px',
  },
  navbar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 24px',
    borderRadius: '16px',
    flexWrap: 'wrap',
    gap: '16px',
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    textAlign: 'left',
  },
  logoIcon: {
    fontSize: '2.2rem',
  },
  logoTitle: {
    fontSize: '1.4rem',
    fontFamily: 'Outfit, sans-serif',
    fontWeight: '700',
    color: '#fff',
    margin: 0,
    lineHeight: '1.1',
  },
  logoSubtitle: {
    fontSize: '0.75rem',
    color: '#00f2fe',
    fontWeight: '600',
    letterSpacing: '1px',
    textTransform: 'uppercase',
  },
  sessionInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    flexWrap: 'wrap',
  },
  statusContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  statusDot: {
    width: '8px',
    height: '8px',
    background: '#10b981',
    borderRadius: '50%',
    boxShadow: '0 0 8px #10b981',
  },
  statusText: {
    fontSize: '0.85rem',
    color: '#e5e7eb',
  },
  divider: {
    color: 'rgba(255, 255, 255, 0.1)',
  },
  userText: {
    fontSize: '0.85rem',
    color: '#e5e7eb',
  },
  logoutBtn: {
    padding: '8px 16px',
    fontSize: '0.85rem',
  },
  mainContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  statsContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    flexWrap: 'wrap',
  },
  statCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    padding: '16px 24px',
    borderRadius: '16px',
    flexGrow: 1,
    minWidth: '200px',
    textAlign: 'left',
  },
  statIcon: {
    fontSize: '2rem',
  },
  statInfo: {
    display: 'flex',
    flexDirection: 'column',
  },
  statLabel: {
    fontSize: '0.85rem',
    color: '#9ca3af',
    fontWeight: '500',
  },
  statNumber: {
    fontSize: '1.8rem',
    fontWeight: '700',
    color: '#fff',
    lineHeight: '1.1',
    fontFamily: 'Outfit, sans-serif',
  },
  tabContainer: {
    display: 'flex',
    gap: '12px',
    marginTop: '5px',
  },
  actionsBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '16px',
    flexWrap: 'wrap',
  },
  searchWrapper: {
    position: 'relative',
    flexGrow: 1,
    maxWidth: '450px',
    width: '100%',
  },
  searchInput: {
    width: '100%',
    paddingRight: '40px',
  },
  clearSearch: {
    position: 'absolute',
    right: '12px',
    top: '50%',
    transform: 'translateY(-50%)',
    background: 'none',
    border: 'none',
    color: '#9ca3af',
    fontSize: '1.2rem',
    cursor: 'pointer',
  },
  rightButtons: {
    display: 'flex',
    gap: '12px',
  },
  refreshBtn: {
    padding: '12px 18px',
  },
  tablePanel: {
    padding: '8px',
    borderRadius: '16px',
  },
  extensionNumber: {
    fontSize: '1rem',
    fontWeight: '600',
    color: '#00f2fe',
    fontFamily: 'Courier New, monospace',
    textAlign: 'left',
    paddingLeft: '15px',
  },
  extensionName: {
    fontWeight: '500',
    color: '#fff',
    textAlign: 'left',
  },
  badgeSip: {
    background: 'rgba(59, 130, 246, 0.1)',
    color: '#60a5fa',
    border: '1px solid rgba(59, 130, 246, 0.2)',
    padding: '4px 10px',
    borderRadius: '20px',
    fontSize: '0.8rem',
    fontWeight: '600',
    textShadow: '0 0 8px rgba(59, 130, 246, 0.2)',
  },
  badgeWeb: {
    background: 'rgba(157, 78, 221, 0.1)',
    color: '#c084fc',
    border: '1px solid rgba(157, 78, 221, 0.2)',
    padding: '4px 10px',
    borderRadius: '20px',
    fontSize: '0.8rem',
    fontWeight: '600',
    textShadow: '0 0 8px rgba(157, 78, 221, 0.2)',
  },
  actionsCol: {
    display: 'flex',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingRight: '15px',
  },
  actionsGroup: {
    display: 'flex',
    gap: '8px',
  },
  emptyState: {
    padding: '60px 20px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12px',
  },
  emptyIcon: {
    fontSize: '3rem',
    marginBottom: '10px',
  },
  confirmDeleteGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    background: 'rgba(239, 68, 68, 0.1)',
    padding: '4px 8px',
    borderRadius: '8px',
    border: '1px solid rgba(239, 68, 68, 0.2)',
  },
  confirmText: {
    fontSize: '0.8rem',
    color: '#fca5a5',
    fontWeight: '600',
  },
  confirmYes: {
    background: '#ef4444',
    color: '#fff',
    border: 'none',
    padding: '4px 8px',
    borderRadius: '4px',
    fontSize: '0.75rem',
    fontWeight: '600',
    cursor: 'pointer',
  },
  confirmNo: {
    background: 'rgba(255, 255, 255, 0.1)',
    color: '#fff',
    border: 'none',
    padding: '4px 8px',
    borderRadius: '4px',
    fontSize: '0.75rem',
    fontWeight: '600',
    cursor: 'pointer',
  },
  loadingOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(5, 6, 10, 0.85)',
    backdropFilter: 'blur(10px)',
    zIndex: 2000,
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    padding: '20px',
  },
  loadingCard: {
    width: '100%',
    maxWidth: '420px',
    padding: '40px 30px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '16px',
    textAlign: 'center',
  },
  loadingTitle: {
    fontSize: '1.25rem',
    color: '#fff',
    fontWeight: '600',
    fontFamily: 'Outfit, sans-serif',
    margin: 0,
  },
  loadingText: {
    fontSize: '0.9rem',
    color: '#00f2fe',
    fontWeight: '500',
    margin: 0,
  },
  loadingNote: {
    fontSize: '0.75rem',
    color: '#9ca3af',
    lineHeight: '1.4',
  },

  /* REALTIME STYLING BLOCK */
  realtimeContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '18px',
    width: '100%',
  },
  trunkAlertBar: {
    display: 'flex',
    gap: '16px',
    alignItems: 'center',
    background: 'rgba(239, 68, 68, 0.15)',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    borderRadius: '12px',
    padding: '16px 20px',
    textAlign: 'left',
    animation: 'alertBorderGlow 1.8s infinite ease-in-out',
  },
  alertIcon: {
    fontSize: '2rem',
  },
  alertDetails: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  alertTitle: {
    fontSize: '0.95rem',
    color: '#f87171',
    fontFamily: 'Outfit, sans-serif',
  },
  alertText: {
    fontSize: '0.82rem',
    color: '#fca5a5',
    margin: 0,
    lineHeight: '1.4',
  },
  trunksPanel: {
    padding: '16px 20px',
    borderRadius: '16px',
    textAlign: 'left',
  },
  trunksLoading: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    color: '#00f2fe',
    fontSize: '0.8rem',
  },
  noTrunksText: {
    fontSize: '0.8rem',
    color: '#9ca3af',
    fontStyle: 'italic',
  },
  trunksFlexRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '10px',
  },
  trunkCardOnline: {
    background: 'rgba(255, 255, 255, 0.02)',
    border: '1px solid rgba(16, 185, 129, 0.15)',
    borderRadius: '10px',
    padding: '10px 14px',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    minWidth: '150px',
  },
  trunkCardOffline: {
    background: 'rgba(239, 68, 68, 0.03)',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    borderRadius: '10px',
    padding: '10px 14px',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    minWidth: '150px',
    animation: 'pulseOfflineTrunk 2s infinite ease-in-out',
  },
  trunkCardHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  trunkName: {
    fontSize: '0.85rem',
    color: '#fff',
  },
  trunkMetaRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: '2px',
    gap: '12px',
  },
  trunkTypeTag: {
    fontSize: '0.7rem',
    color: '#9ca3af',
    background: 'rgba(255, 255, 255, 0.05)',
    padding: '1px 5px',
    borderRadius: '3px',
    fontWeight: '600',
  },
  trunkStatusOnline: {
    fontSize: '0.72rem',
    color: '#10b981',
    fontWeight: '700',
  },
  trunkStatusOffline: {
    fontSize: '0.72rem',
    color: '#f87171',
    fontWeight: '700',
  },
  realtimeControlsBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    gap: '16px',
    flexWrap: 'wrap',
  },
  realtimeActions: {
    display: 'flex',
    gap: '14px',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  pillGroup: {
    display: 'flex',
    background: 'rgba(5, 6, 10, 0.4)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '10px',
    padding: '3px',
    gap: '4px',
  },
  autoRefreshContainer: {
    display: 'flex',
    alignItems: 'center',
    minWidth: '160px',
  },
  switchLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    cursor: 'pointer',
    userSelect: 'none',
  },
  switchInput: {
    cursor: 'pointer',
    accentColor: '#00f2fe',
    width: '15px',
    height: '15px',
  },
  switchText: {
    fontSize: '0.85rem',
    color: '#e5e7eb',
    fontWeight: '500',
  },
  realtimeRefreshBtn: {
    padding: '0 16px',
    height: '40px',
    fontSize: '0.85rem',
    minWidth: '160px',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  realtimeGrid: {
    display: 'grid',
    gridTemplateColumns: '1.2fr 1.8fr',
    gap: '20px',
    width: '100%',
    alignItems: 'stretch',
  },
  realtimePeersPanel: {
    padding: '20px',
    borderRadius: '16px',
    display: 'flex',
    flexDirection: 'column',
    height: '580px',
  },
  realtimeQueuesPanel: {
    padding: '20px',
    borderRadius: '16px',
    display: 'flex',
    flexDirection: 'column',
    height: '580px',
  },
  panelTitle: {
    fontSize: '1.1rem',
    color: '#fff',
    margin: '0 0 16px 0',
    fontFamily: 'Outfit, sans-serif',
    fontWeight: '600',
    textAlign: 'left',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  panelLoading: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
    flexGrow: 1,
    color: '#00f2fe',
    fontSize: '0.85rem',
    fontWeight: '500',
  },
  emptyStateCompact: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    flexGrow: 1,
    color: '#9ca3af',
    gap: '6px',
    fontSize: '0.85rem',
  },
  peersGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
    gap: '10px',
    overflowY: 'auto',
    flexGrow: 1,
    paddingRight: '4px',
  },
  peerCard: {
    background: 'rgba(255, 255, 255, 0.02)',
    border: '1px solid rgba(255, 255, 255, 0.05)',
    borderRadius: '12px',
    padding: '12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    textAlign: 'left',
    transition: 'all 0.2s',
  },
  peerHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  peerStatusRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  peerNumber: {
    fontSize: '0.9rem',
    fontWeight: '700',
    color: '#fff',
    fontFamily: 'Courier New, monospace',
  },
  peerLatency: {
    fontSize: '0.72rem',
    color: '#10b981',
    fontWeight: '600',
  },
  peerName: {
    fontSize: '0.78rem',
    color: '#9ca3af',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    display: 'block',
  },
  statusLabelOnline: {
    fontSize: '0.7rem',
    color: '#10b981',
    fontWeight: '700',
    background: 'rgba(16, 185, 129, 0.1)',
    padding: '1px 6px',
    borderRadius: '4px',
    alignSelf: 'flex-start',
    marginTop: '2px',
  },
  statusLabelOffline: {
    fontSize: '0.7rem',
    color: '#ef4444',
    fontWeight: '700',
    background: 'rgba(239, 68, 68, 0.1)',
    padding: '1px 6px',
    borderRadius: '4px',
    alignSelf: 'flex-start',
    marginTop: '2px',
  },
  dotGreen: {
    width: '7px',
    height: '7px',
    borderRadius: '50%',
    background: '#10b981',
    boxShadow: '0 0 6px #10b981',
  },
  dotRed: {
    width: '7px',
    height: '7px',
    borderRadius: '50%',
    background: '#ef4444',
    boxShadow: '0 0 6px #ef4444',
  },
  queuesMonitorList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
    overflowY: 'auto',
    flexGrow: 1,
    paddingRight: '4px',
  },
  queueMonitorCard: {
    background: 'rgba(255, 255, 255, 0.02)',
    border: '1px solid rgba(255, 255, 255, 0.05)',
    borderRadius: '14px',
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    textAlign: 'left',
  },
  queueCardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  queueMonitorName: {
    fontSize: '1rem',
    color: '#fff',
    fontWeight: '600',
    margin: 0,
    fontFamily: 'Outfit, sans-serif',
  },
  queueMonitorStrategy: {
    fontSize: '0.75rem',
    color: '#9ca3af',
  },
  waitingBadgeNormal: {
    background: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    padding: '4px 10px',
    borderRadius: '6px',
    fontSize: '0.8rem',
    color: '#e5e7eb',
  },
  waitingBadgeGlow: {
    background: 'rgba(239, 68, 68, 0.15)',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    padding: '4px 10px',
    borderRadius: '6px',
    fontSize: '0.8rem',
    color: '#f87171',
    boxShadow: '0 0 8px rgba(239, 68, 68, 0.2)',
    animation: 'pulseGlowWait 1.5s infinite ease-in-out',
  },
  queueStatsRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '8px',
    background: 'rgba(5, 6, 10, 0.3)',
    border: '1px solid rgba(255, 255, 255, 0.04)',
    borderRadius: '10px',
    padding: '8px',
  },
  queueStatBox: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
  },
  queueStatVal: {
    fontSize: '1rem',
    fontWeight: '700',
    color: '#00f2fe',
  },
  queueStatLabel: {
    fontSize: '0.7rem',
    color: '#9ca3af',
  },
  queueMembersArea: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  membersTitle: {
    fontSize: '0.78rem',
    fontWeight: '600',
    color: '#9ca3af',
  },
  noMembers: {
    fontSize: '0.75rem',
    color: '#9ca3af',
    fontStyle: 'italic',
  },
  membersGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
    gap: '6px',
  },
  memberTag: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    background: 'rgba(255, 255, 255, 0.01)',
    border: '1px solid rgba(255, 255, 255, 0.03)',
    borderRadius: '6px',
    padding: '4px 8px',
  },
  memberDot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    flexShrink: 0,
  },
  memberName: {
    fontSize: '0.75rem',
    color: '#e5e7eb',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    flexGrow: 1,
    textAlign: 'left',
  },
  memberStatusText: {
    fontSize: '0.7rem',
    fontWeight: '600',
    flexShrink: 0,
  },
};

// Inject CSS slidein, scrollbar and pill button styling rules
if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.innerHTML = `
    @keyframes pulseGlowWait {
      0% {
        box-shadow: 0 0 4px rgba(239, 68, 68, 0.1);
      }
      50% {
        box-shadow: 0 0 12px rgba(239, 68, 68, 0.4);
      }
      100% {
        box-shadow: 0 0 4px rgba(239, 68, 68, 0.1);
      }
    }

    @keyframes alertBorderGlow {
      0% {
        border-color: rgba(239, 68, 68, 0.3);
        box-shadow: 0 0 8px rgba(239, 68, 68, 0.1);
      }
      50% {
        border-color: rgba(239, 68, 68, 0.7);
        box-shadow: 0 0 20px rgba(239, 68, 68, 0.35);
      }
      100% {
        border-color: rgba(239, 68, 68, 0.3);
        box-shadow: 0 0 8px rgba(239, 68, 68, 0.1);
      }
    }

    @keyframes pulseOfflineTrunk {
      0% {
        box-shadow: 0 0 2px rgba(239, 68, 68, 0.05);
      }
      50% {
        box-shadow: 0 0 12px rgba(239, 68, 68, 0.25);
      }
      100% {
        box-shadow: 0 0 2px rgba(239, 68, 68, 0.05);
      }
    }
    
    .pill-btn {
      padding: 6px 14px;
      border: 1px solid rgba(255, 255, 255, 0.05);
      background: rgba(255, 255, 255, 0.02);
      color: #9ca3af;
      font-size: 0.8rem;
      font-weight: 600;
      cursor: pointer;
      border-radius: 8px;
      transition: all 0.25s ease;
    }
    .pill-btn.active {
      background: rgba(0, 242, 254, 0.15) !important;
      border-color: rgba(0, 242, 254, 0.3) !important;
      color: #00f2fe !important;
      box-shadow: 0 0 10px rgba(0, 242, 254, 0.2);
      text-shadow: 0 0 8px rgba(0, 242, 254, 0.3);
    }
    .pill-btn:hover:not(.active) {
      color: #fff;
      background: rgba(255, 255, 255, 0.08);
      border-color: rgba(255, 255, 255, 0.15);
    }
  `;
  document.head.appendChild(style);
}
