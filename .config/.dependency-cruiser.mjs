/** @type {import('dependency-cruiser').IConfiguration} */
export default {
  forbidden: [
    {
      name: 'no-client-into-game',
      from: { path: '^packages/pong/game-logic/src' },
      to: { path: '^packages/pong/render/src' },
    },
  ],
};
