/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SERVER_URL?: string;
  readonly VITE_STUN_SERVERS?: string;
  readonly VITE_TURN_URL?: string;
  readonly VITE_TURN_USERNAME?: string;
  readonly VITE_TURN_CREDENTIAL?: string;
  readonly VITE_SPOTIFY_CLIENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
