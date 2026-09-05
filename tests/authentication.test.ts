import { createServer } from "node:http";

import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { describe, expect, it } from "vitest";

import {
  Authenticator,
  CloudflareAccessVerifier,
  TestAccessVerifier,
} from "../src/auth/authentication.js";
import { createTestStore, issuer } from "./test-service.js";

describe("authentication", () => {
  it("validates JWT signature, issuer, audience, and expiry", async () => {
    const trusted = await generateKeyPair("RS256");
    const forged = await generateKeyPair("RS256");
    const publicJwk = await exportJWK(trusted.publicKey);
    publicJwk.kid = "trusted";
    publicJwk.alg = "RS256";
    const jwksServer = createServer((_request, response) => {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ keys: [publicJwk] }));
    });
    await new Promise<void>((resolve) => jwksServer.listen(0, "127.0.0.1", resolve));
    const address = jwksServer.address();
    if (address === null || typeof address === "string") throw new Error("Missing JWKS address");
    const verifier = new CloudflareAccessVerifier(
      issuer,
      "test-audience",
      `http://127.0.0.1:${address.port}/certs`,
    );
    const sign = (
      key: CryptoKey,
      expiresAt: number,
      tokenIssuer = issuer,
      audience = "test-audience",
    ) =>
      new SignJWT({ common_name: "service-a" })
        .setProtectedHeader({
          alg: "RS256",
          kid: key === trusted.privateKey ? "trusted" : "forged",
        })
        .setIssuer(tokenIssuer)
        .setAudience(audience)
        .setIssuedAt()
        .setExpirationTime(expiresAt)
        .sign(key);
    try {
      const valid = await sign(trusted.privateKey, Math.floor(Date.now() / 1000) + 60);
      await expect(verifier.verify(valid)).resolves.toMatchObject({ issuer });
      const missingExpiry = await new SignJWT({ common_name: "service-a" })
        .setProtectedHeader({ alg: "RS256", kid: "trusted" })
        .setIssuer(issuer)
        .setAudience("test-audience")
        .setIssuedAt()
        .sign(trusted.privateKey);
      await expect(verifier.verify(missingExpiry)).rejects.toMatchObject({ code: "AUTH_INVALID" });
      const expired = await sign(trusted.privateKey, Math.floor(Date.now() / 1000) - 1);
      await expect(verifier.verify(expired)).rejects.toMatchObject({ code: "AUTH_EXPIRED" });
      const forgedToken = await sign(forged.privateKey, Math.floor(Date.now() / 1000) + 60);
      await expect(verifier.verify(forgedToken)).rejects.toMatchObject({ code: "AUTH_INVALID" });
      const wrongIssuer = await sign(
        trusted.privateKey,
        Math.floor(Date.now() / 1000) + 60,
        "https://attacker.example",
      );
      await expect(verifier.verify(wrongIssuer)).rejects.toMatchObject({ code: "AUTH_INVALID" });
      const wrongAudience = await sign(
        trusted.privateKey,
        Math.floor(Date.now() / 1000) + 60,
        issuer,
        "other-audience",
      );
      await expect(verifier.verify(wrongAudience)).rejects.toMatchObject({ code: "AUTH_INVALID" });
    } finally {
      await new Promise<void>((resolve, reject) =>
        jwksServer.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });

  it("keeps service and browser mappings separate while allowing one owner", async () => {
    const store = await createTestStore();
    const verifier = new TestAccessVerifier(
      new Map([
        ["service", { issuer, claims: { common_name: "service-a" } }],
        ["browser", { issuer, claims: { email: "person@example.com" } }],
      ]),
    );
    const serviceAuth = new Authenticator(verifier, store, "service");
    const browserAuth = new Authenticator(verifier, store, "browser");
    await expect(serviceAuth.authenticate({ authorization: "Bearer service" })).resolves.toBe(
      "owner-a",
    );
    await expect(browserAuth.authenticate({ authorization: "Bearer browser" })).resolves.toBe(
      "owner-a",
    );
    await expect(
      browserAuth.authenticate({ authorization: "Bearer service" }),
    ).rejects.toMatchObject({
      code: "AUTH_UNKNOWN_IDENTITY",
    });
    await store.configureOwners([
      {
        issuer,
        claim: "common_name",
        value: "service-b",
        kind: "service",
        ownerId: "owner-b",
      },
    ]);
    await expect(
      serviceAuth.authenticate({ authorization: "Bearer service" }),
    ).rejects.toMatchObject({ code: "AUTH_UNKNOWN_IDENTITY" });
  });
});
