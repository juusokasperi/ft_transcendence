import 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    user?: JWTPayload
  }
}

export interface JWTPayload {
	uuid: string;
	username: string;
	iat?: number;
	exp?: number;
}
