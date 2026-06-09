// Allow Protocol — minimal X (Twitter) API v2 client with OAuth 1.0a signing.
//
// No dependencies (uses node:crypto). OAuth 1.0a user-context lets the app post
// on behalf of the owning account with four credentials — no callback flow:
//
//   apiKey, apiSecret, accessToken, accessTokenSecret  (App must be Read+Write)
//
// The signing implementation is verified offline against X's published example
// (see test/xClient.test.mjs), so it is known-correct before any network call.

import crypto from "node:crypto";

// RFC 3986 percent-encoding (stricter than encodeURIComponent).
export function percentEncode(value) {
  return encodeURIComponent(String(value)).replace(
    /[!*'()]/g,
    (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase()
  );
}

// Build the OAuth 1.0a Authorization header for a request. `params` are the
// request parameters included in the signature (query params and/or form body
// params). For API v2 JSON bodies, the JSON body is NOT signed — pass only
// query params (usually none).
export function oauth1Header({ method, url, params = {}, creds, oauth = {} } = {}) {
  const oauthParams = {
    oauth_consumer_key: creds.apiKey,
    oauth_token: creds.accessToken,
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: oauth.timestamp || Math.floor(Date.now() / 1000).toString(),
    oauth_nonce: oauth.nonce || crypto.randomBytes(16).toString("hex"),
    oauth_version: "1.0"
  };

  // Parameter string: all signable params (oauth + request), percent-encoded,
  // sorted by encoded key, joined with &.
  const allParams = { ...params, ...oauthParams };
  const paramString = Object.keys(allParams)
    .map((k) => [percentEncode(k), percentEncode(allParams[k])])
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");

  const baseString = [
    method.toUpperCase(),
    percentEncode(url),
    percentEncode(paramString)
  ].join("&");

  const signingKey = `${percentEncode(creds.apiSecret)}&${percentEncode(creds.accessTokenSecret)}`;
  const signature = crypto.createHmac("sha1", signingKey).update(baseString).digest("base64");

  const headerParams = { ...oauthParams, oauth_signature: signature };
  const header =
    "OAuth " +
    Object.keys(headerParams)
      .sort()
      .map((k) => `${percentEncode(k)}="${percentEncode(headerParams[k])}"`)
      .join(", ");

  return { header, signature, baseString };
}

// Post a tweet via X API v2. Returns { ok, status, id, body }.
export async function postTweet({ text, creds, fetchImpl, oauth } = {}) {
  const fetch = fetchImpl || globalThis.fetch;
  if (typeof fetch !== "function") throw new Error("postTweet requires a fetch implementation");
  if (!text || !text.trim()) throw new Error("postTweet requires non-empty text");
  assertCreds(creds);

  const url = "https://api.twitter.com/2/tweets";
  // v2 JSON body is not part of the OAuth signature — sign with no request params.
  const { header } = oauth1Header({ method: "POST", url, params: {}, creds, oauth });

  const res = await fetch(url, {
    method: "POST",
    headers: { authorization: header, "content-type": "application/json" },
    body: JSON.stringify({ text })
  });

  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  return {
    ok: res.ok,
    status: res.status,
    id: body?.data?.id || null,
    body
  };
}

export function credsFromEnv(env = process.env) {
  return {
    apiKey: env.X_API_KEY || "",
    apiSecret: env.X_API_SECRET || "",
    accessToken: env.X_ACCESS_TOKEN || "",
    accessTokenSecret: env.X_ACCESS_TOKEN_SECRET || ""
  };
}

function assertCreds(creds) {
  const missing = ["apiKey", "apiSecret", "accessToken", "accessTokenSecret"].filter((k) => !creds?.[k]);
  if (missing.length > 0) {
    throw new Error(`Missing X OAuth 1.0a credentials: ${missing.join(", ")}`);
  }
}
