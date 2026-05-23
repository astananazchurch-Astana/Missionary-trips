import {
  createHmac,
  randomBytes,
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
import pg from "pg";

const scrypt = promisify(scryptCallback);
const { Pool } = pg;

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
const DEFAULT_ACCESS_CONTROL_DATA_FILE = process.env.VERCEL
  ? "/tmp/missionary-access-control.json"
  : "server/data/access-control.json";
const ACCESS_CONTROL_DATA_FILE = resolve(
  process.cwd(),
  process.env.ACCESS_CONTROL_DATA_FILE || DEFAULT_ACCESS_CONTROL_DATA_FILE,
);
const ACCESS_ACTIONS = [
  { id: "view", label: "Просмотр" },
  { id: "create", label: "Создать" },
  { id: "update", label: "Изменить" },
  { id: "delete", label: "Удалить" },
];
const ACCESS_MODULES = [
  {
    group: "Основное",
    resource: "dashboard",
    label: "Панель администратора",
    actions: ["view"],
  },
  {
    group: "Поездки",
    resource: "trips",
    label: "Управление поездками",
    actions: ["view", "create", "update", "delete"],
  },
  {
    group: "Поездки",
    resource: "participants",
    label: "Заявки участников",
    actions: ["view", "update", "delete"],
  },
  {
    group: "Доступы",
    resource: "accounts",
    label: "Аккаунты",
    actions: ["view", "create", "update", "delete"],
  },
  {
    group: "Доступы",
    resource: "ministries",
    label: "Служения",
    actions: ["view", "create", "update", "delete"],
  },
  {
    group: "Доступы",
    resource: "roles",
    label: "Роли",
    actions: ["view", "create", "update", "delete"],
  },
  {
    group: "Сайт",
    resource: "landing",
    label: "Контент лендинга",
    actions: ["view", "update"],
  },
];
const ACCESS_PERMISSIONS = ACCESS_MODULES.flatMap((module) =>
  module.actions.map((action) => {
    const actionMeta = ACCESS_ACTIONS.find((item) => item.id === action);

    return {
      id: `${module.resource}:${action}`,
      label: module.label,
      description: `${actionMeta?.label || action} - ${module.label.toLowerCase()}`,
      group: module.group,
      resource: module.resource,
      resourceLabel: module.label,
      action,
      actionLabel: actionMeta?.label || action,
    };
  }),
);
const LEGACY_PERMISSION_MAP = {
  "trips:manage": ["trips:create", "trips:update", "trips:delete"],
  "participants:manage": ["participants:view", "participants:update", "participants:delete"],
  "accounts:manage": ["accounts:view", "accounts:create", "accounts:update", "accounts:delete"],
  "roles:manage": ["roles:view", "roles:create", "roles:update", "roles:delete"],
};
const ACCESS_PERMISSION_IDS = new Set(ACCESS_PERMISSIONS.map((permission) => permission.id));
const ACCESS_CONTROL_ROUTE_PERMISSIONS = ACCESS_PERMISSIONS
  .filter((permission) => ["accounts", "ministries", "roles"].includes(permission.resource))
  .map((permission) => permission.id);
const DATABASE_URL =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_PRISMA_URL ||
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.STORAGE_URL ||
  "";
const databasePool = DATABASE_URL
  ? new Pool({
      connectionString: DATABASE_URL,
      ssl: DATABASE_URL.includes("sslmode=disable") ? false : { rejectUnauthorized: false },
    })
  : null;
let databaseReadyPromise = null;
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
      sendJson(response, 200, { ok: true, storage: databasePool ? "postgres" : "json" }, origin);
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/trips") {
      const trips = await getPublicTrips();

      sendJson(response, 200, { trips }, origin);
      return;
    }

    const publicTripMatch = url.pathname.match(/^\/api\/trips\/([^/]+)$/);
    const publicTripParticipantsMatch = url.pathname.match(/^\/api\/trips\/([^/]+)\/participants$/);

    if (request.method === "GET" && publicTripMatch) {
      const trip = await getPublicTripRecord(publicTripMatch[1]);

      if (!trip) {
        sendJson(response, 404, { message: "Trip not found." }, origin);
        return;
      }

      sendJson(response, 200, { trip }, origin);
      return;
    }

    if (request.method === "POST" && publicTripParticipantsMatch) {
      const trip = await getTripRecord(publicTripParticipantsMatch[1]);

      if (!trip) {
        sendJson(response, 404, { message: "Trip not found." }, origin);
        return;
      }

      if (isRegistrationClosed(trip.registrationDeadline || trip.date)) {
        sendJson(response, 400, { message: "Registration is closed." }, origin);
        return;
      }

      if ((trip.participants || []).length >= Number(trip.peopleLimit || 0)) {
        sendJson(response, 400, { message: "There are no available spots for this trip." }, origin);
        return;
      }

      const body = await readJsonBody(request);
      const participant = buildParticipant(body, trip.id);

      await createTripParticipant(participant);

      sendJson(response, 201, { participant: toPublicParticipant(participant) }, origin);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/auth/login") {
      await handleLogin(request, response, origin);
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/auth/me") {
      const admin = await authorizeRequest(request, response, origin);

      if (!admin) {
        return;
      }

      sendJson(response, 200, { user: admin }, origin);
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/locations/countries") {
      if (!(await authorizeRequest(request, response, origin))) {
        return;
      }

      sendJson(response, 200, { countries: getCountries() }, origin);
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/locations/cities") {
      if (!(await authorizeRequest(request, response, origin))) {
        return;
      }

      const countryCode = (url.searchParams.get("countryCode") || "").toUpperCase();
      const query = url.searchParams.get("query") || "";

      sendJson(response, 200, { cities: getCities(countryCode, query) }, origin);
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/admin/summary") {
      if (!(await authorizeRequest(request, response, origin, "trips:view"))) {
        return;
      }

      const trips = await readTrips();

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
      if (!(await authorizeRequest(request, response, origin, "trips:view"))) {
        return;
      }

      sendJson(response, 200, { trips: (await readTrips()).map(toTripListItem) }, origin);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/admin/trips") {
      if (!(await authorizeRequest(request, response, origin, "trips:create"))) {
        return;
      }

      const body = await readJsonBody(request);
      const trip = buildTrip(body);
      await createTripRecord(trip);

      sendJson(response, 201, { trip }, origin);
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/admin/access-control") {
      const admin = await authorizeRequest(request, response, origin, ACCESS_CONTROL_ROUTE_PERMISSIONS);

      if (!admin) {
        return;
      }

      sendJson(response, 200, await getAccessControlSummary(admin), origin);
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/admin/ministries") {
      if (!(await authorizeRequest(request, response, origin, "ministries:view"))) {
        return;
      }

      sendJson(response, 200, { ministries: await readMinistries() }, origin);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/admin/ministries") {
      if (!(await authorizeRequest(request, response, origin, "ministries:create"))) {
        return;
      }

      const ministry = buildMinistry(await readJsonBody(request));
      await createMinistryRecord(ministry);

      sendJson(response, 201, { ministry }, origin);
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/admin/roles") {
      if (!(await authorizeRequest(request, response, origin, "roles:view"))) {
        return;
      }

      sendJson(response, 200, { roles: await readAccessRoles() }, origin);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/admin/roles") {
      if (!(await authorizeRequest(request, response, origin, "roles:create"))) {
        return;
      }

      const role = buildAccessRole(await readJsonBody(request), await readMinistries());
      await createAccessRoleRecord(role);

      sendJson(response, 201, { role: await getAccessRoleRecord(role.id) }, origin);
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/admin/accounts") {
      if (!(await authorizeRequest(request, response, origin, "accounts:view"))) {
        return;
      }

      sendJson(response, 200, { accounts: await readStaffAccounts() }, origin);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/admin/accounts") {
      if (!(await authorizeRequest(request, response, origin, "accounts:create"))) {
        return;
      }

      const account = await buildStaffAccount(await readJsonBody(request), {
        ministries: await readMinistries(),
        roles: await readAccessRoles(),
      });
      await createStaffAccountRecord(account);

      sendJson(response, 201, { account: await getStaffAccountRecord(account.id) }, origin);
      return;
    }

    const adminTripParticipantMatch = url.pathname.match(
      /^\/api\/admin\/trips\/([^/]+)\/participants\/([^/]+)$/,
    );
    const tripMatch = url.pathname.match(/^\/api\/admin\/trips\/([^/]+)$/);
    const ministryMatch = url.pathname.match(/^\/api\/admin\/ministries\/([^/]+)$/);
    const accessRoleMatch = url.pathname.match(/^\/api\/admin\/roles\/([^/]+)$/);
    const staffAccountMatch = url.pathname.match(/^\/api\/admin\/accounts\/([^/]+)$/);

    if (request.method === "PUT" && ministryMatch) {
      if (!(await authorizeRequest(request, response, origin, "ministries:update"))) {
        return;
      }

      const existingMinistry = await getMinistryRecord(ministryMatch[1]);

      if (!existingMinistry) {
        sendJson(response, 404, { message: "Ministry not found." }, origin);
        return;
      }

      const ministry = buildMinistry(await readJsonBody(request), existingMinistry);
      await updateMinistryRecord(ministry);

      sendJson(response, 200, { ministry }, origin);
      return;
    }

    if (request.method === "DELETE" && ministryMatch) {
      if (!(await authorizeRequest(request, response, origin, "ministries:delete"))) {
        return;
      }

      const isDeleted = await deleteMinistryRecord(ministryMatch[1]);

      if (!isDeleted) {
        sendJson(response, 404, { message: "Ministry not found." }, origin);
        return;
      }

      sendJson(response, 200, { ok: true }, origin);
      return;
    }

    if (request.method === "PUT" && accessRoleMatch) {
      if (!(await authorizeRequest(request, response, origin, "roles:update"))) {
        return;
      }

      const existingRole = await getAccessRoleRecord(accessRoleMatch[1]);

      if (!existingRole) {
        sendJson(response, 404, { message: "Role not found." }, origin);
        return;
      }

      const role = buildAccessRole(await readJsonBody(request), await readMinistries(), existingRole);
      await updateAccessRoleRecord(role);

      sendJson(response, 200, { role: await getAccessRoleRecord(role.id) }, origin);
      return;
    }

    if (request.method === "DELETE" && accessRoleMatch) {
      if (!(await authorizeRequest(request, response, origin, "roles:delete"))) {
        return;
      }

      const isDeleted = await deleteAccessRoleRecord(accessRoleMatch[1]);

      if (!isDeleted) {
        sendJson(response, 404, { message: "Role not found." }, origin);
        return;
      }

      sendJson(response, 200, { ok: true }, origin);
      return;
    }

    if (request.method === "PUT" && staffAccountMatch) {
      if (!(await authorizeRequest(request, response, origin, "accounts:update"))) {
        return;
      }

      const existingAccount = await getRawStaffAccountRecord(staffAccountMatch[1]);

      if (!existingAccount) {
        sendJson(response, 404, { message: "Account not found." }, origin);
        return;
      }

      const account = await buildStaffAccount(
        await readJsonBody(request),
        {
          ministries: await readMinistries(),
          roles: await readAccessRoles(),
        },
        existingAccount,
      );
      await updateStaffAccountRecord(account);

      sendJson(response, 200, { account: await getStaffAccountRecord(account.id) }, origin);
      return;
    }

    if (request.method === "DELETE" && staffAccountMatch) {
      if (!(await authorizeRequest(request, response, origin, "accounts:delete"))) {
        return;
      }

      const isDeleted = await deleteStaffAccountRecord(staffAccountMatch[1]);

      if (!isDeleted) {
        sendJson(response, 404, { message: "Account not found." }, origin);
        return;
      }

      sendJson(response, 200, { ok: true }, origin);
      return;
    }

    if (request.method === "DELETE" && adminTripParticipantMatch) {
      if (!(await authorizeRequest(request, response, origin, "participants:delete"))) {
        return;
      }

      const isDeleted = await deleteTripParticipantRecord(
        adminTripParticipantMatch[1],
        adminTripParticipantMatch[2],
      );

      if (!isDeleted) {
        sendJson(response, 404, { message: "Participant not found." }, origin);
        return;
      }

      sendJson(response, 200, { ok: true }, origin);
      return;
    }

    if (request.method === "GET" && tripMatch) {
      const admin = await authorizeRequest(request, response, origin, "trips:view");

      if (!admin) {
        return;
      }

      const trip = await getTripRecord(tripMatch[1]);

      if (!trip) {
        sendJson(response, 404, { message: "Trip not found." }, origin);
        return;
      }

      sendJson(response, 200, { trip: stripParticipantsWithoutPermission(trip, admin) }, origin);
      return;
    }

    if (request.method === "PUT" && tripMatch) {
      if (!(await authorizeRequest(request, response, origin, "trips:update"))) {
        return;
      }

      const trips = await readTrips();
      const tripIndex = trips.findIndex((item) => item.id === tripMatch[1]);

      if (tripIndex === -1) {
        sendJson(response, 404, { message: "Trip not found." }, origin);
        return;
      }

      const body = await readJsonBody(request);
      const trip = buildTrip(body, trips[tripIndex]);
      await updateTripRecord(trip);

      sendJson(response, 200, { trip }, origin);
      return;
    }

    if (request.method === "DELETE" && tripMatch) {
      if (!(await authorizeRequest(request, response, origin, "trips:delete"))) {
        return;
      }

      const isDeleted = await deleteTripRecord(tripMatch[1]);

      if (!isDeleted) {
        sendJson(response, 404, { message: "Trip not found." }, origin);
        return;
      }

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
    const account = await authenticateStaffAccount(username, password);

    if (!account) {
      sendJson(response, 401, { message: "Invalid username or password." }, origin);
      return;
    }

    const token = createAccessToken({
      sub: account.id,
      role: "account",
      accountId: account.id,
      phone: account.phone,
      ministryId: account.ministryId,
      roleId: account.roleId,
      permissions: account.permissions,
    });

    sendJson(
      response,
      200,
      {
        accessToken: token,
        tokenType: "Bearer",
        expiresIn: ACCESS_TOKEN_TTL_SECONDS,
        user: {
          id: account.id,
          username: account.phone,
          fullName: account.fullName,
          phone: account.phone,
          role: "account",
          roleId: account.roleId,
          ministryId: account.ministryId,
          permissions: account.permissions,
        },
      },
      origin,
    );
    return;
  }

  const token = createAccessToken({
    sub: ADMIN_USERNAME,
    role: "admin",
    permissions: ACCESS_PERMISSIONS.map((permission) => permission.id),
  });

  sendJson(
    response,
    200,
    {
      accessToken: token,
      tokenType: "Bearer",
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      user: {
        username: ADMIN_USERNAME,
        role: "admin",
        permissions: ACCESS_PERMISSIONS.map((permission) => permission.id),
      },
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

  const startDate = requiredText(body.startDate || body.date, "startDate", 32);
  const endDate = requiredText(body.endDate || body.startDate || body.date, "endDate", 32);
  const registrationDeadline = requiredText(
    body.registrationDeadline || body.registrationCloseDate || body.date,
    "registrationDeadline",
    32,
  );
  const peopleLimit = Number(body.peopleLimit);

  validateDate(startDate, "startDate");
  validateDate(endDate, "endDate");
  validateDate(registrationDeadline, "registrationDeadline");

  if (Date.parse(`${endDate}T00:00:00Z`) < Date.parse(`${startDate}T00:00:00Z`)) {
    throw httpError(400, "endDate must be later than or equal to startDate.");
  }

  if (Date.parse(`${registrationDeadline}T00:00:00Z`) > Date.parse(`${startDate}T00:00:00Z`)) {
    throw httpError(400, "registrationDeadline must be earlier than or equal to startDate.");
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
    date: startDate,
    registrationDeadline,
    startDate,
    endDate,
    peopleLimit,
    restrictions: requiredText(body.restrictions, "restrictions", 1000),
    cost: requiredText(body.cost, "cost", 160),
    note: optionalText(body.note, 1000),
    status: existingTrip?.status || "Набор открыт",
    createdAt: existingTrip?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function validateDate(value, fieldName) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw httpError(400, `${fieldName} must use YYYY-MM-DD format.`);
  }
}

function buildParticipant(body, tripId) {
  const fullName = requiredText(body.fullName, "fullName", 180);
  const cityName = requiredText(body.cityName, "cityName", 160);
  const phone = normalizePhone(requiredText(body.phone, "phone", 32));
  const email = requiredEmail(body.email);
  const availableDays = Number(body.availableDays);

  if (!Number.isInteger(availableDays) || availableDays < 1 || availableDays > 365) {
    throw httpError(400, "availableDays must be a positive integer.");
  }

  return {
    id: randomUUID(),
    tripId,
    fullName,
    cityName,
    availableDays,
    phone,
    email,
    donation: optionalText(body.donation, 160),
    status: "Согласился",
    createdAt: new Date().toISOString(),
  };
}

function normalizePhone(value) {
  const digits = value.replace(/\D/g, "");

  if (digits.length !== 11 || digits[0] !== "7") {
    throw httpError(400, "phone must be a Kazakhstan number starting with +7.");
  }

  return `+7 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7, 9)}-${digits.slice(9, 11)}`;
}

function requiredEmail(value) {
  const email = requiredText(value, "email", 180).toLowerCase();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw httpError(400, "email must be valid.");
  }

  return email;
}

