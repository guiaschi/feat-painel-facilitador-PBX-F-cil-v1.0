import React, { useState, useEffect } from 'react';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import ExtensionModal from './components/ExtensionModal';
import QueueModal from './components/QueueModal';
import CSVImportModal from './components/CSVImportModal';
import { API_URL } from './config';

export default function App() {
  const [token, setToken] = useState(localStorage.getItem('pbx_token') || '');
  const [user, setUser] = useState(localStorage.getItem('pbx_user') || '');
  const [instance, setInstance] = useState(localStorage.getItem('pbx_instance') || '');
  const [extensions, setExtensions] = useState([]);
  const [queues, setQueues] = useState([]);
  const [dids, setDids] = useState([]);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isQueueModalOpen, setIsQueueModalOpen] = useState(false);
  const [isCSVModalOpen, setIsCSVModalOpen] = useState(false);
  const [isOperationLoading, setIsOperationLoading] = useState(false);
  const [operationText, setOperationText] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (token) {
      loadExtensions();
      loadQueues();
      loadDids();
    }
  }, [token]);

  const loadExtensions = async () => {
    setError('');
    setIsOperationLoading(true);
    setOperationText('Buscando lista de ramais atuais...');

    try {
      const response = await fetch(`${API_URL}/api/extensions`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 401) {
          handleLogout();
          throw new Error('Sessão expirada. Faça login novamente.');
        }
        throw new Error(data.error || 'Falha ao buscar ramais.');
      }

      setExtensions(data.extensions || []);
    } catch (err) {
      console.error(err);
      alert(err.message || 'Erro ao carregar ramais do PBX.');
    } finally {
      setIsOperationLoading(false);
      setOperationText('');
    }
  };

  const loadQueues = async () => {
    try {
      const response = await fetch(`${API_URL}/api/queues`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setQueues(data.queues || []);
      }
    } catch (err) {
      console.error('Error loading queues:', err);
    }
  };

  const loadDids = async () => {
    try {
      const response = await fetch(`${API_URL}/api/dids`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setDids(data.dids || []);
      }
    } catch (err) {
      console.error('Error loading DIDs:', err);
    }
  };

  const handleLoginSuccess = (newToken, newUser, newInstance) => {
    localStorage.setItem('pbx_token', newToken);
    localStorage.setItem('pbx_user', newUser);
    localStorage.setItem('pbx_instance', newInstance);
    setToken(newToken);
    setUser(newUser);
    setInstance(newInstance);
  };

  const handleLogout = () => {
    localStorage.removeItem('pbx_token');
    localStorage.removeItem('pbx_user');
    localStorage.removeItem('pbx_instance');
    setToken('');
    setUser('');
    setInstance('');
    setExtensions([]);
    setQueues([]);
  };

  const [activeEditData, setActiveEditData] = useState(null);
  const [activeEditQueueData, setActiveEditQueueData] = useState(null);

  const handleEditExtension = async (editExtData) => {
    setIsOperationLoading(true);
    setOperationText(`Salvando alterações do ramal ${editExtData.extension}... Atualizando abas e filas no PBX.`);

    try {
      const response = await fetch(`${API_URL}/api/extensions/edit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(editExtData),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao editar ramal.');
      }

      // Reload extension list
      await loadExtensions();
    } catch (err) {
      console.error(err);
      alert(err.message || 'Falha ao editar o ramal no PBX.');
    } finally {
      setIsOperationLoading(false);
      setOperationText('');
      setActiveEditData(null);
    }
  };

  const handleCreateExtension = async (newExtData) => {
    setIsModalOpen(false);
    setIsOperationLoading(true);
    setOperationText(`Criando ramal ${newExtData.extension}... Preenchendo abas e salvando no PBX.`);

    try {
      const response = await fetch(`${API_URL}/api/extensions/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(newExtData),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao cadastrar ramal.');
      }

      // Reload extension list
      await loadExtensions();
    } catch (err) {
      console.error(err);
      alert(err.message || 'Falha ao criar o ramal no PBX.');
      setIsOperationLoading(false);
    }
  };

  const handleCreateQueue = async (newQueueData) => {
    setIsQueueModalOpen(false);
    setIsOperationLoading(true);
    setOperationText(`Criando fila ${newQueueData.id}... Configurando agentes estáticos no PBX.`);

    try {
      const response = await fetch(`${API_URL}/api/queues/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(newQueueData),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao cadastrar fila.');
      }

      await loadQueues();
    } catch (err) {
      console.error(err);
      alert(err.message || 'Falha ao criar fila no PBX.');
    } finally {
      setIsOperationLoading(false);
      setOperationText('');
    }
  };

  const handleEditQueue = async (editQueueData) => {
    setIsQueueModalOpen(false);
    setIsOperationLoading(true);
    setOperationText(`Salvando alterações da fila ${editQueueData.id}... Atualizando agentes estáticos no PBX.`);

    try {
      const response = await fetch(`${API_URL}/api/queues/edit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(editQueueData),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao editar fila.');
      }

      await loadQueues();
    } catch (err) {
      console.error(err);
      alert(err.message || 'Falha ao editar a fila no PBX.');
    } finally {
      setIsOperationLoading(false);
      setOperationText('');
      setActiveEditQueueData(null);
    }
  };

  const handleDeleteQueue = async (queueId) => {
    setIsOperationLoading(true);
    setOperationText(`Removendo fila ${queueId} do PBX...`);

    try {
      const response = await fetch(`${API_URL}/api/queues/delete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ id: queueId }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao excluir fila.');
      }

      await loadQueues();
    } catch (err) {
      console.error(err);
      alert(err.message || 'Falha ao excluir a fila do PBX.');
    } finally {
      setIsOperationLoading(false);
      setOperationText('');
    }
  };

  const handleImportCSVStart = async (finalizedData) => {
    setIsCSVModalOpen(false);
    setIsOperationLoading(true);
    
    const errors = [];
    let successCount = 0;

    for (let i = 0; i < finalizedData.length; i++) {
      const extData = finalizedData[i];
      setOperationText(`Importando ${i + 1} de ${finalizedData.length}: Criando ramal ${extData.extension}...`);

      try {
        const response = await fetch(`${API_URL}/api/extensions/create`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify(extData),
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || 'Erro desconhecido');
        }
        successCount++;
      } catch (err) {
        console.error(`Erro ao importar ramal ${extData.extension}:`, err);
        errors.push(`Ramal ${extData.extension}: ${err.message}`);
      }
    }

    // Refresh extensions list
    await loadExtensions();

    setIsOperationLoading(false);
    setOperationText('');

    if (errors.length > 0) {
      alert(`Importação concluída!\nSucessos: ${successCount}\nFalhas:\n${errors.join('\n')}`);
    } else {
      alert(`Todos os ${successCount} ramais foram importados com sucesso!`);
    }
  };

  const handleDeleteExtension = async (extensionId) => {
    setIsOperationLoading(true);
    setOperationText(`Removendo ramal ${extensionId}... Enviando alterações para o PBX.`);

    try {
      const response = await fetch(`${API_URL}/api/extensions/delete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ extensionId }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao excluir ramal.');
      }

      await loadExtensions();
    } catch (err) {
      console.error(err);
      alert(err.message || 'Falha ao excluir o ramal do PBX.');
      setIsOperationLoading(false);
    }
  };

  const handleCreateDid = async (didData) => {
    setIsOperationLoading(true);
    setOperationText(`Criando rota de entrada ${didData.did}... Salvando no PBX.`);
    try {
      const response = await fetch(`${API_URL}/api/dids/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(didData),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Erro ao criar rota de entrada.');
      }
      await loadDids();
    } catch (err) {
      console.error(err);
      alert(err.message || 'Falha ao criar rota de entrada no PBX.');
    } finally {
      setIsOperationLoading(false);
      setOperationText('');
    }
  };

  const handleEditDid = async (didId, didData) => {
    setIsOperationLoading(true);
    setOperationText(`Editando rota de entrada ${didId}... Atualizando configurações no PBX.`);
    try {
      const response = await fetch(`${API_URL}/api/dids/edit/${encodeURIComponent(didId)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(didData),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Erro ao editar rota de entrada.');
      }
      await loadDids();
    } catch (err) {
      console.error(err);
      alert(err.message || 'Falha ao editar rota de entrada no PBX.');
    } finally {
      setIsOperationLoading(false);
      setOperationText('');
    }
  };

  const handleDeleteDid = async (didId) => {
    setIsOperationLoading(true);
    setOperationText(`Removendo rota de entrada ${didId}... Salvando no PBX.`);
    try {
      const response = await fetch(`${API_URL}/api/dids/delete/${encodeURIComponent(didId)}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Erro ao excluir rota de entrada.');
      }
      await loadDids();
    } catch (err) {
      console.error(err);
      alert(err.message || 'Falha ao excluir rota de entrada do PBX.');
    } finally {
      setIsOperationLoading(false);
      setOperationText('');
    }
  };

  const handleRefreshAll = async () => {
    await Promise.all([loadExtensions(), loadQueues(), loadDids()]);
  };

  if (!token) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <>
      <Dashboard
        extensions={extensions}
        queues={queues}
        dids={dids}
        instance={instance}
        user={user}
        onLogout={handleLogout}
        onCreateExtension={() => { setActiveEditData(null); setIsModalOpen(true); }}
        onEditExtension={(ext) => { setActiveEditData(ext); setIsModalOpen(true); }}
        onImportCSVClick={() => setIsCSVModalOpen(true)}
        onDeleteExtension={handleDeleteExtension}
        onCreateQueue={() => { setActiveEditQueueData(null); setIsQueueModalOpen(true); }}
        onEditQueue={(q) => { setActiveEditQueueData(q); setIsQueueModalOpen(true); }}
        onDeleteQueue={handleDeleteQueue}
        onCreateDid={handleCreateDid}
        onEditDid={handleEditDid}
        onDeleteDid={handleDeleteDid}
        isOperationLoading={isOperationLoading}
        currentOperationText={operationText}
        onRefresh={handleRefreshAll}
      />
      <ExtensionModal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); setActiveEditData(null); }}
        onSave={activeEditData ? handleEditExtension : handleCreateExtension}
        isLoading={isOperationLoading}
        editData={activeEditData}
        instance={instance}
      />
      <QueueModal
        isOpen={isQueueModalOpen}
        onClose={() => { setIsQueueModalOpen(false); setActiveEditQueueData(null); }}
        onSave={activeEditQueueData ? handleEditQueue : handleCreateQueue}
        isLoading={isOperationLoading}
        editData={activeEditQueueData}
        extensions={extensions}
        instance={instance}
      />
      <CSVImportModal
        isOpen={isCSVModalOpen}
        onClose={() => setIsCSVModalOpen(false)}
        onImportStart={handleImportCSVStart}
      />
    </>
  );
}
