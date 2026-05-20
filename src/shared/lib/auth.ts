const LEGACY_ADMIN_AUTH_KEY = "missionary-trips-admin-auth";
const ACCESS_TOKEN_KEY = "missionary-trips-admin-access-token";

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

type LoginResponse = {
  accessToken: string;
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

export async function signInAdmin(username: string, password: string): Promise<SignInResult> {
  try {
    const response = await apiFetch<LoginResponse>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });

    window.sessionStorage.setItem(ACCESS_TOKEN_KEY, response.accessToken);

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
    return false;
  }

  try {
    await apiFetch("/api/auth/me");
    return true;
  } catch {
    signOutAdmin();
    return false;
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
}

export function isUnauthorizedError(error: unknown) {
  return error instanceof ApiError && error.status === 401;
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

function getApiBaseUrl() {
  const envApiUrl = import.meta.env.VITE_API_URL?.trim();

  if (envApiUrl) {
    return envApiUrl.replace(/\/+$/, "");
  }

  return "";
}
