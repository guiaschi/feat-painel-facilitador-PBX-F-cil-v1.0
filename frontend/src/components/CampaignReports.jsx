import React, { useState, useEffect, useRef } from 'react';
import { API_URL } from '../config';

export default function CampaignReports({ token, extensions = [] }) {
  const [campaignsList, setCampaignsList] = useState([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState('');
  const [campaign, setCampaign] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [agentFilter, setAgentFilter] = useState('all');
  const [searchPhone, setSearchPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showAllAgents, setShowAllAgents] = useState(false);
  
  const statusInterval = useRef(null);

  // Load campaigns list on mount
  useEffect(() => {
    loadCampaigns();
  }, [token]);

  // Load campaign details when selected Campaign changes
  useEffect(() => {
    if (selectedCampaignId) {
      fetchCampaignDetails(selectedCampaignId);
      
      // Auto-refresh stats if the campaign is currently running
      if (statusInterval.current) clearInterval(statusInterval.current);
      statusInterval.current = setInterval(() => {
        fetchCampaignDetails(selectedCampaignId, true);
      }, 3000);
    } else {
      setCampaign(null);
      if (statusInterval.current) clearInterval(statusInterval.current);
    }
    
    // Reset filters when switching campaigns
    setStatusFilter('all');
    setAgentFilter('all');
    setSearchPhone('');
    
    return () => {
      if (statusInterval.current) clearInterval(statusInterval.current);
    };
  }, [selectedCampaignId]);

  const loadCampaigns = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/campaigns`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setCampaignsList(data.campaigns || []);
      }
    } catch (e) {
      console.error('Error loading campaigns for reports:', e);
    } finally {
      setLoading(false);
    }
  };

  const fetchCampaignDetails = async (id, isBackground = false) => {
    if (!isBackground) setRefreshing(true);
    try {
      const res = await fetch(`${API_URL}/api/campaigns/${id}/status`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success && data.data) {
        setCampaign(data.data);
      }
    } catch (e) {
      console.error('Error fetching campaign details:', e);
    } finally {
      if (!isBackground) setRefreshing(false);
    }
  };

  const getHourlyStats = () => {
    const hours = Array.from({ length: 13 }, (_, i) => i + 8); // 8:00 to 20:00
    const data = hours.map(h => ({
      hour: `${String(h).padStart(2, '0')}:00`,
      answered: 0,
      no_answer: 0,
      abandoned: 0,
      agents: {}
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
        if (contact.status === 'answered' && contact.agent) {
          const agentExt = String(contact.agent);
          found.agents[agentExt] = (found.agents[agentExt] || 0) + 1;
        }
      }
    });
    return data;
  };

  const getAgentStats = () => {
    const extNames = {};
    if (Array.isArray(extensions)) {
      extensions.forEach(e => {
        if (e.extension) {
          extNames[e.extension] = e.name || `Ramal ${e.extension}`;
        }
      });
    }

    const agentMap = {};
    
    // Pre-populate with registered extensions from the PABX
    if (Array.isArray(extensions)) {
      extensions.forEach(a => {
        agentMap[a.extension] = {
          extension: a.extension,
          name: a.name || `Ramal ${a.extension}`,
          loginTime: 'Conectado', // Default visual indicator
          answeredCount: 0,
          totalDuration: 0
        };
      });
    }

    if (campaign && campaign.contacts) {
      campaign.contacts.forEach(contact => {
        if (contact.status === 'answered' && contact.agent) {
          const agentExt = String(contact.agent);
          if (!agentMap[agentExt]) {
            agentMap[agentExt] = {
              extension: agentExt,
              name: extNames[agentExt] || contact.agentName || `Ramal ${agentExt}`,
              loginTime: '1h 30m',
              answeredCount: 0,
              totalDuration: 0
            };
          }
          agentMap[agentExt].answeredCount++;
          agentMap[agentExt].totalDuration += (contact.duration || 0);
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

  const extNames = {};
  if (Array.isArray(extensions)) {
    extensions.forEach(e => {
      if (e.extension) {
        extNames[e.extension] = e.name || `Ramal ${e.extension}`;
      }
    });
  }

  const filteredContacts = campaign && campaign.contacts
    ? campaign.contacts.filter(c => {
        const matchesStatus = statusFilter === 'all' || c.status === statusFilter;
        const matchesSearch = c.phone.includes(searchPhone) || (c.name || '').toLowerCase().includes(searchPhone.toLowerCase());
        const matchesAgent = agentFilter === 'all' || c.agent === agentFilter;
        return matchesStatus && matchesSearch && matchesAgent;
      })
    : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', width: '100%', textAlign: 'left' }}>
      
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 className="dialer-title" style={{ margin: 0 }}>📈 Dashboard & Relatórios de Campanhas</h2>
          <p style={{ color: '#9ca3af', fontSize: '0.85rem', marginTop: '4px' }}>
            Monitore o aproveitamento de chamadas por hora, desempenho por ramal de atendimento e filtros integrados.
          </p>
        </div>
        <button 
          onClick={loadCampaigns} 
          disabled={loading} 
          className="btn-neon-secondary" 
          style={{ padding: '8px 16px', fontSize: '13px' }}
        >
          🔄 Atualizar Lista
        </button>
      </div>

      {/* Campaign Selector Dropdown */}
      <div className="glass-panel" style={{ padding: '20px', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '14px', background: 'rgba(255, 255, 255, 0.01)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <label style={{ color: '#00f2fe', fontSize: '0.9rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            📂 Selecionar Campanha para Análise:
          </label>
          <select 
            value={selectedCampaignId} 
            onChange={e => setSelectedCampaignId(e.target.value)} 
            className="input-glass select-glass"
            style={{ width: '100%', padding: '12px', fontSize: '14px', borderRadius: '8px', cursor: 'pointer' }}
          >
            <option value="">-- Escolha uma Campanha para exibir os gráficos e métricas --</option>
            {campaignsList.map(c => (
              <option key={c.id} value={c.id}>
                🎯 {c.name || `Fila ${c.config?.queueId} ➔ ${c.config?.targetDestination}`} — {c.createdAt ? new Date(c.createdAt).toLocaleDateString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '-'} ({c.stats?.total || 0} contatos)
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Dashboard Area */}
      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: '#9ca3af', fontStyle: 'italic' }}>
          Carregando lista de campanhas...
        </div>
      ) : refreshing ? (
        <div style={{ padding: '40px', textAlign: 'center', color: '#00f2fe', fontStyle: 'italic' }}>
          Carregando dados da campanha selecionada...
        </div>
      ) : !campaign ? (
        <div className="glass-panel" style={{ padding: '60px 40px', textAlign: 'center', borderRadius: '14px', border: '1px dashed rgba(255,255,255,0.1)' }}>
          <span style={{ fontSize: '48px', display: 'block', marginBottom: '15px' }}>📊</span>
          <h3 style={{ margin: 0, color: '#fff' }}>Nenhuma Campanha Selecionada</h3>
          <p style={{ color: '#9ca3af', fontSize: '0.9rem', marginTop: '6px' }}>
            Selecione uma campanha na lista acima para visualizar o comportamento das chamadas, TMA e ranking de ramais.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* Campaign details summary banner */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.02)', padding: '15px 20px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.04)' }}>
            <div>
              <h3 style={{ margin: 0, color: '#fff', fontSize: '1.1rem' }}>{campaign.name}</h3>
              <span style={{ fontSize: '11px', color: '#9ca3af' }}>ID: <code style={{ color: '#00f2fe' }}>{campaign.id}</code></span>
            </div>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <span className={`dialer-status-badge ${campaign.status}`} style={{ fontSize: '11px' }}>
                {campaign.status === 'running' ? '● Em Execução' : campaign.status === 'paused' ? '■ Pausada' : campaign.status === 'completed' ? '✓ Concluída' : 'Parada'}
              </span>
              <span style={{ fontSize: '12px', color: '#9ca3af' }}>
                Criada em: {campaign.createdAt ? new Date(campaign.createdAt).toLocaleString('pt-BR') : '-'}
              </span>
            </div>
          </div>

          {/* Quick Metrics (TMA, Aproveitamento, Abandono) */}
          <div style={{ display: 'flex', gap: '15px', background: 'rgba(255,255,255,0.01)', padding: '18px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.04)', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: '150px', textAlign: 'center' }}>
              <div style={{ fontSize: '0.72rem', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>⏱️ Tempo Médio Atendimento (TMA)</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 'bold', color: '#00f2fe', marginTop: '6px' }}>
                {(() => {
                  const ans = campaign.contacts?.filter(c => c.status === 'answered') || [];
                  const totalDur = ans.reduce((acc, c) => acc + (c.duration || 0), 0);
                  return ans.length > 0 ? `${Math.round(totalDur / ans.length)}s` : '0s';
                })()}
              </div>
            </div>
            <div style={{ width: '1px', background: 'rgba(255,255,255,0.08)' }} />
            <div style={{ flex: 1, minWidth: '150px', textAlign: 'center' }}>
              <div style={{ fontSize: '0.72rem', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>📈 Aproveitamento (Atendidas)</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 'bold', color: '#10b981', marginTop: '6px' }}>
                {campaign.stats.total > 0 
                  ? `${(campaign.stats.answered / campaign.stats.total * 100).toFixed(1)}%` 
                  : '0%'}
              </div>
            </div>
            <div style={{ width: '1px', background: 'rgba(255,255,255,0.08)' }} />
            <div style={{ flex: 1, minWidth: '150px', textAlign: 'center' }}>
              <div style={{ fontSize: '0.72rem', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>⚠️ Taxa de Abandono</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 'bold', color: '#f59e0b', marginTop: '6px' }}>
                {campaign.stats.total > 0 
                  ? `${((campaign.stats.abandoned || 0) / campaign.stats.total * 100).toFixed(1)}%` 
                  : '0%'}
              </div>
            </div>
          </div>

          {/* Cards metrics dashboard */}
          <div className="dialer-stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '15px' }}>
            <div className="dialer-stat-card total" onClick={() => setStatusFilter('all')} style={{ cursor: 'pointer', border: statusFilter === 'all' ? '1px solid #00f2fe' : '1px solid rgba(255,255,255,0.05)' }}>
              <div className="dialer-stat-label">Total Contatos</div>
              <div className="dialer-stat-value" style={{ color: '#fff' }}>{campaign.stats.total}</div>
            </div>
            <div className="dialer-stat-card pending" onClick={() => setStatusFilter('pending')} style={{ cursor: 'pointer', border: statusFilter === 'pending' ? '1px solid #9ca3af' : '1px solid rgba(255,255,255,0.05)' }}>
              <div className="dialer-stat-label">Pendentes</div>
              <div className="dialer-stat-value" style={{ color: '#9ca3af' }}>{campaign.stats.pending}</div>
            </div>
            <div className="dialer-stat-card calling" onClick={() => setStatusFilter('calling')} style={{ cursor: 'pointer', border: statusFilter === 'calling' ? '1px solid var(--primary-purple)' : '1px solid rgba(255,255,255,0.05)' }}>
              <div className="dialer-stat-label">Em Ligação</div>
              <div className="dialer-stat-value" style={{ color: 'var(--primary-purple)' }}>{campaign.stats.calling}</div>
            </div>
            <div className="dialer-stat-card answered" onClick={() => setStatusFilter('answered')} style={{ cursor: 'pointer', border: statusFilter === 'answered' ? '1px solid #10b981' : '1px solid rgba(255,255,255,0.05)' }}>
              <div className="dialer-stat-label">Atendidas</div>
              <div className="dialer-stat-value" style={{ color: '#10b981' }}>{campaign.stats.answered}</div>
            </div>
            <div className="dialer-stat-card no-answer" onClick={() => setStatusFilter('no_answer')} style={{ cursor: 'pointer', border: statusFilter === 'no_answer' ? '1px solid #a3a3a3' : '1px solid rgba(255, 255, 255, 0.08)' }}>
              <div className="dialer-stat-label">Não Atendidas</div>
              <div className="dialer-stat-value" style={{ color: '#a3a3a3' }}>{campaign.stats.no_answer || 0}</div>
            </div>
            <div className="dialer-stat-card abandoned" onClick={() => setStatusFilter('abandoned')} style={{ cursor: 'pointer', border: statusFilter === 'abandoned' ? '1px solid #f59e0b' : '1px solid rgba(245, 158, 11, 0.15)' }}>
              <div className="dialer-stat-label">Abandonadas</div>
              <div className="dialer-stat-value" style={{ color: '#f59e0b' }}>{campaign.stats.abandoned || 0}</div>
            </div>
            <div className="dialer-stat-card voicemail" onClick={() => setStatusFilter('voicemail')} style={{ cursor: 'pointer', border: statusFilter === 'voicemail' ? '1px solid #eab308' : '1px solid rgba(234, 179, 8, 0.15)' }}>
              <div className="dialer-stat-label">Cx Postal</div>
              <div className="dialer-stat-value" style={{ color: '#eab308' }}>{campaign.stats.voicemail || 0}</div>
            </div>
            <div className="dialer-stat-card failed" onClick={() => setStatusFilter('failed')} style={{ cursor: 'pointer', border: statusFilter === 'failed' ? '1px solid #ef4444' : '1px solid rgba(255,255,255,0.05)' }}>
              <div className="dialer-stat-label">Falhas</div>
              <div className="dialer-stat-value" style={{ color: '#ef4444' }}>{campaign.stats.failed}</div>
            </div>
          </div>

          {/* Progress bar */}
          {campaign.stats.total > 0 && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#9ca3af', marginBottom: '5px' }}>
                <span>Progresso Total da Campanha</span>
                <span>{(((campaign.stats.answered || 0) + (campaign.stats.failed || 0) + (campaign.stats.voicemail || 0) + (campaign.stats.abandoned || 0) + (campaign.stats.no_answer || 0)) / campaign.stats.total * 100).toFixed(0)}% concluído</span>
              </div>
              <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', overflow: 'hidden' }}>
                <div 
                  style={{ 
                    height: '100%', 
                    background: 'var(--primary-gradient)', 
                    width: `${(((campaign.stats.answered || 0) + (campaign.stats.failed || 0) + (campaign.stats.voicemail || 0) + (campaign.stats.abandoned || 0) + (campaign.stats.no_answer || 0)) / campaign.stats.total * 100).toFixed(1)}%`,
                    transition: 'width 0.5s ease-out' 
                  }} 
                />
              </div>
            </div>
          )}

          {/* Hourly distribution and Agent Leaderboard columns */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '20px' }}>
            
            {/* Hourly Distribution CSS column chart */}
            <div className="glass-panel" style={{ padding: '20px', borderRadius: '12px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <h4 style={{ margin: '0 0 15px 0', fontSize: '0.9rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
                📊 Distribuição de Chamadas por Horário
              </h4>
              
              {(() => {
                const hourlyData = getHourlyStats();
                const maxVal = Math.max(...hourlyData.map(d => d.answered + d.no_answer + d.abandoned), 5);
                
                // Y-Axis scale ticks
                const yTicks = [
                  maxVal,
                  Math.round(maxVal * 0.75),
                  Math.round(maxVal * 0.5),
                  Math.round(maxVal * 0.25),
                  0
                ];

                return (
                  <div>
                    <div style={{ display: 'flex', gap: '15px', alignItems: 'stretch' }}>
                      {/* Y-Axis Labels */}
                      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '140px', paddingBottom: '20px', fontSize: '10px', color: '#9ca3af', textAlign: 'right', minWidth: '24px', boxSizing: 'border-box' }}>
                        {yTicks.map((val, idx) => (
                          <span key={idx}>{val}</span>
                        ))}
                      </div>

                      {/* Main Chart Grid */}
                      <div style={{ flexGrow: 1 }}>
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
                              <div key={i} className="chart-column-group" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, minWidth: '24px', position: 'relative' }}>
                                
                                {/* Custom Premium Tooltip */}
                                <div className="chart-tooltip-panel" style={{
                                  position: 'absolute',
                                  bottom: '120px',
                                  left: '50%',
                                  transform: 'translateX(-50%)',
                                  background: 'rgba(8, 11, 22, 0.96)',
                                  backdropFilter: 'blur(12px)',
                                  border: '1px solid rgba(0, 242, 254, 0.25)',
                                  boxShadow: '0 10px 30px rgba(0, 242, 254, 0.15)',
                                  borderRadius: '8px',
                                  padding: '12px',
                                  width: '210px',
                                  zIndex: 100,
                                  textAlign: 'left',
                                  pointerEvents: 'none',
                                  boxSizing: 'border-box'
                                }}>
                                  <div style={{ fontWeight: 'bold', fontSize: '11px', color: '#00f2fe', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '4px', marginBottom: '6px' }}>
                                    ⏰ Horário: {d.hour} às {String(parseInt(d.hour) + 1).padStart(2, '0')}:00
                                  </div>
                                  <div style={{ fontSize: '11px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    <div style={{ color: '#10b981', fontWeight: '600' }}>✅ Atendidas: {d.answered}</div>
                                    
                                    {d.answered > 0 && Object.keys(d.agents).length > 0 && (
                                      <div style={{ paddingLeft: '8px', borderLeft: '1px solid rgba(16, 185, 129, 0.3)', margin: '2px 0 4px 4px', display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '10px', color: '#9ca3af' }}>
                                        {Object.entries(d.agents).map(([ext, count]) => (
                                          <div key={ext}>
                                            • {extNames[ext] || `Ramal ${ext}`}: <strong>{count} atendimentos</strong>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                    
                                    <div style={{ color: '#f59e0b', fontWeight: '600' }}>⚠️ Abandonadas: {d.abandoned}</div>
                                    <div style={{ color: '#9ca3af', fontWeight: '600' }}>📭 Não Atendidas: {d.no_answer}</div>
                                  </div>
                                </div>

                                <div style={{ display: 'flex', alignItems: 'flex-end', gap: '2px', height: '110px', width: '100%', justifyContent: 'center', position: 'relative', paddingBottom: '2px' }}>
                                  
                                  {/* Total label above bars */}
                                  {total > 0 && (
                                    <span style={{ position: 'absolute', top: '-14px', fontSize: '9px', fontWeight: '800', color: '#fff', textShadow: '0 0 3px rgba(0,0,0,0.8)' }}>
                                      {total}
                                    </span>
                                  )}

                                  {/* Answered Bar */}
                                  {d.answered > 0 && (
                                    <div style={{ width: '6px', height: `${ansPct}%`, background: 'linear-gradient(180deg, #10b981, #059669)', borderRadius: '3px 3px 0 0', boxShadow: '0 0 5px rgba(16, 185, 129, 0.3)' }} />
                                  )}
                                  
                                  {/* Abandoned Bar */}
                                  {d.abandoned > 0 && (
                                    <div style={{ width: '6px', height: `${abPct}%`, background: 'linear-gradient(180deg, #f59e0b, #d97706)', borderRadius: '3px 3px 0 0', boxShadow: '0 0 5px rgba(245, 158, 11, 0.3)' }} />
                                  )}

                                  {/* No Answer Bar */}
                                  {d.no_answer > 0 && (
                                    <div style={{ width: '6px', height: `${noPct}%`, background: 'linear-gradient(180deg, #6b7280, #4b5563)', borderRadius: '3px 3px 0 0' }} />
                                  )}

                                </div>
                                <span style={{ fontSize: '9px', color: '#9ca3af', marginTop: '6px' }}>{d.hour.split(':')[0]}h</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
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

            {/* Leaderboard Table */}
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
                      const displayedAgents = showAllAgents ? agentStats : agentStats.slice(0, 10);
                      
                      return displayedAgents.map((a, idx) => {
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
                                  padding: '4px 10px',
                                  fontSize: '11px',
                                  borderRadius: '6px',
                                  border: '1px solid',
                                  background: agentFilter === a.extension ? '#00f2fe' : 'transparent',
                                  borderColor: '#00f2fe',
                                  color: agentFilter === a.extension ? '#000' : '#00f2fe',
                                  cursor: 'pointer',
                                  fontWeight: '600'
                                }}
                              >
                                {agentFilter === a.extension ? '✓ Filtrado' : 'Filtrar'}
                              </button>
                            </td>
                          </tr>
                        );
                      });
                    })()}
                  </tbody>
                </table>
              </div>

              {/* View More pagination button for leaderboard */}
              {(() => {
                const totalStats = getAgentStats().length;
                if (totalStats <= 10) return null;
                return (
                  <div style={{ textAlign: 'center', marginTop: '20px', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '15px' }}>
                    <button
                      onClick={() => setShowAllAgents(!showAllAgents)}
                      className="btn-neon-secondary"
                      style={{ padding: '8px 16px', fontSize: '12px', fontWeight: '600' }}
                    >
                      {showAllAgents ? '🔼 Recolher para Top 10' : `🔽 Mostrar Todos os Ramais (${totalStats})`}
                    </button>
                  </div>
                );
              })()}

            </div>
          </div>

          {/* Contact list filter section */}
          <div style={{ marginTop: '20px', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '20px' }}>
            <div className="dialer-list-header">
              <h4 className="dialer-list-title">📞 Detalhamento dos Contatos ({filteredContacts.length} de {campaign.contacts.length})</h4>
              
              <div className="dialer-list-controls">
                {/* Status Selector */}
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
                
                {/* Search box */}
                <input 
                  type="text" 
                  placeholder="Buscar telefone ou nome..." 
                  value={searchPhone} 
                  onChange={e => setSearchPhone(e.target.value)} 
                  className="input-glass" 
                  style={{ padding: '6px 12px', fontSize: '12px', width: '180px' }}
                />
              </div>
            </div>

            {/* Active filters display pill banner */}
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

            {/* Scrollable contacts table */}
            <div className="dialer-scroll-table">
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                    <th style={{ padding: '12px 16px', color: '#aaa', fontWeight: '500' }}>Telefone</th>
                    <th style={{ padding: '12px 16px', color: '#aaa', fontWeight: '500' }}>Nome</th>
                    <th style={{ padding: '12px 16px', color: '#aaa', fontWeight: '500', textAlign: 'center' }}>Data/Hora</th>
                    <th style={{ padding: '12px 16px', color: '#aaa', fontWeight: '500', textAlign: 'center' }}>Duração</th>
                    <th style={{ padding: '12px 16px', color: '#aaa', fontWeight: '500', textAlign: 'center' }}>Atendido por</th>
                    <th style={{ padding: '12px 16px', color: '#aaa', fontWeight: '500', textAlign: 'right' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredContacts.length === 0 ? (
                    <tr>
                      <td colSpan="6" style={{ padding: '30px', textStyle: 'italic', textAlign: 'center', color: '#9ca3af' }}>
                        Nenhum contato encontrado com os filtros ativos.
                      </td>
                    </tr>
                  ) : (
                    filteredContacts.map(c => {
                      const badgeClass = c.status;
                      const badgeLabel = c.status === 'pending' ? 'Pendente' : c.status === 'calling' ? 'Discando' : c.status === 'answered' ? 'Atendido' : c.status === 'no_answer' ? 'Não Atendeu' : c.status === 'abandoned' ? 'Abandonada' : c.status === 'voicemail' ? 'Caixa Postal' : 'Falhou';
                      const formattedDate = c.completedAt 
                        ? new Date(c.completedAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
                        : '-';
                      return (
                        <tr key={c.phone} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                          <td style={{ padding: '12px 16px', fontWeight: '500', color: '#fff' }}>{c.phone}</td>
                          <td style={{ padding: '12px 16px', color: '#ccc' }}>{c.name || '-'}</td>
                          <td style={{ padding: '12px 16px', textAlign: 'center', color: '#9ca3af' }}>{formattedDate}</td>
                          <td style={{ padding: '12px 16px', textAlign: 'center', color: '#00f2fe' }}>
                            {c.duration ? `${c.duration}s` : '-'}
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'center', color: '#ccc' }}>
                            {c.agent ? `${extNames[c.agent] || c.agentName || `Ramal ${c.agent}`} (${c.agent})` : '-'}
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                            <span className={`dialer-status-badge ${badgeClass}`}>{badgeLabel}</span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
          
        </div>
      )}
      
    </div>
  );
}
