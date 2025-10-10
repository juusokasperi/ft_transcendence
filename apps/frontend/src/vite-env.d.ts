/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_TOURNAMENT_SIZE?: string;
  readonly VITE_RECENT_TOURNAMENT_WINDOW_MS?: string;
  readonly VITE_MAX_VISIBLE_TOURNAMENTS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
