export function computeChannelFromPath(pathname: string) {
  // Home
  if (pathname === '/') return 'Lobby';

  // Force logged-in profile pages to use lobby channel
  if (pathname.startsWith('/profile')) return 'Lobby';

  // Pong area
  if (pathname.startsWith('/pong/tournaments/')) {
    const match = pathname.match(/^\/pong\/tournaments\/(\d+)/);
    if (match) {
      return `Tournaments-${match[1]}`;
    }
    return 'Tournaments';
  }
  if (pathname.startsWith('/pong/tournaments')) return 'Tournaments';
  if (pathname.startsWith('/pong/online')) return 'Online 1v1';

  return 'Lobby';
}
