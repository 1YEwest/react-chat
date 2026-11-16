import type { AuthResponse, RefreshResponse, User } from '../types';

const API_BASE = 'https://inai-col3.fishrungames.com';

function extractErrorMessage(data: unknown, fallback: string): string {
  if (!data || typeof data !== 'object') {
    return fallback;
  }

  const record = data as Record<string, unknown>;

  if (typeof record.detail === 'string') {
    return record.detail;
  }

  for (const value of Object.values(record)) {
    if (Array.isArray(value) && typeof value[0] === 'string') {
      return value[0];
    }
    if (typeof value === 'string') {
      return value;
    }
  }

  return fallback;
}

async function parseJsonSafe(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export async function registerUser(username: string, password: string): Promise<AuthResponse> {
  const response = await fetch(`${API_BASE}/api/register/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ username, password }),
  });

  const data = await parseJsonSafe(response);
  if (!response.ok) {
    throw new Error(extractErrorMessage(data, 'Ошибка регистрации'));
  }

  return data as AuthResponse;
}

export async function loginUser(username: string, password: string): Promise<AuthResponse> {
  const response = await fetch(`${API_BASE}/api/login/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ username, password }),
  });

  const data = await parseJsonSafe(response);
  if (!response.ok) {
    throw new Error(extractErrorMessage(data, 'Неверный логин или пароль'));
  }

  return data as AuthResponse;
}

export async function logoutUser(): Promise<void> {
  await fetch(`${API_BASE}/api/logout/`, {
    method: 'POST',
    credentials: 'include',
  });
}

export async function refreshAccessToken(): Promise<string> {
  const response = await fetch(`${API_BASE}/api/token/refresh/`, {
    method: 'POST',
    credentials: 'include',
  });

  const data = await parseJsonSafe(response);
  if (!response.ok) {
    throw new Error(extractErrorMessage(data, 'Сессия истекла'));
  }

  return (data as RefreshResponse).access;
}

export async function fetchProfile(accessToken: string): Promise<User> {
  const response = await fetch(`${API_BASE}/api/profile/`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    credentials: 'include',
  });

  const data = await parseJsonSafe(response);
  if (!response.ok) {
    throw new Error(extractErrorMessage(data, 'Не удалось получить профиль'));
  }

  return data as User;
}