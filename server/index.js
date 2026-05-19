import {
  createHmac,
  randomUUID,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { City, Country } from "country-state-city";

const scrypt = promisify(scryptCallback);

loadEnvFile();

const PORT = Number(process.env.PORT || 4000);
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD_SALT =
  process.env.ADMIN_PASSWORD_SALT || "bba62ce9a162b537fd9ad1e024e803db";
const ADMIN_PASSWORD_HASH =
  process.env.ADMIN_PASSWORD_HASH ||
  "647729ac0703559ac4510218bd6698b0ad653b86be85dcf62b63a5def497d1be26f74cd2ceb8676daa7439f503f85f6f8ceb46dd978e6ddb8a33d54301a36606";
const JWT_SECRET = process.env.JWT_SECRET || "development-only-change-this-secret";
const ACCESS_TOKEN_TTL_SECONDS = Number(process.env.ACCESS_TOKEN_TTL_SECONDS || 60 * 60);
const BODY_LIMIT_BYTES = 64 * 1024;
const DEFAULT_TRIPS_DATA_FILE = process.env.VERCEL
  ? "/tmp/missionary-trips.json"
  : "server/data/trips.json";
const TRIPS_DATA_FILE = resolve(process.cwd(), process.env.TRIPS_DATA_FILE || DEFAULT_TRIPS_DATA_FILE);
const countryDisplayNames = new Intl.DisplayNames(["ru"], { type: "region" });

if (process.env.NODE_ENV === "production" && JWT_SECRET === "development-only-change-this-secret") {
  throw new Error("JWT_SECRET must be set in production.");
}

export default async function handleRequest(request, response) {
  const origin = request.headers.origin;
  const url = getRequestUrl(request);

  if (request.method === "OPTIONS") {
    sendEmpty(response, 204, origin);
    return;
  }

  try {
    if (request.method === "GET" && url.pathname === "/api/health") {
      sendJson(response, 200, { ok: true }, origin);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/auth/login") {
      await handleLogin(request, response, origin);
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/auth/me") {
      const admin = authenticateAdmin(request);

      if (!admin) {
        sendJson(response, 401, { message: "Unauthorized." }, origin);
        return;
      }

      sendJson(response, 200, { user: admin }, origin);
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/locations/countries") {
      if (!authenticateAdmin(request)) {
        sendJson(response, 401, { message: "Unauthorized." }, origin);
        return;
      }

      sendJson(response, 200, { countries: getCountries() }, origin);
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/locations/cities") {
      if (!authenticateAdmin(request)) {
        sendJson(response, 401, { message: "Unauthorized." }, origin);
        return;
      }

      const countryCode = (url.searchParams.get("countryCode") || "").toUpperCase();
      const query = url.searchParams.get("query") || "";

      sendJson(response, 200, { cities: getCities(countryCode, query) }, origin);
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/admin/summary") {
      if (!authenticateAdmin(request)) {
        sendJson(response, 401, { message: "Unauthorized." }, origin);
        return;
      }

      const trips = readTrips();

      sendJson(
        response,
        200,
        {
          metrics: getDashboardMetrics(trips),
          trips: trips.map(toTripListItem),
          tasks: [],
        },
        origin,
      );
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/admin/trips") {
      if (!authenticateAdmin(request)) {
        sendJson(response, 401, { message: "Unauthorized." }, origin);
        return;
      }

      sendJson(response, 200, { trips: readTrips().map(toTripListItem) }, origin);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/admin/trips") {
      if (!authenticateAdmin(request)) {
        sendJson(response, 401, { message: "Unauthorized." }, origin);
        return;
      }

      const body = await readJsonBody(request);
      const trip = buildTrip(body);
      const trips = readTrips();

      trips.unshift(trip);
      writeTrips(trips);

      sendJson(response, 201, { trip }, origin);
      return;
    }

    const tripMatch = url.pathname.match(/^\/api\/admin\/trips\/([^/]+)$/);

    if (request.method === "GET" && tripMatch) {
      if (!authenticateAdmin(request)) {
        sendJson(response, 401, { message: "Unauthorized." }, origin);
        return;
      }

      const trip = readTrips().find((item) => item.id === tripMatch[1]);

      if (!trip) {
        sendJson(response, 404, { message: "Trip not found." }, origin);
        return;
      }

      sendJson(response, 200, { trip }, origin);
      return;
    }

    if (request.method === "PUT" && tripMatch) {
      if (!authenticateAdmin(request)) {
        sendJson(response, 401, { message: "Unauthorized." }, origin);
        return;
      }

      const trips = readTrips();
      const tripIndex = trips.findIndex((item) => item.id === tripMatch[1]);

      if (tripIndex === -1) {
        sendJson(response, 404, { message: "Trip not found." }, origin);
        return;
      }

      const body = await readJsonBody(request);
      const trip = buildTrip(body, trips[tripIndex]);

      trips[tripIndex] = trip;
      writeTrips(trips);

      sendJson(response, 200, { trip }, origin);
      return;
    }

    if (request.method === "DELETE" && tripMatch) {
      if (!authenticateAdmin(request)) {
        sendJson(response, 401, { message: "Unauthorized." }, origin);
        return;
      }

      const trips = readTrips();
      const nextTrips = trips.filter((item) => item.id !== tripMatch[1]);

      if (nextTrips.length === trips.length) {
        sendJson(response, 404, { message: "Trip not found." }, origin);
        return;
      }

      writeTrips(nextTrips);

      sendJson(response, 200, { ok: true }, origin);
      return;
    }

    sendJson(response, 404, { message: "Not found." }, origin);
  } catch (error) {
    const status = error.statusCode || 500;
    const message = status === 500 ? "Internal server error." : error.message;

    sendJson(response, status, { message }, origin);
  }
}

if (isMainModule()) {
  createServer(handleRequest).listen(PORT, () => {
    console.log(`Auth API is running on http://127.0.0.1:${PORT}`);
  });
}

function getRequestUrl(request) {
  const host = request.headers.host || "localhost";
  const url = new URL(request.url || "/", `http://${host}`);
  const routedPath = url.searchParams.get("__path");

  if (routedPath) {
    url.pathname = `/api/${routedPath.replace(/^\/+/, "")}`;
    url.searchParams.delete("__path");
  }

  return url;
}

function isMainModule() {
  return Boolean(process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href);
}

async function handleLogin(request, response, origin) {
  const body = await readJsonBody(request);
  const username = typeof body.username === "string" ? body.username.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const isValidAdmin =
    username === ADMIN_USERNAME && password.length > 0 && (await verifyPassword(password));

  if (!isValidAdmin) {
    sendJson(response, 401, { message: "Invalid username or password." }, origin);
    return;
  }

  const token = createAccessToken({ sub: ADMIN_USERNAME, role: "admin" });

  sendJson(
    response,
    200,
    {
      accessToken: token,
      tokenType: "Bearer",
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      user: { username: ADMIN_USERNAME, role: "admin" },
    },
    origin,
  );
}

function getCountries() {
  return Country.getAllCountries()
    .map((country) => ({
      code: country.isoCode,
      name: getCountryName(country.isoCode, country.name),
    }))
    .sort((first, second) => first.name.localeCompare(second.name, "ru"));
}

function getCities(countryCode, query) {
  if (!Country.getCountryByCode(countryCode)) {
    return [];
  }

  const normalizedQuery = query.trim().toLowerCase();
  const seenCities = new Set();
  const cities = [];

  for (const city of City.getCitiesOfCountry(countryCode) || []) {
    if (normalizedQuery && !city.name.toLowerCase().includes(normalizedQuery)) {
      continue;
    }

    if (seenCities.has(city.name)) {
      continue;
    }

    seenCities.add(city.name);
    cities.push({ name: city.name });

    if (cities.length >= 100) {
      break;
    }
  }

  return cities.sort((first, second) => first.name.localeCompare(second.name));
}

function buildTrip(body, existingTrip = null) {
  const countryCode = requiredText(body.countryCode, "countryCode", 2).toUpperCase();
  const country = Country.getCountryByCode(countryCode);

  if (!country) {
    throw httpError(400, "Unknown country.");
  }

  const date = requiredText(body.date, "date", 32);
  const peopleLimit = Number(body.peopleLimit);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
    throw httpError(400, "Date must use YYYY-MM-DD format.");
  }

  if (!Number.isInteger(peopleLimit) || peopleLimit < 1) {
    throw httpError(400, "People limit must be a positive integer.");
  }

  return {
    id: existingTrip?.id || randomUUID(),
    countryCode,
    countryName: getCountryName(countryCode, country.name),
    cityName: requiredText(body.cityName, "cityName", 160),
    description: requiredText(body.description, "description", 2000),
    date,
    peopleLimit,
    restrictions: requiredText(body.restrictions, "restrictions", 1000),
    cost: requiredText(body.cost, "cost", 160),
    note: optionalText(body.note, 1000),
    status: existingTrip?.status || "Набор открыт",
    createdAt: existingTrip?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function getDashboardMetrics(trips) {
  const peopleLimit = trips.reduce((total, trip) => total + Number(trip.peopleLimit || 0), 0);

  return [
    { id: "trips", label: "Активные поездки", value: String(trips.length) },
    { id: "requests", label: "Новые заявки", value: "0" },
    { id: "members", label: "Участники", value: String(peopleLimit) },
    { id: "reports", label: "Черновики отчетов", value: "0" },
  ];
}

function toTripListItem(trip) {
  return {
    id: trip.id,
    countryCode: trip.countryCode,
    countryName: trip.countryName,
    cityName: trip.cityName,
    date: trip.date,
    peopleLimit: trip.peopleLimit,
    cost: trip.cost,
    status: trip.status,
  };
}

function requiredText(value, fieldName, maxLength) {
  if (typeof value !== "string") {
    throw httpError(400, `${fieldName} is required.`);
  }

  const text = value.trim();

  if (!text) {
    throw httpError(400, `${fieldName} is required.`);
  }

  if (text.length > maxLength) {
    throw httpError(400, `${fieldName} is too long.`);
  }

  return text;
}

function optionalText(value, maxLength) {
  if (value === undefined || value === null) {
    return "";
  }

  if (typeof value !== "string") {
    throw httpError(400, "note must be a string.");
  }

  const text = value.trim();

  if (text.length > maxLength) {
    throw httpError(400, "note is too long.");
  }

  return text;
}

function getCountryName(countryCode, fallbackName) {
  try {
    return countryDisplayNames.of(countryCode) || fallbackName;
  } catch {
    return fallbackName;
  }
}

function readTrips() {
  if (!existsSync(TRIPS_DATA_FILE)) {
    return [];
  }

  const content = readFileSync(TRIPS_DATA_FILE, "utf8");
  const parsed = JSON.parse(content);

  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed;
}

function writeTrips(trips) {
  mkdirSync(dirname(TRIPS_DATA_FILE), { recursive: true });
  writeFileSync(TRIPS_DATA_FILE, JSON.stringify(trips, null, 2), "utf8");
}

function loadEnvFile() {
  const envPath = resolve(process.cwd(), ".env");

  if (!existsSync(envPath)) {
    return;
  }

  const envFile = readFileSync(envPath, "utf8");

  for (const line of envFile.split(/\r?\n/)) {
    const trimmedLine = line.trim();

    if (!trimmedLine || trimmedLine.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmedLine.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmedLine.slice(0, separatorIndex).trim();
    const rawValue = trimmedLine.slice(separatorIndex + 1).trim();
    const value = rawValue.replace(/^["']|["']$/g, "");

    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

async function readJsonBody(request) {
  if (request.body !== undefined && request.body !== null) {
    if (Buffer.isBuffer(request.body)) {
      return parseJsonBody(request.body.toString("utf8"));
    }

    if (typeof request.body === "string") {
      return parseJsonBody(request.body);
    }

    if (typeof request.body === "object" && !isReadableStreamBody(request.body)) {
      return request.body;
    }
  }

  const chunks = [];
  let totalBytes = 0;

  for await (const chunk of request) {
    totalBytes += chunk.length;

    if (totalBytes > BODY_LIMIT_BYTES) {
      throw httpError(413, "Request body is too large.");
    }

    chunks.push(chunk);
  }

  const rawBody = Buffer.concat(chunks).toString("utf8");

  return parseJsonBody(rawBody);
}

function parseJsonBody(rawBody) {
  if (!rawBody) {
    return {};
  }

  try {
    return JSON.parse(rawBody);
  } catch {
    throw httpError(400, "Request body must be valid JSON.");
  }
}

function isReadableStreamBody(body) {
  return typeof body.pipe === "function" || typeof body.getReader === "function";
}

async function verifyPassword(password) {
  const candidateHash = await scrypt(password, ADMIN_PASSWORD_SALT, 64);
  const storedHash = Buffer.from(ADMIN_PASSWORD_HASH, "hex");

  return candidateHash.length === storedHash.length && timingSafeEqual(candidateHash, storedHash);
}

function createAccessToken(payload) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "HS256", typ: "JWT" };
  const tokenPayload = {
    ...payload,
    iat: now,
    exp: now + ACCESS_TOKEN_TTL_SECONDS,
  };
  const encodedHeader = base64UrlJson(header);
  const encodedPayload = base64UrlJson(tokenPayload);
  const signature = sign(`${encodedHeader}.${encodedPayload}`);

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

function authenticateAdmin(request) {
  const token = getBearerToken(request);

  if (!token) {
    return null;
  }

  const payload = verifyAccessToken(token);

  if (!payload || payload.sub !== ADMIN_USERNAME || payload.role !== "admin") {
    return null;
  }

  return { username: payload.sub, role: payload.role };
}

function verifyAccessToken(token) {
  const parts = token.split(".");

  if (parts.length !== 3) {
    return null;
  }

  const [encodedHeader, encodedPayload, signature] = parts;
  const expectedSignature = sign(`${encodedHeader}.${encodedPayload}`);
  const signatureBuffer = Buffer.from(signature);
  const expectedSignatureBuffer = Buffer.from(expectedSignature);

  if (
    signatureBuffer.length !== expectedSignatureBuffer.length ||
    !timingSafeEqual(signatureBuffer, expectedSignatureBuffer)
  ) {
    return null;
  }

  try {
    const header = JSON.parse(Buffer.from(encodedHeader, "base64url").toString("utf8"));
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
    const now = Math.floor(Date.now() / 1000);

    if (header.alg !== "HS256" || header.typ !== "JWT" || payload.exp < now) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

function getBearerToken(request) {
  const authorization = request.headers.authorization || "";
  const [scheme, token] = authorization.split(" ");

  return scheme === "Bearer" && token ? token : "";
}

function sign(value) {
  return createHmac("sha256", JWT_SECRET).update(value).digest("base64url");
}

function base64UrlJson(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function sendJson(response, statusCode, body, origin) {
  response.writeHead(statusCode, {
    ...corsHeaders(origin),
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(body));
}

function sendEmpty(response, statusCode, origin) {
  response.writeHead(statusCode, corsHeaders(origin));
  response.end();
}

function corsHeaders(origin) {
  const allowedOrigin = getAllowedOrigin(origin);

  if (!allowedOrigin) {
    return {};
  }

  return {
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Origin": allowedOrigin,
    Vary: "Origin",
  };
}

function getAllowedOrigin(origin) {
  if (!origin) {
    return "";
  }

  const configuredOrigins = new Set(
    (process.env.CORS_ORIGIN || "https://astananazchurch-astana.github.io")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );

  if (configuredOrigins.has(origin)) {
    return origin;
  }

  if (process.env.NODE_ENV !== "production" && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) {
    return origin;
  }

  return "";
}

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;

  return error;
}
