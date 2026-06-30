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
    <div style={styles.container}>
      <div className="glass-panel pulse-glow login-card" style={styles.card}>
        <div style={styles.header}>
          <div style={styles.logoContainer}>
            <span style={styles.logoTextUp}>up</span>
            <span style={styles.logoTextChat}>chat</span>
            <span style={styles.logoTextSub}>.pbx</span>
          </div>
          <h1 style={styles.title}>Painel PBX Fácil</h1>
          <p style={styles.subtitle}>Gerencie ramais de forma simples e automatizada</p>
        </div>

        {error && (
          <div style={styles.errorAlert}>
            <span>⚠️</span>
            <p style={styles.errorText}>{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} style={styles.form}>
          <div className="form-group">
            <label htmlFor="instance">Instância</label>
            <div style={styles.inputWrapper}>
              <input
                id="instance"
                type="text"
                className="input-glass"
                placeholder="Ex: minhainstancia"
                value={instance}
                onChange={(e) => setInstance(e.target.value)}
                disabled={isLoading}
              />
              <span style={styles.domainSuffix}>.pbxfacil.com.br</span>
            </div>
            <span style={styles.tip}>Dica: Digite 'mock' para testar localmente</span>
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
            style={styles.submitBtn}
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <div className="spinner" style={styles.spinner}></div>
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

const styles = {
  container: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '100vh',
    padding: '20px',
  },
  card: {
    width: '100%',
    maxWidth: '480px',
    padding: '40px',
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
  },
  header: {
    textAlign: 'center',
  },
  logoContainer: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'baseline',
    marginBottom: '12px',
    fontSize: '2.2rem',
    fontFamily: 'Outfit, sans-serif',
    fontWeight: '800',
    letterSpacing: '-0.5px',
  },
  logoTextUp: {
    color: '#00f2fe',
    textShadow: '0 0 10px rgba(0, 242, 254, 0.4)',
  },
  logoTextChat: {
    color: '#fff',
  },
  logoTextSub: {
    color: '#9d4edd',
    fontSize: '1.2rem',
    marginLeft: '2px',
    fontWeight: '600',
    textShadow: '0 0 10px rgba(157, 78, 221, 0.4)',
  },
  title: {
    fontSize: '1.5rem',
    fontFamily: 'Outfit, sans-serif',
    fontWeight: '600',
    color: '#fff',
    marginBottom: '8px',
  },
  subtitle: {
    fontSize: '0.9rem',
    color: '#9ca3af',
    lineHeight: '1.4',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  inputWrapper: {
    display: 'flex',
    alignItems: 'center',
    position: 'relative',
    width: '100%',
  },
  domainSuffix: {
    position: 'absolute',
    right: '16px',
    color: '#6b7280',
    fontSize: '0.85rem',
    fontFamily: 'Outfit, sans-serif',
    pointerEvents: 'none',
  },
  tip: {
    fontSize: '0.75rem',
    color: '#00f2fe',
    marginTop: '2px',
    opacity: 0.85,
  },
  submitBtn: {
    marginTop: '12px',
    width: '100%',
    height: '48px',
  },
  errorAlert: {
    display: 'flex',
    gap: '12px',
    alignItems: 'center',
    background: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid rgba(239, 68, 68, 0.2)',
    padding: '12px 16px',
    borderRadius: '10px',
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
