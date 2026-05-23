const LEGACY_ADMIN_AUTH_KEY = "missionary-trips-admin-auth";
const ACCESS_TOKEN_KEY = "missionary-trips-admin-access-token";
const CURRENT_USER_KEY = "missionary-trips-admin-current-user";

export type CountryOption = {
  code: string;
  name: string;
};

export type CityOption = {
  name: string;
};

export type AdminMetric = {
  id: "trips" | "requests" | "members" | "reports";
  label: string;
  value: string;
};

export type AccessPermission = {
  id: string;
  label: string;
  description: string;
  group: string;
  resource: string;
  resourceLabel: string;
  action: "view" | "create" | "update" | "delete";
  actionLabel: string;
};

export type AuthUser = {
  id?: string;
  username: string;
  fullName?: string;
  phone?: string;
  role: "admin" | "account";
  ministryId?: string;
  roleId?: string;
  permissions: string[];
};

export type MinistryAccess = {
  id: string;
  name: string;
  description: string;
  createdAt?: string;
  updatedAt?: string;
};

export type AccessRole = {
  id: string;
  name: string;
  ministryId: string;
  ministryName?: string;
  permissions: string[];
  createdAt?: string;
  updatedAt?: string;
};

export type StaffAccount = {
  id: string;
  fullName: string;
  phone: string;
  ministryId: string;
  ministryName?: string;
  roleId: string;
  roleName?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type Trip = {
  id: string;
  countryCode: string;
  countryName: string;
  cityName: string;
  description?: string;
  date: string;
  registrationDeadline: string;
  startDate: string;
  endDate: string;
  peopleLimit: number;
  restrictions?: string;
  cost: string;
  note?: string;
  status: string;
  createdAt?: string;
  participantsCount?: number;
  availableSpots?: number;
  participants?: TripParticipant[];
};

export type TripParticipant = {
  id: string;
  fullName: string;
  cityName?: string;
  availableDays?: number;
  phone?: string;
  email?: string;
  donation?: string;
  status: string;
  createdAt?: string;
};

export type PublicTripParticipant = Pick<TripParticipant, "id" | "fullName" | "cityName" | "status">;

export type PublicTrip = Pick<
  Trip,
  | "id"
  | "countryCode"
  | "countryName"
  | "cityName"
  | "description"
  | "date"
  | "registrationDeadline"
  | "startDate"
  | "endDate"
  | "peopleLimit"
  | "participantsCount"
  | "availableSpots"
  | "restrictions"
  | "cost"
  | "note"
  | "status"
> & {
  participants?: PublicTripParticipant[];
};

export type CreateTripInput = {
  countryCode: string;
  cityName: string;
  description: string;
  registrationDeadline: string;
  startDate: string;
  endDate: string;
  peopleLimit: number;
  restrictions: string;
  cost: string;
  note: string;
};

export type TripApplicationInput = {
  fullName: string;
  cityName: string;
  availableDays: number;
  phone: string;
  email: string;
  donation: string;
};

export type DashboardSummary = {
  metrics: AdminMetric[];
  trips: Trip[];
};

export type AccessControlSummary = {
  accounts: StaffAccount[];
  ministries: MinistryAccess[];
  roles: AccessRole[];
  accessOptions: AccessPermission[];
};

export type CreateMinistryInput = {
  name: string;
  description: string;
};

export type CreateAccessRoleInput = {
  name: string;
  ministryId: string;
  permissions: string[];
};

export type CreateStaffAccountInput = {
  fullName: string;
  phone: string;
  password: string;
  ministryId: string;
  roleId: string;
};

export type UpdateStaffAccountInput = Omit<CreateStaffAccountInput, "password"> & {
  password?: string;
};

type LoginResponse = {
  accessToken: string;
  user: AuthUser;
};

type MeResponse = {
  user: AuthUser;
};

type SignInResult = {
  ok: boolean;
  message?: string;
};

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function clearLegacyAuthData() {
  window.localStorage.removeItem(LEGACY_ADMIN_AUTH_KEY);
}

export function hasAccessToken() {
  return Boolean(getAccessToken());
}

export function getCurrentUser() {
  const value = window.sessionStorage.getItem(CURRENT_USER_KEY);

  if (!value) {
    return null;
  }

  try {
    const user = JSON.parse(value) as AuthUser;

    if (!user || !Array.isArray(user.permissions)) {
      return null;
    }

    return user;
  } catch {
    return null;
  }
}

export function hasPermission(user: AuthUser | null | undefined, permission: string) {
  return user?.role === "admin" || Boolean(user?.permissions.includes(permission));
}

export function hasAnyPermission(user: AuthUser | null | undefined, permissions: string[]) {
  return user?.role === "admin" || permissions.some((permission) => hasPermission(user, permission));
}

export async function signInAdmin(username: string, password: string): Promise<SignInResult> {
  try {
    const response = await apiFetch<LoginResponse>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });

    window.sessionStorage.setItem(ACCESS_TOKEN_KEY, response.accessToken);
    setCurrentUser(response.user);

    return { ok: true };
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      return { ok: false, message: "Неверный логин или пароль" };
    }

    return { ok: false, message: "Сервер авторизации недоступен" };
  }
}

export async function verifyAdminSession() {
  if (!getAccessToken()) {
    return null;
  }

  try {
    const response = await apiFetch<MeResponse>("/api/auth/me");
    setCurrentUser(response.user);
    return response.user;
  } catch {
    signOutAdmin();
    return null;
  }
}

