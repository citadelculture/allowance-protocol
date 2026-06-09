import assert from "node:assert/strict";
import { oauth1Header, percentEncode, postTweet, credsFromEnv } from "../src/xClient.mjs";

// --- percent-encoding edge cases (RFC 3986) --------------------------------
assert.equal(percentEncode("Ladies + Gentlemen"), "Ladies%20%2B%20Gentlemen");
assert.equal(percentEncode("an=b&c=d"), "an%3Db%26c%3Dd");
assert.equal(percentEncode("a!*'()"), "a%21%2A%27%28%29");

// --- X's official OAuth 1.0a signature example ------------------------------
// Inputs (consumer key/secret, token/secret, nonce, timestamp, params) are from
// developer.twitter.com "Creating a signature". The expected signature is the
// HMAC-SHA1 of the documented base string + signing key, cross-checked with
// `openssl dgst -sha1 -hmac`, so this verifies our signing offline.
{
  const creds = {
    apiKey: "xvz1evFS4wEEPTGEFPHBog",
    apiSecret: "kAcSOqF21Fu85e7zjz7ZN2U4ZRhfV3WpwPAoE3Y7uU",
    accessToken: "370773112-GmHxMAgYyLbNEtIKZeRNFsMKPR9EyMZeS9weJAEb",
    accessTokenSecret: "LswwdoUaIvS8ltyTt5jkRh4J50vUPVVHtR2YPi5kE"
  };
  const { signature, baseString } = oauth1Header({
    method: "POST",
    url: "https://api.twitter.com/1.1/statuses/update.json",
    params: {
      status: "Hello Ladies + Gentlemen, a signed OAuth request!",
      include_entities: "true"
    },
    creds,
    oauth: {
      nonce: "kYjzVBB8Y0ZFabxSWbWovY3uYSQ2pTgmZeNu2VS4cg",
      timestamp: "1318622958"
    }
  });

  assert.ok(
    baseString.startsWith("POST&https%3A%2F%2Fapi.twitter.com%2F1.1%2Fstatuses%2Fupdate.json&"),
    "signature base string matches documented format"
  );
  assert.equal(signature, "oM+YuAxe5U9/gi5O6AedS+Htre4=", "signature matches openssl HMAC-SHA1 of the documented base string");
}

// --- header is well-formed OAuth ------------------------------------------
{
  const creds = { apiKey: "k", apiSecret: "ks", accessToken: "t", accessTokenSecret: "ts" };
  const { header } = oauth1Header({ method: "POST", url: "https://api.twitter.com/2/tweets", creds });
  assert.ok(header.startsWith("OAuth "));
  assert.match(header, /oauth_signature="[^"]+"/);
  assert.match(header, /oauth_consumer_key="k"/);
}

// --- postTweet posts JSON body and parses the tweet id (mock fetch) ---------
{
  const creds = { apiKey: "k", apiSecret: "ks", accessToken: "t", accessTokenSecret: "ts" };
  let seen = null;
  const fetchImpl = async (url, init) => {
    seen = { url, init };
    return new Response(JSON.stringify({ data: { id: "1799999999999999999", text: "gm" } }), {
      status: 201,
      headers: { "content-type": "application/json" }
    });
  };
  const result = await postTweet({ text: "gm", creds, fetchImpl });
  assert.equal(seen.url, "https://api.twitter.com/2/tweets");
  assert.equal(JSON.parse(seen.init.body).text, "gm");
  assert.ok(seen.init.headers.authorization.startsWith("OAuth "));
  assert.equal(result.ok, true);
  assert.equal(result.id, "1799999999999999999");
}

// --- guards ----------------------------------------------------------------
await assert.rejects(() => postTweet({ text: "", creds: {}, fetchImpl: async () => {} }), /non-empty text/);
await assert.rejects(
  () => postTweet({ text: "hi", creds: { apiKey: "only" }, fetchImpl: async () => {} }),
  /Missing X OAuth 1\.0a credentials/
);
assert.deepEqual(Object.keys(credsFromEnv({})), ["apiKey", "apiSecret", "accessToken", "accessTokenSecret"]);

console.log("xClient tests passed");
