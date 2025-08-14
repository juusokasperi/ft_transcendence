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

export interface User {
	id: number;
	uuid: string;
	username: string;
	passwordHash: string;
	wins: number;
	losses: number;
	createdAt: string;
}
