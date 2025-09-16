export const wsUrl = (path: string) => `${location.origin.replace(/^http/, 'ws')}${path}`;

// usage:
//const mm = new WebSocket(wsUrl('/matchmaking'));
//const game = new WebSocket(wsUrl('/game-server'));
