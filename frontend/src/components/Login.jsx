import React, { useState } from 'react';
import { API_URL } from '../config';

export default function Login({ onLoginSuccess }) {
  const [instance, setInstance] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!instance || !username || !password) {
      setError('Por favor, preencha todos os campos.');
      return;
    }

    setError('');
    setIsLoading(true);

    try {
      const response = await fetch(`${API_URL}/api/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ instance, username, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao realizar login.');
      }

      onLoginSuccess(data.token, data.user, data.instance);
    } catch (err) {
      console.error(err);
      setError(err.message || 'Falha na conexão com o servidor.');
    } finally {
      setIsLoading(false);
    }
  };
  return (
    <div className="login-container">
      <div className="glass-panel pulse-glow login-card">
        <div style={{ textAlign: 'center' }}>
          <div className="login-logo-container">
            <span className="login-logo-up">up</span>
            <span className="login-logo-chat">chat</span>
            <span className="login-logo-sub">.pbx</span>
          </div>
          <h1 className="login-title">Painel PBX Fácil</h1>
          <p className="login-subtitle">Gerencie ramais de forma simples e automatizada</p>
        </div>

        {error && (
          <div className="login-error-alert">
            <span>⚠️</span>
            <p className="login-error-text">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="form-group">
            <label htmlFor="instance">Instância</label>
            <div className="login-input-wrapper">
              <input
                id="instance"
                type="text"
                className="input-glass"
                placeholder="Ex: minhainstancia"
                value={instance}
                onChange={(e) => setInstance(e.target.value)}
                disabled={isLoading}
              />
              <span className="login-domain-suffix">.pbxfacil.com.br</span>
            </div>
            <span className="login-tip">Dica: Digite 'mock' para testar localmente</span>
          </div>

          <div className="form-group">
            <label htmlFor="username">Usuário</label>
            <input
              id="username"
              type="text"
              className="input-glass"
              placeholder="Digite o usuário administrador"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={isLoading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Senha</label>
            <input
              id="password"
              type="password"
              className="input-glass"
              placeholder="Digite a senha"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLoading}
            />
          </div>

          <button
            type="submit"
            className="btn-neon-primary"
            style={{ marginTop: '12px', width: '100%', height: '48px' }}
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <div className="spinner" style={{
                  width: '18px',
                  height: '18px',
                  border: '2px solid rgba(255, 255, 255, 0.3)',
                  borderTop: '2px solid #fff',
                  borderRadius: '50%',
                  animation: 'spin 0.8s linear infinite',
                  marginRight: '8px'
                }}></div>
                Autenticando no PBX...
              </>
            ) : (
              'Conectar ao Painel'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

// Inline animations keyframe injection
if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.innerHTML = `
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  `;
  document.head.appendChild(style);
}

