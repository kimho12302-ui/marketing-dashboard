/**
 * Google Sheets write helper (server-side only)
 * Uses service account for authentication
 */

const SHEET_ID = "1FzxDCyR9FyAIduf7Q0lfUIOzvSqVlod21eOFqaPrXio";

// Service account credentials from env
function getCredentials() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

async function getAccessToken(): Promise<string | null> {
  const creds = getCredentials();
  if (!creds) return null;

  // JWT creation for Google OAuth2
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const claim = Buffer.from(JSON.stringify({
    iss: creds.client_email,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  })).toString("base64url");

  const crypto = await import("crypto");
  const sign = crypto.createSign("RSA-SHA256");
  sign.update(`${header}.${claim}`);
  const signature = sign.sign(creds.private_key, "base64url");

  const jwt = `${header}.${claim}.${signature}`;

  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  const data = await resp.json();
  return data.access_token || null;
}

/**
 * Write values to a specific range in the Stats sheet
 */
export async function writeToSheet(
  range: string,
  values: (string | number)[][],
  sheetId?: string,
): Promise<{ ok: boolean; error?: string }> {
  const token = await getAccessToken();
  if (!token) return { ok: false, error: "No Google credentials" };

  const sid = sheetId || SHEET_ID;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sid}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`;

  const resp = await fetch(url, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ range, values }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    return { ok: false, error: `Sheets API: ${resp.status} ${err.slice(0, 200)}` };
  }
  return { ok: true };
}

/**
 * Append values to a sheet tab
 */
export async function appendToSheet(
  range: string,
  values: (string | number)[][],
  sheetId?: string,
): Promise<{ ok: boolean; error?: string }> {
  const token = await getAccessToken();
  if (!token) return { ok: false, error: "No Google credentials" };

  const sid = sheetId || SHEET_ID;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sid}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;

  const resp = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ range, values }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    return { ok: false, error: `Sheets API: ${resp.status} ${err.slice(0, 200)}` };
  }
  return { ok: true };
}

/**
 * Read values from a range
 */
export async function readFromSheet(
  range: string,
  sheetId?: string,
): Promise<{ ok: boolean; values?: (string | number)[][]; error?: string }> {
  const token = await getAccessToken();
  if (!token) return { ok: false, error: "No Google credentials" };

  const sid = sheetId || SHEET_ID;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sid}/values/${encodeURIComponent(range)}`;

  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!resp.ok) {
    const err = await resp.text();
    return { ok: false, error: `Sheets API: ${resp.status} ${err.slice(0, 200)}` };
  }
  const data = await resp.json();
  return { ok: true, values: data.values || [] };
}
