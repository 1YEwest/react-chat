import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  fetchProfile,
  loginUser,
  logoutUser,
  refreshAccessToken,
  registerUser,
} from './api/auth';
import type { ChatMessage, WsIncomingMessage, WsStatus } from './types';
import './App.css';

const WS_URL = 'wss://inai-col3.fishrungames.com/chat/';

type AuthMode = 'login' | 'register';

export function App() {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);

  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [formUsername, setFormUsername] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [isSubmittingAuth, setIsSubmittingAuth] = useState(false);

  const [wsStatus, setWsStatus] = useState<WsStatus>('disconnected');
  const [wsError, setWsError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageText, setMessageText] = useState('');

  const wsRef = useRef<WebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const isLoggingOutRef = useRef(false);

  // Восстановление сессии через HttpOnly refresh cookie при загрузке страницы
  useEffect(() => {
    let isMounted = true;

    async function restoreSession() {
      try {
        const newAccess = await refreshAccessToken();
        const profile = await fetchProfile(newAccess);
        if (!isMounted) return;
        setAccessToken(newAccess);
        setUsername(profile.username);
      } catch {
        // Пользователь не авторизован — показываем форму входа
      } finally {
        if (isMounted) {
          setIsInitializing(false);
        }
      }
    }

    void restoreSession();

    return () => {
      isMounted = false;
    };
  }, []);

  // Подключение к WebSocket и JWT-авторизация при наличии accessToken
  useEffect(() => {
    if (!accessToken) {
      setWsStatus('disconnected');
      return;
    }

    let isActive = true;
    isLoggingOutRef.current = false;
    setWsError(null);
    setWsStatus('connecting');

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      if (!isActive) return;
      setWsStatus('authenticating');
      ws.send(
        JSON.stringify({
          type: 'AUTH',
          payload: { token: accessToken },
        }),
      );
    };

    ws.onmessage = (event) => {
      if (!isActive) return;

      try {
        const data = JSON.parse(event.data as string) as WsIncomingMessage;

        if (data.type === 'AUTH_SUCCESS') {
          setWsStatus('connected');
          setUsername(data.payload.username);
          setWsError(null);
          return;
        }

        if (data.type === 'NEW_MESSAGE') {
          const { sender, text, timestamp } = data.payload;
          setMessages((prev) => [
            ...prev,
            {
              id: `${timestamp}-${sender}-${Math.random().toString(36).slice(2, 8)}`,
              sender,
              text,
              timestamp,
            },
          ]);
        }
      } catch {
        setWsError('Получено некорректное сообщение от сервера');
      }
    };

    ws.onerror = () => {
      if (!isActive) return;
      setWsError('Ошибка WebSocket-соединения');
    };

    ws.onclose = async () => {
      if (!isActive) return;
      wsRef.current = null;
      setWsStatus('disconnected');

      if (isLoggingOutRef.current) return;

      // Если соединение оборвалось (например, протух access token) — пробуем обновить токен
      try {
        const refreshed = await refreshAccessToken();
        if (isActive) {
          setAccessToken(refreshed);
        }
      } catch {
        if (isActive) {
          setAccessToken(null);
          setUsername(null);
          setWsError('Соединение закрыто. Войдите снова.');
        }
      }
    };

    return () => {
      isActive = false;
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
      wsRef.current = null;
    };
  }, [accessToken]);

  // Автопрокрутка вниз при появлении новых сообщений
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function handleAuthSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedUser = formUsername.trim();
    if (!trimmedUser || !formPassword) {
      setAuthError('Заполните имя пользователя и пароль');
      return;
    }

    setAuthError(null);
    setIsSubmittingAuth(true);

    try {
      const result =
        authMode === 'register'
          ? await registerUser(trimmedUser, formPassword)
          : await loginUser(trimmedUser, formPassword);

      setAccessToken(result.access);
      setUsername(result.user.username);
      setFormPassword('');
      setMessages([]);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Ошибка авторизации');
    } finally {
      setIsSubmittingAuth(false);
    }
  }

  async function handleLogout() {
    isLoggingOutRef.current = true;
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    try {
      await logoutUser();
    } catch {
      // Даже если запрос упал, очищаем локальное состояние
    } finally {
      setAccessToken(null);
      setUsername(null);
      setMessages([]);
      setWsStatus('disconnected');
      setWsError(null);
    }
  }

  function handleSendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = messageText.trim();
    if (!text || !wsRef.current || wsStatus !== 'connected') {
      return;
    }

    wsRef.current.send(
      JSON.stringify({
        type: 'CHAT_MESSAGE',
        payload: { text },
      }),
    );

    setMessageText('');
  }

  function formatTime(timestamp: number): string {
    return new Date(timestamp).toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function getStatusLabel(status: WsStatus): string {
    switch (status) {
      case 'connecting':
        return 'Подключение к чату...';
      case 'authenticating':
        return 'Авторизация JWT...';
      case 'connected':
        return `В сети как ${username ?? ''}`;
      default:
        return 'Отключён';
    }
  }

  if (isInitializing) {
    return (
      <div className="app-container">
        <div className="loader-card">Проверка сессии...</div>
      </div>
    );
  }

  if (!accessToken) {
    return (
      <div className="app-container">
        <div className="auth-card">
          <div className="auth-tabs">
            <button
              type="button"
              className={`auth-tab ${authMode === 'login' ? 'active' : ''}`}
              onClick={() => {
                setAuthMode('login');
                setAuthError(null);
              }}
            >
              Вход
            </button>
            <button
              type="button"
              className={`auth-tab ${authMode === 'register' ? 'active' : ''}`}
              onClick={() => {
                setAuthMode('register');
                setAuthError(null);
              }}
            >
              Регистрация
            </button>
          </div>

          <h1 className="auth-title">
            {authMode === 'login' ? 'Вход в групповой чат' : 'Создать аккаунт'}
          </h1>

          <form className="auth-form" onSubmit={handleAuthSubmit}>
            <div className="field">
              <label htmlFor="username">Имя пользователя</label>
              <input
                id="username"
                type="text"
                autoComplete="username"
                value={formUsername}
                onChange={(e) => setFormUsername(e.target.value)}
                placeholder="user1"
                disabled={isSubmittingAuth}
              />
            </div>

            <div className="field">
              <label htmlFor="password">Пароль</label>
              <input
                id="password"
                type="password"
                autoComplete={authMode === 'login' ? 'current-password' : 'new-password'}
                value={formPassword}
                onChange={(e) => setFormPassword(e.target.value)}
                placeholder="••••••••"
                disabled={isSubmittingAuth}
              />
            </div>

            {authError && <div className="error-banner">{authError}</div>}

            <button type="submit" className="primary-btn" disabled={isSubmittingAuth}>
              {isSubmittingAuth
                ? 'Загрузка...'
                : authMode === 'login'
                  ? 'Войти'
                  : 'Зарегистрироваться'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      <div className="chat-card">
        <header className="chat-header">
          <div className="chat-header-info">
            <span className="chat-header-title">Групповой чат</span>
            <div className="status-row">
              <span className={`status-dot ${wsStatus}`} />
              <span>{getStatusLabel(wsStatus)}</span>
            </div>
          </div>
          <button type="button" className="logout-btn" onClick={handleLogout}>
            Выйти
          </button>
        </header>

        {wsError && (
          <div className="error-banner" style={{ margin: '12px 18px 0' }}>
            {wsError}
          </div>
        )}

        <div className="messages-list">
          {messages.length === 0 ? (
            <div className="empty-chat">Сообщений пока нет. Напишите первым!</div>
          ) : (
            messages.map((msg) => {
              const isOwn = msg.sender === username;
              return (
                <div key={msg.id} className={`message-item ${isOwn ? 'own' : ''}`}>
                  <div className="message-meta">
                    <span className="message-sender">{msg.sender}</span>
                    <span>{formatTime(msg.timestamp)}</span>
                  </div>
                  <div className="message-bubble">{msg.text}</div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        <form className="chat-form" onSubmit={handleSendMessage}>
          <input
            type="text"
            className="chat-input"
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            placeholder={
              wsStatus === 'connected' ? 'Введите сообщение...' : 'Ожидание подключения...'
            }
            disabled={wsStatus !== 'connected'}
          />
          <button
            type="submit"
            className="primary-btn"
            disabled={wsStatus !== 'connected' || !messageText.trim()}
          >
            Отправить
          </button>
        </form>
      </div>
    </div>
  );
}

export default App;