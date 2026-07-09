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
      {/* Centralized login card panel */}
      <div className="login-right-panel">
        <div className="login-card animate-fade-in">
          {/* Logo */}
          <div style={{ textAlign: 'center' }}>
            <div className="login-logo-container">
              <img
                src="/upchat_logo.png"
                alt="Logo"
                style={{ height: '44px', objectFit: 'contain' }}
              />
            </div>
            <h1 className="login-title" style={{ marginTop: '16px' }}>PABX 2.0</h1>
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
                  placeholder="minhainstancia"
                  value={instance}
                  onChange={(e) => setInstance(e.target.value)}
                  disabled={isLoading}
                  style={{ paddingRight: '150px' }}
                />
                <span className="login-domain-suffix">.pbxfacil.com.br</span>
              </div>
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
              style={{ marginTop: '8px', width: '100%', height: '50px', fontSize: '1rem', letterSpacing: '0.02em' }}
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <div className="spinner" style={{
                    width: '18px',
                    height: '18px',
                    border: '2px solid rgba(255, 255, 255, 0.35)',
                    borderTop: '2px solid #fff',
                    borderRadius: '50%',
                    animation: 'spin 0.8s linear infinite',
                    marginRight: '8px'
                  }}></div>
                  Autenticando no PBX...
                </>
              ) : (
                '🔐  Conectar ao Painel'
              )}
            </button>
          </form>

          {/* Instagram link below login */}
          <div style={{ textAlign: 'center', marginTop: '14px', marginBottom: '6px' }}>
            <a 
              href="https://www.instagram.com/upchat.bot/" 
              target="_blank" 
              rel="noopener noreferrer" 
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                color: '#fe398a',
                fontSize: '0.82rem',
                textDecoration: 'none',
                fontWeight: '500',
                transition: 'opacity 0.2s',
              }}
              onMouseEnter={(e) => e.currentTarget.style.opacity = '0.8'}
              onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle' }}>
                <rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect>
                <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path>
                <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line>
              </svg>
              <span>@upchat.bot</span>
            </a>
          </div>

          <p style={{
            textAlign: 'center',
            fontSize: '0.78rem',
            color: '#94a3b8',
            margin: '0',
            lineHeight: 1.5
          }}>
            PABX 2.0 · Acesso seguro por JWT
          </p>
        </div>
      </div>
    </div>
  );
}

// Inline animations
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
