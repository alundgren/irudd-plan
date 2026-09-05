import { createRemoteJWKSet, errors, jwtVerify, type JWTPayload } from "jose";

import { PlanError } from "../contract/errors.js";
import type { PlanStore } from "../database/store.js";

export interface VerifiedAccessIdentity {
  readonly issuer: string;
  readonly claims: Readonly<Record<string, unknown>>;
}

export interface AccessTokenVerifier {
  verify(token: string): Promise<VerifiedAccessIdentity>;
}

export class CloudflareAccessVerifier implements AccessTokenVerifier {
  private readonly jwks: ReturnType<typeof createRemoteJWKSet>;

  constructor(
    private readonly issuer: string,
    private readonly audience: string,
    jwksUrl: string,
  ) {
    this.jwks = createRemoteJWKSet(new URL(jwksUrl));
  }

  async verify(token: string): Promise<VerifiedAccessIdentity> {
    try {
      const result = await jwtVerify(token, this.jwks, {
        issuer: this.issuer,
        audience: this.audience,
        requiredClaims: ["exp"],
      });
      return { issuer: this.issuer, claims: result.payload as JWTPayload };
    } catch (error) {
      if (error instanceof errors.JWTExpired) {
        throw new PlanError("AUTH_EXPIRED", "Cloudflare Access token has expired");
      }
      throw new PlanError("AUTH_INVALID", "Cloudflare Access token is invalid");
    }
  }
}

export class TestAccessVerifier implements AccessTokenVerifier {
  constructor(
    private readonly identities: ReadonlyMap<string, VerifiedAccessIdentity>,
    private readonly expiredTokens: ReadonlySet<string> = new Set(),
  ) {}

  async verify(token: string): Promise<VerifiedAccessIdentity> {
    if (this.expiredTokens.has(token)) {
      throw new PlanError("AUTH_EXPIRED", "Test token has expired");
    }
    const identity = this.identities.get(token);
    if (identity === undefined) throw new PlanError("AUTH_INVALID", "Test token is invalid");
    return identity;
  }
}

export class Authenticator {
  constructor(
    private readonly verifier: AccessTokenVerifier,
    private readonly store: PlanStore,
    private readonly kind: "service" | "browser" = "service",
  ) {}

  async authenticate(
    headers: Readonly<Record<string, string | string[] | undefined>>,
  ): Promise<string> {
    const assertionHeader = headers["cf-access-jwt-assertion"];
    const authorizationHeader = headers.authorization;
    const assertion = Array.isArray(assertionHeader) ? assertionHeader[0] : assertionHeader;
    const authorization = Array.isArray(authorizationHeader)
      ? authorizationHeader[0]
      : authorizationHeader;
    const bearer = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
    const token = assertion ?? bearer;
    if (token === undefined || token.length === 0) {
      throw new PlanError("AUTH_INVALID", "A Cloudflare Access assertion is required");
    }
    const identity = await this.verifier.verify(token);
    const ownerId = await this.store.resolveOwner(identity.issuer, identity.claims, this.kind);
    if (ownerId === undefined) {
      throw new PlanError(
        "AUTH_UNKNOWN_IDENTITY",
        "The verified identity is not mapped to an owner",
      );
    }
    return ownerId;
  }
}
