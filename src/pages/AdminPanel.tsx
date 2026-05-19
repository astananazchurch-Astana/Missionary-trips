import { type FormEvent, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  CalendarDays,
  ClipboardList,
  FileText,
  Globe2,
  LayoutDashboard,
  LogOut,
  MapPin,
  Pencil,
  Plus,
  Settings,
  Trash2,
  UsersRound,
  X,
} from "lucide-react";
import {
  type AdminMetric,
  type CityOption,
  type CountryOption,
  type CreateTripInput,
  type Trip,
  createTrip,
  deleteTrip,
  fetchCities,
  fetchCountries,
  fetchDashboardSummary,
  fetchTrip,
  isUnauthorizedError,
  updateTrip,
} from "../shared/lib/auth";
import { Logo } from "../shared/ui/Logo";

type AdminPanelProps = {
  homeHref: string;
  onHome: () => void;
  onLogout: () => void;
};

type TripFormState = {
  countryCode: string;
  cityName: string;
  description: string;
  date: string;
  peopleLimit: string;
  restrictions: string;
  cost: string;
  note: string;
};

const emptyForm: TripFormState = {
  countryCode: "",
  cityName: "",
  description: "",
  date: "",
  peopleLimit: "",
  restrictions: "",
  cost: "",
  note: "",
};

const metricIcons: Record<AdminMetric["id"], typeof CalendarDays> = {
  trips: CalendarDays,
  requests: ClipboardList,
  members: UsersRound,
  reports: FileText,
};