export async function fetchCountries() {
  const response = await apiFetch<{ countries: CountryOption[] }>("/api/locations/countries");

  return response.countries;
}

export async function fetchCities(countryCode: string, query: string) {
  const params = new URLSearchParams({ countryCode });

  if (query.trim()) {
    params.set("query", query.trim());
  }

  const response = await apiFetch<{ cities: CityOption[] }>(`/api/locations/cities?${params}`);

  return response.cities;
}

export async function fetchDashboardSummary() {
  const response = await apiFetch<DashboardSummary>("/api/admin/summary");

  return response;
}

export async function fetchAccessControlSummary() {
  const response = await apiFetch<AccessControlSummary>("/api/admin/access-control");

  return response;
}

export async function createMinistry(input: CreateMinistryInput) {
  const response = await apiFetch<{ ministry: MinistryAccess }>("/api/admin/ministries", {
    method: "POST",
    body: JSON.stringify(input),
  });

  return response.ministry;
}

export async function updateMinistry(id: string, input: CreateMinistryInput) {
  const response = await apiFetch<{ ministry: MinistryAccess }>(`/api/admin/ministries/${id}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });

  return response.ministry;
}

export async function deleteMinistry(id: string) {
  await apiFetch<{ ok: boolean }>(`/api/admin/ministries/${id}`, {
    method: "DELETE",
  });
}

export async function createAccessRole(input: CreateAccessRoleInput) {
  const response = await apiFetch<{ role: AccessRole }>("/api/admin/roles", {
    method: "POST",
    body: JSON.stringify(input),
  });

  return response.role;
}

export async function updateAccessRole(id: string, input: CreateAccessRoleInput) {
  const response = await apiFetch<{ role: AccessRole }>(`/api/admin/roles/${id}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });

  return response.role;
}

export async function deleteAccessRole(id: string) {
  await apiFetch<{ ok: boolean }>(`/api/admin/roles/${id}`, {
    method: "DELETE",
  });
}

export async function createStaffAccount(input: CreateStaffAccountInput) {
  const response = await apiFetch<{ account: StaffAccount }>("/api/admin/accounts", {
    method: "POST",
    body: JSON.stringify(input),
  });

  return response.account;
}

export async function updateStaffAccount(id: string, input: UpdateStaffAccountInput) {
  const response = await apiFetch<{ account: StaffAccount }>(`/api/admin/accounts/${id}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });

  return response.account;
}

export async function deleteStaffAccount(id: string) {
  await apiFetch<{ ok: boolean }>(`/api/admin/accounts/${id}`, {
    method: "DELETE",
  });
}

export async function fetchTrips() {
  const response = await apiFetch<{ trips: Trip[] }>("/api/admin/trips");

  return response.trips;
}

export async function fetchPublicTrips() {
  const response = await apiFetch<{ trips: PublicTrip[] }>("/api/trips");

  return response.trips;
}

export async function fetchPublicTrip(id: string) {
  const response = await apiFetch<{ trip: PublicTrip }>(`/api/trips/${id}`);

  return response.trip;
}

export async function submitTripApplication(id: string, input: TripApplicationInput) {
  const response = await apiFetch<{ participant: PublicTripParticipant }>(`/api/trips/${id}/participants`, {
    method: "POST",
    body: JSON.stringify(input),
  });

  return response.participant;
}

export async function fetchTrip(id: string) {
  const response = await apiFetch<{ trip: Trip }>(`/api/admin/trips/${id}`);

  return response.trip;
}

export async function createTrip(input: CreateTripInput) {
  const response = await apiFetch<{ trip: Trip }>("/api/admin/trips", {
    method: "POST",
    body: JSON.stringify(input),
  });

  return response.trip;
}

export async function updateTrip(id: string, input: CreateTripInput) {
  const response = await apiFetch<{ trip: Trip }>(`/api/admin/trips/${id}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });

  return response.trip;
}

export async function deleteTrip(id: string) {
  await apiFetch<{ ok: boolean }>(`/api/admin/trips/${id}`, {
    method: "DELETE",
  });
}

export async function deleteTripParticipant(tripId: string, participantId: string) {
  await apiFetch<{ ok: boolean }>(`/api/admin/trips/${tripId}/participants/${participantId}`, {
    method: "DELETE",
  });
}

export function signOutAdmin() {
  window.sessionStorage.removeItem(ACCESS_TOKEN_KEY);
  window.sessionStorage.removeItem(CURRENT_USER_KEY);
}

export function isUnauthorizedError(error: unknown) {
  return error instanceof ApiError && error.status === 401;
}

export function isForbiddenError(error: unknown) {
  return error instanceof ApiError && error.status === 403;
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getAccessToken();
  const headers = new Headers(options.headers);

  if (!headers.has("Content-Type") && options.body) {
    headers.set("Content-Type", "application/json");
  }

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const message = await getErrorMessage(response);
    throw new ApiError(response.status, message);
  }

  return response.json() as Promise<T>;
}

async function getErrorMessage(response: Response) {
  try {
    const body = (await response.json()) as { message?: string };
    return body.message || response.statusText;
  } catch {
    return response.statusText;
  }
}

function getAccessToken() {
  return window.sessionStorage.getItem(ACCESS_TOKEN_KEY);
}

function setCurrentUser(user: AuthUser) {
  window.sessionStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
}

function getApiBaseUrl() {
  const envApiUrl = import.meta.env.VITE_API_URL?.trim();

  if (envApiUrl) {
    return envApiUrl.replace(/\/+$/, "");
  }

  return "";
}