function buildMinistry(body, existingMinistry = null) {
  return {
    id: existingMinistry?.id || randomUUID(),
    name: requiredText(body.name, "name", 120),
    description: optionalText(body.description, 800),
    createdAt: existingMinistry?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function buildAccessRole(body, ministries, existingRole = null) {
  const ministryId = requiredText(body.ministryId, "ministryId", 80);

  if (!ministries.some((ministry) => ministry.id === ministryId)) {
    throw httpError(400, "Unknown ministry.");
  }

  const permissions = Array.isArray(body.permissions)
    ? [...new Set(body.permissions.filter((permission) => typeof permission === "string"))]
    : [];

  if (!permissions.length) {
    throw httpError(400, "permissions are required.");
  }

  for (const permission of permissions) {
    if (!ACCESS_PERMISSION_IDS.has(permission)) {
      throw httpError(400, `Unknown permission: ${permission}.`);
    }
  }

  for (const permission of Array.from(permissions)) {
    const [resource, action] = permission.split(":");
    const viewPermission = `${resource}:view`;

    if (action !== "view" && ACCESS_PERMISSION_IDS.has(viewPermission)) {
      permissions.push(viewPermission);
    }
  }

  return {
    id: existingRole?.id || randomUUID(),
    name: requiredText(body.name, "name", 120),
    ministryId,
    permissions: [...new Set(permissions)],
    createdAt: existingRole?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

async function buildStaffAccount(body, { ministries, roles }, existingAccount = null) {
  const ministryId = requiredText(body.ministryId, "ministryId", 80);
  const roleId = requiredText(body.roleId, "roleId", 80);
  const role = roles.find((item) => item.id === roleId);

  if (!ministries.some((ministry) => ministry.id === ministryId)) {
    throw httpError(400, "Unknown ministry.");
  }

  if (!role) {
    throw httpError(400, "Unknown role.");
  }

  if (role.ministryId !== ministryId) {
    throw httpError(400, "role must belong to selected ministry.");
  }

  const phone = normalizeAccountPhone(requiredText(body.phone, "phone", 32));
  const password = typeof body.password === "string" ? body.password : "";
  let passwordSalt = existingAccount?.passwordSalt || "";
  let passwordHash = existingAccount?.passwordHash || "";

  if (!existingAccount || password) {
    if (password.length < 6 || password.length > 100) {
      throw httpError(400, "password must contain from 6 to 100 characters.");
    }

    const passwordData = await hashPassword(password);
    passwordSalt = passwordData.salt;
    passwordHash = passwordData.hash;
  }

  return {
    id: existingAccount?.id || randomUUID(),
    fullName: requiredText(body.fullName, "fullName", 180),
    phone,
    passwordSalt,
    passwordHash,
    ministryId,
    roleId,
    createdAt: existingAccount?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function normalizeAccountPhone(value) {
  const text = value.trim();
  const digits = text.replace(/\D/g, "");
  let normalizedDigits = digits;

  if (!digits) {
    throw httpError(400, "Телефон должен содержать цифры.");
  }

  if (digits.length === 10) {
    normalizedDigits = `7${digits}`;
  } else if (digits.length === 11 && digits[0] === "8") {
    normalizedDigits = `7${digits.slice(1)}`;
  }

  if (normalizedDigits.length === 11 && normalizedDigits[0] === "7") {
    return `+7 (${normalizedDigits.slice(1, 4)}) ${normalizedDigits.slice(4, 7)}-${normalizedDigits.slice(7, 9)}-${normalizedDigits.slice(9, 11)}`;
  }

  if (digits.length < 4 || digits.length > 15) {
    throw httpError(400, "Телефон должен содержать от 4 до 15 цифр.");
  }

  return digits;
}

function getDashboardMetrics(trips) {
  const peopleLimit = trips.reduce((total, trip) => total + Number(trip.peopleLimit || 0), 0);
  const participantsCount = trips.reduce(
    (total, trip) => total + Number(trip.participantsCount ?? trip.participants?.length ?? 0),
    0,
  );

  return [
    { id: "trips", label: "Активные поездки", value: String(trips.length) },
    { id: "requests", label: "Новые заявки", value: String(participantsCount) },
    { id: "members", label: "Места", value: String(peopleLimit) },
    { id: "reports", label: "Черновики отчетов", value: "0" },
  ];
}

function toTripListItem(trip) {
  const participantsCount = Number(trip.participantsCount ?? trip.participants?.length ?? 0);

  return {
    id: trip.id,
    countryCode: trip.countryCode,
    countryName: trip.countryName,
    cityName: trip.cityName,
    date: trip.startDate || trip.date,
    registrationDeadline: trip.registrationDeadline || trip.date,
    startDate: trip.startDate || trip.date,
    endDate: trip.endDate || trip.startDate || trip.date,
    peopleLimit: trip.peopleLimit,
    participantsCount,
    availableSpots: Math.max(Number(trip.peopleLimit || 0) - participantsCount, 0),
    cost: trip.cost,
    status: trip.status,
  };
}

function toPublicTrip(trip) {
  const participantsCount = Number(trip.participantsCount || trip.participants?.length || 0);

  return {
    id: trip.id,
    countryCode: trip.countryCode,
    countryName: trip.countryName,
    cityName: trip.cityName,
    description: trip.description,
    date: trip.startDate || trip.date,
    registrationDeadline: trip.registrationDeadline || trip.date,
    startDate: trip.startDate || trip.date,
    endDate: trip.endDate || trip.startDate || trip.date,
    peopleLimit: trip.peopleLimit,
    participantsCount,
    availableSpots: Math.max(Number(trip.peopleLimit || 0) - participantsCount, 0),
    restrictions: trip.restrictions,
    cost: trip.cost,
    note: trip.note || "",
    status: trip.status,
    participants: (trip.participants || []).map(toPublicParticipant),
  };
}

function toPublicParticipant(participant) {
  return {
    id: participant.id,
    fullName: participant.fullName,
    cityName: participant.cityName,
    status: participant.status,
  };
}

function isRegistrationClosed(value) {
  if (!value) {
    return false;
  }

  const deadline = Date.parse(`${String(value).slice(0, 10)}T23:59:59Z`);

  if (Number.isNaN(deadline)) {
    return false;
  }

  return Date.now() > deadline;
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

async function getAccessControlSummary(user) {
  const [ministries, roles, accounts] = await Promise.all([
    readMinistries(),
    readAccessRoles(),
    readStaffAccounts(),
  ]);
  const canUseAccounts = canUseAccessResource(user, "accounts");
  const canUseMinistries = canUseAccessResource(user, "ministries");
  const canUseRoles = canUseAccessResource(user, "roles");

  return {
    accounts: canUseAccounts ? accounts : [],
    ministries: canUseMinistries || canUseAccounts || canUseRoles ? ministries : [],
    roles: canUseRoles || canUseAccounts ? roles : [],
    accessOptions: canUseRoles || canUseAccounts ? ACCESS_PERMISSIONS : [],
  };
}

function canUseAccessResource(user, resource) {
  return hasAnyUserPermission(
    user,
    ACCESS_PERMISSIONS.filter((permission) => permission.resource === resource).map((permission) => permission.id),
  );
}

async function readAccessControl() {
  if (!existsSync(ACCESS_CONTROL_DATA_FILE)) {
    return { ministries: [], roles: [], accounts: [] };
  }

  const content = readFileSync(ACCESS_CONTROL_DATA_FILE, "utf8");
  const parsed = JSON.parse(content);

  return {
    ministries: Array.isArray(parsed.ministries) ? parsed.ministries : [],
    roles: Array.isArray(parsed.roles) ? parsed.roles : [],
    accounts: Array.isArray(parsed.accounts) ? parsed.accounts : [],
  };
}

async function readMinistries() {
  if (databasePool) {
    await ensureDatabase();
    const result = await databasePool.query(`
      SELECT id, name, description, created_at, updated_at
      FROM ministries
      ORDER BY created_at DESC
    `);

    return result.rows.map(rowToMinistry);
  }

  const accessControl = await readAccessControl();
  return accessControl.ministries;
}

async function getMinistryRecord(id) {
  if (databasePool) {
    await ensureDatabase();
    const result = await databasePool.query(
      `
        SELECT id, name, description, created_at, updated_at
        FROM ministries
        WHERE id = $1
      `,
      [id],
    );

    return result.rows[0] ? rowToMinistry(result.rows[0]) : null;
  }

  return (await readMinistries()).find((ministry) => ministry.id === id) || null;
}

async function createMinistryRecord(ministry) {
  if (databasePool) {
    await ensureDatabase();
    await databasePool.query(
      `
        INSERT INTO ministries (id, name, description, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5)
      `,
      [ministry.id, ministry.name, ministry.description, ministry.createdAt, ministry.updatedAt],
    );
    return;
  }

  const accessControl = await readAccessControl();
  accessControl.ministries.unshift(ministry);
  writeAccessControlFile(accessControl);
}

async function updateMinistryRecord(ministry) {
  if (databasePool) {
    await ensureDatabase();
    await databasePool.query(
      `
        UPDATE ministries
        SET name = $2, description = $3, updated_at = $4
        WHERE id = $1
      `,
      [ministry.id, ministry.name, ministry.description, ministry.updatedAt],
    );
    return;
  }

  const accessControl = await readAccessControl();
  accessControl.ministries = accessControl.ministries.map((item) =>
    item.id === ministry.id ? ministry : item,
  );
  writeAccessControlFile(accessControl);
}

async function deleteMinistryRecord(id) {
  if (databasePool) {
    await ensureDatabase();
    const result = await databasePool.query("DELETE FROM ministries WHERE id = $1", [id]);
    return result.rowCount > 0;
  }

  const accessControl = await readAccessControl();
  const nextMinistries = accessControl.ministries.filter((ministry) => ministry.id !== id);

  if (nextMinistries.length === accessControl.ministries.length) {
    return false;
  }

  accessControl.ministries = nextMinistries;
  accessControl.roles = accessControl.roles.filter((role) => role.ministryId !== id);
  accessControl.accounts = accessControl.accounts.filter((account) => account.ministryId !== id);
  writeAccessControlFile(accessControl);
  return true;
}

async function readAccessRoles() {
  if (databasePool) {
    await ensureDatabase();
    const result = await databasePool.query(`
      SELECT
        access_roles.id,
        access_roles.name,
        access_roles.ministry_id,
        ministries.name AS ministry_name,
        access_roles.permissions,
        access_roles.created_at,
        access_roles.updated_at
      FROM access_roles
      LEFT JOIN ministries ON ministries.id = access_roles.ministry_id
      ORDER BY access_roles.created_at DESC
    `);

    return result.rows.map(rowToAccessRole);
  }

  const accessControl = await readAccessControl();
  const ministries = accessControl.ministries;

  return accessControl.roles.map((role) => ({
    ...role,
    ministryName: ministries.find((ministry) => ministry.id === role.ministryId)?.name || "",
    permissions: normalizePermissions(role.permissions),
  }));
}

async function getAccessRoleRecord(id) {
  if (databasePool) {
    await ensureDatabase();
    const result = await databasePool.query(
      `
        SELECT
          access_roles.id,
          access_roles.name,
          access_roles.ministry_id,
          ministries.name AS ministry_name,
          access_roles.permissions,
          access_roles.created_at,
          access_roles.updated_at
        FROM access_roles
        LEFT JOIN ministries ON ministries.id = access_roles.ministry_id
        WHERE access_roles.id = $1
      `,
      [id],
    );

    return result.rows[0] ? rowToAccessRole(result.rows[0]) : null;
  }

  return (await readAccessRoles()).find((role) => role.id === id) || null;
}

async function createAccessRoleRecord(role) {
  if (databasePool) {
    await ensureDatabase();
    await databasePool.query(
      `
        INSERT INTO access_roles (id, name, ministry_id, permissions, created_at, updated_at)
        VALUES ($1, $2, $3, $4::jsonb, $5, $6)
      `,
      [
        role.id,
        role.name,
        role.ministryId,
        JSON.stringify(role.permissions),
        role.createdAt,
        role.updatedAt,
      ],
    );
    return;
  }

  const accessControl = await readAccessControl();
  accessControl.roles.unshift(role);
  writeAccessControlFile(accessControl);
}

async function updateAccessRoleRecord(role) {
  if (databasePool) {
    await ensureDatabase();
    await databasePool.query(
      `
        UPDATE access_roles
        SET name = $2, ministry_id = $3, permissions = $4::jsonb, updated_at = $5
        WHERE id = $1
      `,
      [role.id, role.name, role.ministryId, JSON.stringify(role.permissions), role.updatedAt],
    );
    return;
  }

  const accessControl = await readAccessControl();
  accessControl.roles = accessControl.roles.map((item) => (item.id === role.id ? role : item));
  writeAccessControlFile(accessControl);
}

async function deleteAccessRoleRecord(id) {
  if (databasePool) {
    await ensureDatabase();
    const result = await databasePool.query("DELETE FROM access_roles WHERE id = $1", [id]);
    return result.rowCount > 0;
  }

  const accessControl = await readAccessControl();
  const nextRoles = accessControl.roles.filter((role) => role.id !== id);

  if (nextRoles.length === accessControl.roles.length) {
    return false;
  }

  accessControl.roles = nextRoles;
  accessControl.accounts = accessControl.accounts.map((account) =>
    account.roleId === id ? { ...account, roleId: "" } : account,
  );
  writeAccessControlFile(accessControl);
  return true;
}

async function readStaffAccounts() {
  if (databasePool) {
    await ensureDatabase();
    const result = await databasePool.query(`
      SELECT
        staff_accounts.id,
        staff_accounts.full_name,
        staff_accounts.phone,
        staff_accounts.ministry_id,
        ministries.name AS ministry_name,
        staff_accounts.role_id,
        access_roles.name AS role_name,
        staff_accounts.created_at,
        staff_accounts.updated_at
      FROM staff_accounts
      LEFT JOIN ministries ON ministries.id = staff_accounts.ministry_id
      LEFT JOIN access_roles ON access_roles.id = staff_accounts.role_id
      ORDER BY staff_accounts.created_at DESC
    `);

    return result.rows.map(rowToStaffAccount);
  }

  const accessControl = await readAccessControl();
  const ministries = accessControl.ministries;
  const roles = accessControl.roles;

  return accessControl.accounts.map((account) =>
    toPublicStaffAccount(account, ministries, roles),
  );
}

async function getStaffAccountRecord(id) {
  return (await readStaffAccounts()).find((account) => account.id === id) || null;
}

async function getRawStaffAccountRecord(id) {
  if (databasePool) {
    await ensureDatabase();
    const result = await databasePool.query(
      `
        SELECT
          id,
          full_name,
          phone,
          password_salt,
          password_hash,
          ministry_id,
          role_id,
          created_at,
          updated_at
        FROM staff_accounts
        WHERE id = $1
      `,
      [id],
    );

    return result.rows[0] ? rowToRawStaffAccount(result.rows[0]) : null;
  }

  const accessControl = await readAccessControl();
  return accessControl.accounts.find((account) => account.id === id) || null;
}

async function getRawStaffAccountByPhone(phone) {
  if (databasePool) {
    await ensureDatabase();
    const result = await databasePool.query(
      `
        SELECT
          staff_accounts.id,
          staff_accounts.full_name,
          staff_accounts.phone,
          staff_accounts.password_salt,
          staff_accounts.password_hash,
          staff_accounts.ministry_id,
          staff_accounts.role_id,
          staff_accounts.created_at,
          staff_accounts.updated_at,
          access_roles.permissions
        FROM staff_accounts
        LEFT JOIN access_roles ON access_roles.id = staff_accounts.role_id
        WHERE staff_accounts.phone = $1
      `,
      [phone],
    );

    return result.rows[0] ? rowToRawStaffAccount(result.rows[0]) : null;
  }

  const accessControl = await readAccessControl();
  const account = accessControl.accounts.find((item) => item.phone === phone) || null;
  const role = account ? accessControl.roles.find((item) => item.id === account.roleId) : null;

  return account ? { ...account, permissions: normalizePermissions(role?.permissions) } : null;
}

async function createStaffAccountRecord(account) {
  await ensureUniqueStaffPhone(account.phone);

  if (databasePool) {
    await ensureDatabase();
    await databasePool.query(
      `
        INSERT INTO staff_accounts (
          id,
          full_name,
          phone,
          password_salt,
          password_hash,
          ministry_id,
          role_id,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `,
      [
        account.id,
        account.fullName,
        account.phone,
        account.passwordSalt,
        account.passwordHash,
        account.ministryId,
        account.roleId || null,
        account.createdAt,
        account.updatedAt,
      ],
    );
    return;
  }

  const accessControl = await readAccessControl();
  accessControl.accounts.unshift(account);
  writeAccessControlFile(accessControl);
}

async function updateStaffAccountRecord(account) {
  await ensureUniqueStaffPhone(account.phone, account.id);

  if (databasePool) {
    await ensureDatabase();
    await databasePool.query(
      `
        UPDATE staff_accounts
        SET
          full_name = $2,
          phone = $3,
          password_salt = $4,
          password_hash = $5,
          ministry_id = $6,
          role_id = $7,
          updated_at = $8
        WHERE id = $1
      `,
      [
        account.id,
        account.fullName,
        account.phone,
        account.passwordSalt,
        account.passwordHash,
        account.ministryId,
        account.roleId || null,
        account.updatedAt,
      ],
    );
    return;
  }

  const accessControl = await readAccessControl();
  accessControl.accounts = accessControl.accounts.map((item) =>
    item.id === account.id ? account : item,
  );
  writeAccessControlFile(accessControl);
}

async function deleteStaffAccountRecord(id) {
  if (databasePool) {
    await ensureDatabase();
    const result = await databasePool.query("DELETE FROM staff_accounts WHERE id = $1", [id]);
    return result.rowCount > 0;
  }

  const accessControl = await readAccessControl();
  const nextAccounts = accessControl.accounts.filter((account) => account.id !== id);

  if (nextAccounts.length === accessControl.accounts.length) {
    return false;
  }

  accessControl.accounts = nextAccounts;
  writeAccessControlFile(accessControl);
  return true;
}

async function ensureUniqueStaffPhone(phone, accountId = "") {
  if (databasePool) {
    await ensureDatabase();
    const result = await databasePool.query(
      "SELECT id FROM staff_accounts WHERE phone = $1 AND id <> $2",
      [phone, accountId || ""],
    );

    if (result.rows[0]) {
      throw httpError(409, "phone is already used.");
    }

    return;
  }

  const accessControl = await readAccessControl();
  const isUsed = accessControl.accounts.some(
    (account) => account.phone === phone && account.id !== accountId,
  );

  if (isUsed) {
    throw httpError(409, "phone is already used.");
  }
}

async function readTrips() {
  if (databasePool) {
    await ensureDatabase();
    const result = await databasePool.query(`
      SELECT
        trips.id,
        trips.country_code,
        trips.country_name,
        trips.city_name,
        trips.description,
        trips.trip_date,
        trips.registration_deadline,
        trips.start_date,
        trips.end_date,
        trips.people_limit,
        trips.restrictions,
        trips.cost,
        trips.note,
        trips.status,
        trips.created_at,
        trips.updated_at,
        COALESCE(participant_counts.participants_count, 0) AS participants_count
      FROM trips
      LEFT JOIN (
        SELECT trip_id, COUNT(*)::int AS participants_count
        FROM trip_participants
        GROUP BY trip_id
      ) participant_counts ON participant_counts.trip_id = trips.id
      ORDER BY trips.created_at DESC
    `);

    return result.rows.map(rowToTrip);
  }

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

async function getPublicTrips() {
  if (databasePool) {
    await ensureDatabase();
    const result = await databasePool.query(`
      SELECT
        trips.id,
        trips.country_code,
        trips.country_name,
        trips.city_name,
        trips.description,
        trips.trip_date,
        trips.registration_deadline,
        trips.start_date,
        trips.end_date,
        trips.people_limit,
        trips.restrictions,
        trips.cost,
        trips.note,
        trips.status,
        trips.created_at,
        trips.updated_at,
        COALESCE(participant_counts.participants_count, 0) AS participants_count
      FROM trips
      LEFT JOIN (
        SELECT trip_id, COUNT(*)::int AS participants_count
        FROM trip_participants
        GROUP BY trip_id
      ) participant_counts ON participant_counts.trip_id = trips.id
      ORDER BY trips.created_at DESC
    `);

    return result.rows.map((row) => toPublicTrip(rowToTrip(row)));
  }

  return (await readTrips()).map((trip) => toPublicTrip(trip));
}

async function getPublicTripRecord(id) {
  const trip = await getTripRecord(id);

  if (!trip) {
    return null;
  }

  return toPublicTrip({
    ...trip,
    participants: (trip.participants || []).map((participant) => ({
      id: participant.id,
      fullName: participant.fullName,
      cityName: participant.cityName,
      status: participant.status,
    })),
  });
}

async function getTripRecord(id) {
  if (databasePool) {
    await ensureDatabase();
    const result = await databasePool.query(
      `
        SELECT
          id,
          country_code,
          country_name,
          city_name,
          description,
          trip_date,
          registration_deadline,
          start_date,
          end_date,
          people_limit,
          restrictions,
          cost,
          note,
          status,
          created_at,
          updated_at
        FROM trips
        WHERE id = $1
      `,
      [id],
    );

    if (!result.rows[0]) {
      return null;
    }

    const trip = rowToTrip(result.rows[0]);
    trip.participants = await getTripParticipants(id);

    return trip;
  }

  const trip = (await readTrips()).find((item) => item.id === id) || null;
  return trip ? { ...trip, participants: trip.participants || [] } : null;
}

async function createTripParticipant(participant) {
  if (databasePool) {
    await ensureDatabase();
    await databasePool.query(
      `
        INSERT INTO trip_participants (
          id,
          trip_id,
          full_name,
          city_name,
          available_days,
          phone,
          email,
          donation,
          status,
          created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `,
      [
        participant.id,
        participant.tripId,
        participant.fullName,
        participant.cityName,
        participant.availableDays,
        participant.phone,
        participant.email,
        participant.donation,
        participant.status,
        participant.createdAt,
      ],
    );
    return;
  }

  const trips = await readTrips();
  const nextTrips = trips.map((trip) => {
    if (trip.id !== participant.tripId) {
      return trip;
    }

    return {
      ...trip,
      participants: [...(trip.participants || []), participant],
    };
  });

  writeTripsFile(nextTrips);
}

async function createTripRecord(trip) {
  if (databasePool) {
    await ensureDatabase();
    await databasePool.query(
      `
        INSERT INTO trips (
          id,
          country_code,
          country_name,
          city_name,
          description,
          trip_date,
          registration_deadline,
          start_date,
          end_date,
          people_limit,
          restrictions,
          cost,
          note,
          status,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      `,
      [
        trip.id,
        trip.countryCode,
        trip.countryName,
        trip.cityName,
        trip.description,
        trip.date,
        trip.registrationDeadline,
        trip.startDate,
        trip.endDate,
        trip.peopleLimit,
        trip.restrictions,
        trip.cost,
        trip.note,
        trip.status,
        trip.createdAt,
        trip.updatedAt,
      ],
    );
    return;
  }

  const trips = await readTrips();
  trips.unshift(trip);
  writeTripsFile(trips);
}

async function updateTripRecord(trip) {
  if (databasePool) {
    await ensureDatabase();
    await databasePool.query(
      `
        UPDATE trips
        SET
          country_code = $2,
          country_name = $3,
          city_name = $4,
          description = $5,
          trip_date = $6,
          registration_deadline = $7,
          start_date = $8,
          end_date = $9,
          people_limit = $10,
          restrictions = $11,
          cost = $12,
          note = $13,
          status = $14,
          updated_at = $15
        WHERE id = $1
      `,
      [
        trip.id,
        trip.countryCode,
        trip.countryName,
        trip.cityName,
        trip.description,
        trip.date,
        trip.registrationDeadline,
        trip.startDate,
        trip.endDate,
        trip.peopleLimit,
        trip.restrictions,
        trip.cost,
        trip.note,
        trip.status,
        trip.updatedAt,
      ],
    );
    return;
  }

  const trips = await readTrips();
  const nextTrips = trips.map((item) => (item.id === trip.id ? trip : item));
  writeTripsFile(nextTrips);
}

async function deleteTripRecord(id) {
  if (databasePool) {
    await ensureDatabase();
    const result = await databasePool.query("DELETE FROM trips WHERE id = $1", [id]);
    return result.rowCount > 0;
  }

  const trips = await readTrips();
  const nextTrips = trips.filter((item) => item.id !== id);

  if (nextTrips.length === trips.length) {
    return false;
  }

  writeTripsFile(nextTrips);
  return true;
}

async function deleteTripParticipantRecord(tripId, participantId) {
  if (databasePool) {
    await ensureDatabase();
    const result = await databasePool.query(
      "DELETE FROM trip_participants WHERE trip_id = $1 AND id = $2",
      [tripId, participantId],
    );

    return result.rowCount > 0;
  }

  const trips = await readTrips();
  let isDeleted = false;
  const nextTrips = trips.map((trip) => {
    if (trip.id !== tripId) {
      return trip;
    }

    const participants = trip.participants || [];
    const nextParticipants = participants.filter((participant) => participant.id !== participantId);

    if (nextParticipants.length === participants.length) {
      return trip;
    }

    isDeleted = true;

    return {
      ...trip,
      participants: nextParticipants,
    };
  });

  if (!isDeleted) {
    return false;
  }

  writeTripsFile(nextTrips);
  return true;
}

async function getTripParticipants(tripId) {
  if (!databasePool) {
    return [];
  }

  const result = await databasePool.query(
    `
      SELECT id, full_name, city_name, available_days, phone, email, donation, status, created_at
      FROM trip_participants
      WHERE trip_id = $1
      ORDER BY created_at DESC
    `,
    [tripId],
  );

  return result.rows.map((row) => ({
    id: row.id,
    fullName: row.full_name,
    cityName: row.city_name || "",
    availableDays: Number(row.available_days || 0),
    phone: row.phone || "",
    email: row.email || "",
    donation: row.donation || "",
    status: row.status,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : "",
  }));
}

async function ensureDatabase() {
  if (!databasePool) {
    return;
  }

  if (!databaseReadyPromise) {
    databaseReadyPromise = migrateDatabase();
  }

  await databaseReadyPromise;
}

async function migrateDatabase() {
  await databasePool.query(`
    CREATE TABLE IF NOT EXISTS trips (
      id TEXT PRIMARY KEY,
      country_code TEXT NOT NULL,
      country_name TEXT NOT NULL,
      city_name TEXT NOT NULL,
      description TEXT NOT NULL,
      trip_date DATE NOT NULL,
      registration_deadline DATE,
      start_date DATE,
      end_date DATE,
      people_limit INTEGER NOT NULL,
      restrictions TEXT NOT NULL,
      cost TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await databasePool.query("ALTER TABLE trips ADD COLUMN IF NOT EXISTS registration_deadline DATE");
  await databasePool.query("ALTER TABLE trips ADD COLUMN IF NOT EXISTS start_date DATE");
  await databasePool.query("ALTER TABLE trips ADD COLUMN IF NOT EXISTS end_date DATE");
  await databasePool.query(`
    UPDATE trips
    SET
      registration_deadline = COALESCE(registration_deadline, trip_date),
      start_date = COALESCE(start_date, trip_date),
      end_date = COALESCE(end_date, trip_date)
    WHERE registration_deadline IS NULL OR start_date IS NULL OR end_date IS NULL
  `);
  await databasePool.query("ALTER TABLE trips ALTER COLUMN registration_deadline SET NOT NULL");
  await databasePool.query("ALTER TABLE trips ALTER COLUMN start_date SET NOT NULL");
  await databasePool.query("ALTER TABLE trips ALTER COLUMN end_date SET NOT NULL");

  await databasePool.query(`
    CREATE TABLE IF NOT EXISTS trip_participants (
      id TEXT PRIMARY KEY,
      trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
      full_name TEXT NOT NULL,
      city_name TEXT NOT NULL DEFAULT '',
      available_days INTEGER NOT NULL DEFAULT 1,
      phone TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      donation TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'accepted',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await databasePool.query("ALTER TABLE trip_participants ADD COLUMN IF NOT EXISTS city_name TEXT NOT NULL DEFAULT ''");
  await databasePool.query("ALTER TABLE trip_participants ADD COLUMN IF NOT EXISTS available_days INTEGER NOT NULL DEFAULT 1");
  await databasePool.query("ALTER TABLE trip_participants ADD COLUMN IF NOT EXISTS donation TEXT NOT NULL DEFAULT ''");

  await databasePool.query(`
    CREATE TABLE IF NOT EXISTS ministries (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await databasePool.query(`
    CREATE TABLE IF NOT EXISTS access_roles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      ministry_id TEXT REFERENCES ministries(id) ON DELETE CASCADE,
      permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await databasePool.query(`
    CREATE TABLE IF NOT EXISTS staff_accounts (
      id TEXT PRIMARY KEY,
      full_name TEXT NOT NULL,
      phone TEXT NOT NULL UNIQUE,
      password_salt TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      ministry_id TEXT REFERENCES ministries(id) ON DELETE CASCADE,
      role_id TEXT REFERENCES access_roles(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await databasePool.query("ALTER TABLE access_roles ADD COLUMN IF NOT EXISTS permissions JSONB NOT NULL DEFAULT '[]'::jsonb");
  await databasePool.query("ALTER TABLE staff_accounts ADD COLUMN IF NOT EXISTS role_id TEXT REFERENCES access_roles(id) ON DELETE SET NULL");
}

function rowToTrip(row) {
  const participantsCount =
    row.participants_count === undefined ? undefined : Number(row.participants_count || 0);

  return {
    id: row.id,
    countryCode: row.country_code,
    countryName: row.country_name,
    cityName: row.city_name,
    description: row.description,
    date: formatDateOnly(row.start_date || row.trip_date),
    registrationDeadline: formatDateOnly(row.registration_deadline || row.trip_date),
    startDate: formatDateOnly(row.start_date || row.trip_date),
    endDate: formatDateOnly(row.end_date || row.start_date || row.trip_date),
    peopleLimit: Number(row.people_limit),
    participantsCount,
    availableSpots:
      participantsCount === undefined ? undefined : Math.max(Number(row.people_limit || 0) - participantsCount, 0),
    restrictions: row.restrictions,
    cost: row.cost,
    note: row.note || "",
    status: row.status,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : "",
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : "",
  };
}

function rowToMinistry(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description || "",
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : "",
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : "",
  };
}

function rowToAccessRole(row) {
  return {
    id: row.id,
    name: row.name,
    ministryId: row.ministry_id || "",
    ministryName: row.ministry_name || "",
    permissions: normalizePermissions(row.permissions),
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : "",
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : "",
  };
}

function rowToStaffAccount(row) {
  return {
    id: row.id,
    fullName: row.full_name,
    phone: row.phone,
    ministryId: row.ministry_id || "",
    ministryName: row.ministry_name || "",
    roleId: row.role_id || "",
    roleName: row.role_name || "",
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : "",
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : "",
  };
}

function rowToRawStaffAccount(row) {
  return {
    id: row.id,
    fullName: row.full_name,
    phone: row.phone,
    passwordSalt: row.password_salt,
    passwordHash: row.password_hash,
    ministryId: row.ministry_id || "",
    roleId: row.role_id || "",
    permissions: normalizePermissions(row.permissions),
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : "",
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : "",
  };
}

function toPublicStaffAccount(account, ministries, roles) {
  const ministry = ministries.find((item) => item.id === account.ministryId);
  const role = roles.find((item) => item.id === account.roleId);

  return {
    id: account.id,
    fullName: account.fullName,
    phone: account.phone,
    ministryId: account.ministryId || "",
    ministryName: ministry?.name || "",
    roleId: account.roleId || "",
    roleName: role?.name || "",
    createdAt: account.createdAt || "",
    updatedAt: account.updatedAt || "",
  };
}

function normalizePermissions(value) {
  const collectPermission = (permission) => {
    if (typeof permission !== "string") {
      return [];
    }

    if (ACCESS_PERMISSION_IDS.has(permission)) {
      return [permission];
    }

    return LEGACY_PERMISSION_MAP[permission] || [];
  };

  if (Array.isArray(value)) {
    return [...new Set(value.flatMap(collectPermission))];
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return normalizePermissions(parsed);
    } catch {
      return [];
    }
  }

  return [];
}

function formatDateOnly(value) {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return String(value).slice(0, 10);
}

function writeTripsFile(trips) {
  mkdirSync(dirname(TRIPS_DATA_FILE), { recursive: true });
  writeFileSync(TRIPS_DATA_FILE, JSON.stringify(trips, null, 2), "utf8");
}

function writeAccessControlFile(accessControl) {
  mkdirSync(dirname(ACCESS_CONTROL_DATA_FILE), { recursive: true });
  writeFileSync(ACCESS_CONTROL_DATA_FILE, JSON.stringify(accessControl, null, 2), "utf8");
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
  return verifyPasswordHash(password, ADMIN_PASSWORD_SALT, ADMIN_PASSWORD_HASH);
}

async function authenticateStaffAccount(username, password) {
  if (!username || !password) {
    return null;
  }

  let phone = "";

  try {
    phone = normalizeAccountPhone(username);
  } catch {
    return null;
  }

  const account = await getRawStaffAccountByPhone(phone);

  if (!account || !(await verifyPasswordHash(password, account.passwordSalt, account.passwordHash))) {
    return null;
  }

  return {
    id: account.id,
    fullName: account.fullName,
    phone: account.phone,
    ministryId: account.ministryId,
    roleId: account.roleId,
    permissions: normalizePermissions(account.permissions),
  };
}

async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = await scrypt(password, salt, 64);

  return {
    salt,
    hash: hash.toString("hex"),
  };
}

async function verifyPasswordHash(password, salt, hash) {
  const candidateHash = await scrypt(password, salt, 64);
  const storedHash = Buffer.from(hash, "hex");

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
    if (!payload || payload.role !== "account" || !payload.accountId) {
      return null;
    }

    return {
      id: payload.accountId,
      username: payload.phone,
      role: "account",
      ministryId: payload.ministryId,
      roleId: payload.roleId,
      permissions: normalizePermissions(payload.permissions),
    };
  }

  return {
    username: payload.sub,
    role: payload.role,
    permissions: normalizePermissions(payload.permissions),
  };
}

async function authorizeRequest(request, response, origin, permissions = []) {
  const user = await hydrateAuthenticatedUser(authenticateAdmin(request));

  if (!user) {
    sendJson(response, 401, { message: "Unauthorized." }, origin);
    return null;
  }

  const requiredPermissions = Array.isArray(permissions) ? permissions : [permissions];

  if (requiredPermissions.length && !hasAnyUserPermission(user, requiredPermissions)) {
    sendJson(response, 403, { message: "Forbidden." }, origin);
    return null;
  }

  return user;
}

async function hydrateAuthenticatedUser(user) {
  if (!user || user.role !== "account" || !user.id) {
    return user;
  }

  const account = await getRawStaffAccountRecord(user.id);

  if (!account) {
    return null;
  }

  const roles = await readAccessRoles();
  const role = roles.find((item) => item.id === account.roleId);

  return {
    ...user,
    username: account.phone,
    fullName: account.fullName,
    phone: account.phone,
    ministryId: account.ministryId,
    roleId: account.roleId,
    permissions: normalizePermissions(role?.permissions),
  };
}

function hasUserPermission(user, permission) {
  return user?.role === "admin" || normalizePermissions(user?.permissions).includes(permission);
}

function hasAnyUserPermission(user, permissions) {
  return user?.role === "admin" || permissions.some((permission) => hasUserPermission(user, permission));
}

function stripParticipantsWithoutPermission(trip, user) {
  if (hasUserPermission(user, "participants:view")) {
    return trip;
  }

  return {
    ...trip,
    participants: [],
  };
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
    (process.env.CORS_ORIGIN ||
      "https://nazarene-church-kz.vercel.app,https://astananazchurch-astana.github.io")
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