export function AdminPanel({ homeHref, onHome, onLogout }: AdminPanelProps) {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [metrics, setMetrics] = useState<AdminMetric[]>([]);
  const [countries, setCountries] = useState<CountryOption[]>([]);
  const [cities, setCities] = useState<CityOption[]>([]);
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingTrip, setEditingTrip] = useState<Trip | null>(null);
  const [form, setForm] = useState<TripFormState>(emptyForm);
  const [error, setError] = useState("");
  const [modalError, setModalError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isLoadingTrip, setIsLoadingTrip] = useState(false);

  const selectedCountry = useMemo(
    () => countries.find((country) => country.code === form.countryCode),
    [countries, form.countryCode],
  );

  useEffect(() => {
    let isMounted = true;

    async function loadInitialData() {
      try {
        const [summary, nextCountries] = await Promise.all([fetchDashboardSummary(), fetchCountries()]);

        if (isMounted) {
          setTrips(summary.trips);
          setMetrics(summary.metrics);
          setCountries(nextCountries);
        }
      } catch (requestError) {
        if (isUnauthorizedError(requestError)) {
          onLogout();
          return;
        }

        if (isMounted) {
          setError("Не удалось загрузить данные админки");
        }
      }
    }

    void loadInitialData();

    return () => {
      isMounted = false;
    };
  }, [onLogout]);

  useEffect(() => {
    let isMounted = true;

    if (!form.countryCode) {
      setCities([]);
      return () => {
        isMounted = false;
      };
    }

    const timer = window.setTimeout(() => {
      fetchCities(form.countryCode, form.cityName)
        .then((nextCities) => {
          if (isMounted) {
            setCities(nextCities);
          }
        })
        .catch((requestError) => {
          if (isUnauthorizedError(requestError)) {
            onLogout();
          }
        });
    }, 220);

    return () => {
      isMounted = false;
      window.clearTimeout(timer);
    };
  }, [form.cityName, form.countryCode, onLogout]);

  const handleSaveTrip = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setModalError("");
    setIsSaving(true);

    const payload: CreateTripInput = {
      countryCode: form.countryCode,
      cityName: form.cityName,
      description: form.description,
      date: form.date,
      peopleLimit: Number(form.peopleLimit),
      restrictions: form.restrictions,
      cost: form.cost,
      note: form.note,
    };

    try {
      const savedTrip = editingTrip
        ? await updateTrip(editingTrip.id, payload)
        : await createTrip(payload);

      setTrips((currentTrips) => {
        const nextTrips = editingTrip
          ? currentTrips.map((trip) => (trip.id === savedTrip.id ? savedTrip : trip))
          : [savedTrip, ...currentTrips];

        setMetrics(buildMetrics(nextTrips));
        return nextTrips;
      });

      if (editingTrip) {
        setSelectedTrip(savedTrip);
      }

      closeTripModal();
    } catch (requestError) {
      if (isUnauthorizedError(requestError)) {
        onLogout();
        return;
      }

      setModalError("Не удалось сохранить поездку. Проверьте заполнение полей.");
    } finally {
      setIsSaving(false);
    }
  };

  const openCreateModal = () => {
    setEditingTrip(null);
    setForm(emptyForm);
    setCities([]);
    setModalError("");
    setIsCreateOpen(true);
  };

  const openEditModal = (trip: Trip) => {
    setEditingTrip(trip);
    setForm(tripToForm(trip));
    setModalError("");
    setIsCreateOpen(true);
  };

  const closeTripModal = () => {
    setIsCreateOpen(false);
    setEditingTrip(null);
    setForm(emptyForm);
    setCities([]);
    setModalError("");
  };

  const handleDeleteTrip = async (trip: Trip) => {
    const shouldDelete = window.confirm(`Удалить поездку в город ${trip.cityName}?`);

    if (!shouldDelete) {
      return;
    }

    setIsDeleting(true);

    try {
      await deleteTrip(trip.id);
      setTrips((currentTrips) => {
        const nextTrips = currentTrips.filter((item) => item.id !== trip.id);

        setMetrics(buildMetrics(nextTrips));
        return nextTrips;
      });
      setSelectedTrip(null);
    } catch (requestError) {
      if (isUnauthorizedError(requestError)) {
        onLogout();
        return;
      }

      setError("Не удалось удалить поездку");
    } finally {
      setIsDeleting(false);
    }
  };

  const openTrip = async (tripId: string) => {
    setError("");
    setIsLoadingTrip(true);

    try {
      setSelectedTrip(await fetchTrip(tripId));
    } catch (requestError) {
      if (isUnauthorizedError(requestError)) {
        onLogout();
        return;
      }

      setError("Не удалось открыть поездку");
    } finally {
      setIsLoadingTrip(false);
    }
  };

  const updateForm = (field: keyof TripFormState, value: string) => {
    setForm((currentForm) => ({
      ...currentForm,
      [field]: value,
      ...(field === "countryCode" ? { cityName: "" } : {}),
    }));
  };

  return (
    <div className="admin-app">
      <aside className="admin-sidebar">
        <a
          className="brand admin-brand"
          href={homeHref}
          onClick={(event) => {
            event.preventDefault();
            onHome();
          }}
        >
          <Logo className="brand__logo" />
          <span>
            <strong>Admin</strong>
            <small>Missionary trips</small>
          </span>
        </a>

        <nav className="admin-menu" aria-label="Админ навигация">
          <button className="admin-menu__item admin-menu__item--active" type="button">
            <LayoutDashboard size={19} aria-hidden="true" />
            Поездки
          </button>
          <button className="admin-menu__item" type="button">
            <UsersRound size={19} aria-hidden="true" />
            Участники
          </button>
          <button className="admin-menu__item" type="button">
            <Settings size={19} aria-hidden="true" />
            Настройки
          </button>
        </nav>

        <button className="admin-logout" type="button" onClick={onLogout}>
          <LogOut size={19} aria-hidden="true" />
          Выйти
        </button>
      </aside>

      <main className="admin-main">
        <header className="admin-topbar">
          <div>
            <span className="admin-kicker">Панель администратора</span>
            <h1>Миссионерские поездки</h1>
          </div>
          <button className="button button--primary admin-create" type="button" onClick={openCreateModal}>
            <Plus size={19} aria-hidden="true" />
            Новая поездка
          </button>
        </header>

        {error ? (
          <p className="admin-error" role="alert">
            {error}
          </p>
        ) : null}

        {selectedTrip ? (
          <TripDetails
            trip={selectedTrip}
            isDeleting={isDeleting}
            onBack={() => setSelectedTrip(null)}
            onDelete={() => handleDeleteTrip(selectedTrip)}
            onEdit={() => openEditModal(selectedTrip)}
          />
        ) : (
          <>
            <MetricsGrid metrics={metrics} />
            <TripsTable trips={trips} isLoadingTrip={isLoadingTrip} onOpenTrip={openTrip} />
          </>
        )}
      </main>

      {isCreateOpen ? (
        <div className="modal-backdrop" role="presentation">
          <section className="trip-modal" role="dialog" aria-modal="true" aria-label="Новая поездка">
            <div className="trip-modal__header">
              <div>
                <span className="admin-kicker">{editingTrip ? "Редактирование" : "Новая поездка"}</span>
                <h2>{editingTrip ? "Изменить направление" : "Создать направление"}</h2>
              </div>
              <button
                className="icon-button"
                type="button"
                aria-label="Закрыть"
                onClick={closeTripModal}
              >
                <X size={21} aria-hidden="true" />
              </button>
            </div>

            <form className="trip-form" onSubmit={handleSaveTrip}>
              <label className="form-field">
                <span>Страна</span>
                <div className="input-shell input-shell--select">
                  <Globe2 size={19} aria-hidden="true" />
                  <select
                    required
                    value={form.countryCode}
                    onChange={(event) => updateForm("countryCode", event.target.value)}
                  >
                    <option value="">Выберите страну</option>
                    {countries.map((country) => (
                      <option key={country.code} value={country.code}>
                        {country.name}
                      </option>
                    ))}
                  </select>
                </div>
              </label>

              <label className="form-field">
                <span>Город</span>
                <div className="input-shell">
                  <MapPin size={19} aria-hidden="true" />
                  <input
                    required
                    list="city-options"
                    disabled={!form.countryCode}
                    value={form.cityName}
                    onChange={(event) => updateForm("cityName", event.target.value)}
                    placeholder={selectedCountry ? `Город в стране ${selectedCountry.name}` : "Сначала выберите страну"}
                  />
                  <datalist id="city-options">
                    {cities.map((city) => (
                      <option key={city.name} value={city.name} />
                    ))}
                  </datalist>
                </div>
              </label>

              <label className="form-field form-field--wide">
                <span>Описание</span>
                <textarea
                  required
                  rows={4}
                  value={form.description}
                  onChange={(event) => updateForm("description", event.target.value)}
                  placeholder="Кратко опишите цель поездки, служение и контекст"
                />
              </label>

              <label className="form-field">
                <span>Дата</span>
                <div className="input-shell">
                  <CalendarDays size={19} aria-hidden="true" />
                  <input
                    required
                    type="date"
                    value={form.date}
                    onChange={(event) => updateForm("date", event.target.value)}
                  />
                </div>
              </label>

              <label className="form-field">
                <span>Кол-во людей</span>
                <input
                  required
                  min={1}
                  type="number"
                  value={form.peopleLimit}
                  onChange={(event) => updateForm("peopleLimit", event.target.value)}
                  placeholder="Например, 12"
                />
              </label>

              <label className="form-field">
                <span>Ограничения</span>
                <input
                  required
                  value={form.restrictions}
                  onChange={(event) => updateForm("restrictions", event.target.value)}
                  placeholder="Возраст, документы, подготовка"
                />
              </label>

              <label className="form-field">
                <span>Стоимость</span>
                <input
                  required
                  value={form.cost}
                  onChange={(event) => updateForm("cost", event.target.value)}
                  placeholder="Например, 250 000 ₸"
                />
              </label>

              <label className="form-field form-field--wide">
                <span>Примечание</span>
                <textarea
                  rows={3}
                  value={form.note}
                  onChange={(event) => updateForm("note", event.target.value)}
                  placeholder="Необязательное поле"
                />
              </label>

              {modalError ? (
                <p className="admin-error form-field--wide" role="alert">
                  {modalError}
                </p>
              ) : null}

              <div className="trip-form__actions">
                <button className="button button--secondary button--neutral" type="button" onClick={closeTripModal}>
                  Отмена
                </button>
                <button className="button button--primary" type="submit" disabled={isSaving}>
                  <Plus size={19} aria-hidden="true" />
                  {isSaving ? "Сохраняем..." : editingTrip ? "Сохранить" : "Создать поездку"}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </div>
  );
}

type TripsTableProps = {
  trips: Trip[];
  isLoadingTrip: boolean;
  onOpenTrip: (tripId: string) => void;
};

type MetricsGridProps = {
  metrics: AdminMetric[];
};

function MetricsGrid({ metrics }: MetricsGridProps) {
  if (!metrics.length) {
    return null;
  }

  return (
    <section className="admin-metrics" aria-label="Показатели">
      {metrics.map((metric) => {
        const Icon = metricIcons[metric.id];

        return (
          <article className="metric-card" key={metric.id}>
            <Icon size={22} aria-hidden="true" />
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
          </article>
        );
      })}
    </section>
  );
}

function TripsTable({ trips, isLoadingTrip, onOpenTrip }: TripsTableProps) {
  return (
    <section className="admin-panel trips-admin-panel">
      <div className="admin-panel__header">
        <div>
          <span>Поездки</span>
          <h2>Все направления</h2>
        </div>
      </div>

      {trips.length ? (
        <div className="admin-table" role="table" aria-label="Миссионерские поездки">
          <div className="admin-table__row admin-table__row--head admin-table__row--trips" role="row">
            <span role="columnheader">Страна</span>
            <span role="columnheader">Город</span>
            <span role="columnheader">Дата</span>
            <span role="columnheader">Людей</span>
            <span role="columnheader">Стоимость</span>
          </div>
          {trips.map((trip) => (
            <button
              className="admin-table__row admin-table__row--trips admin-table__row--button"
              type="button"
              role="row"
              key={trip.id}
              disabled={isLoadingTrip}
              onClick={() => onOpenTrip(trip.id)}
            >
              <strong role="cell">{trip.countryName}</strong>
              <span role="cell">{trip.cityName}</span>
              <span role="cell">{formatDate(trip.date)}</span>
              <span role="cell">{trip.peopleLimit}</span>
              <span role="cell">{trip.cost}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <h3>Поездок пока нет</h3>
          <p>Нажмите “Новая поездка”, заполните форму, и направление появится в таблице.</p>
        </div>
      )}
    </section>
  );
}

type TripDetailsProps = {
  trip: Trip;
  isDeleting: boolean;
  onBack: () => void;
  onDelete: () => void;
  onEdit: () => void;
};

function TripDetails({ trip, isDeleting, onBack, onDelete, onEdit }: TripDetailsProps) {
  return (
    <section className="admin-panel trip-detail">
      <button className="detail-back" type="button" onClick={onBack}>
        <ArrowLeft size={18} aria-hidden="true" />
        К списку поездок
      </button>

      <div className="trip-detail__header">
        <div>
          <span className="admin-kicker">Подробности поездки</span>
          <h2>
            {trip.cityName}, {trip.countryName}
          </h2>
        </div>
        <div className="trip-detail__actions">
          <span className="status-pill">{trip.status}</span>
          <button className="button button--secondary button--neutral" type="button" onClick={onEdit}>
            <Pencil size={18} aria-hidden="true" />
            Редактировать
          </button>
          <button className="button button--danger" type="button" disabled={isDeleting} onClick={onDelete}>
            <Trash2 size={18} aria-hidden="true" />
            {isDeleting ? "Удаляем..." : "Удалить"}
          </button>
        </div>
      </div>

      <dl className="trip-detail__grid">
        <div>
          <dt>Страна</dt>
          <dd>{trip.countryName}</dd>
        </div>
        <div>
          <dt>Город</dt>
          <dd>{trip.cityName}</dd>
        </div>
        <div>
          <dt>Дата</dt>
          <dd>{formatDate(trip.date)}</dd>
        </div>
        <div>
          <dt>Кол-во людей</dt>
          <dd>{trip.peopleLimit}</dd>
        </div>
        <div>
          <dt>Стоимость</dt>
          <dd>{trip.cost}</dd>
        </div>
        <div>
          <dt>Ограничения</dt>
          <dd>{trip.restrictions}</dd>
        </div>
      </dl>

      <div className="trip-detail__section">
        <h3>Описание</h3>
        <p>{trip.description}</p>
      </div>

      {trip.note ? (
        <div className="trip-detail__section">
          <h3>Примечание</h3>
          <p>{trip.note}</p>
        </div>
      ) : null}
    </section>
  );
}

function tripToForm(trip: Trip): TripFormState {
  return {
    countryCode: trip.countryCode,
    cityName: trip.cityName,
    description: trip.description || "",
    date: trip.date,
    peopleLimit: String(trip.peopleLimit),
    restrictions: trip.restrictions || "",
    cost: trip.cost,
    note: trip.note || "",
  };
}

function buildMetrics(trips: Trip[]): AdminMetric[] {
  const peopleLimit = trips.reduce((total, trip) => total + Number(trip.peopleLimit || 0), 0);

  return [
    { id: "trips", label: "Активные поездки", value: String(trips.length) },
    { id: "requests", label: "Новые заявки", value: "0" },
    { id: "members", label: "Участники", value: String(peopleLimit) },
    { id: "reports", label: "Черновики отчетов", value: "0" },
  ];
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ru", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}
