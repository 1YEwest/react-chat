export interface UserProfileData {
  first_name: string;
  specialization: string;
  specialization_display: string;
  bio: string;
  fee: string;
}

export interface User {
  id: number;
  username: string;
  profile: UserProfileData;
}

export interface AuthResponse {
  access: string;
  user: User;
}

export interface RefreshResponse {
  access: string;
}

export interface ChatMessage {
  id: string;
  sender: string;
  text: string;
  timestamp: number;
}

export type WsIncomingMessage =
  | {
      type: 'AUTH_SUCCESS';
      payload: {
        username: string;
      };
    }
  | {
      type: 'NEW_MESSAGE';
      payload: {
        sender: string;
        text: string;
        timestamp: number;
      };
    };

export type WsStatus = 'disconnected' | 'connecting' | 'authenticating' | 'connected';
