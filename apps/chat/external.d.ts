declare module 'jsonwebtoken' {
  export interface JwtPayload {
    [key: string]: unknown;
  }

  export function verify(token: string, secretOrPublicKey: string): JwtPayload;
}

declare module 'uuid' {
  export function v4(): string;
}
