import { type FormEvent, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  CalendarDays,
  ClipboardList,
  Eye,
  FileText,
  Globe2,
  LayoutDashboard,
  LogOut,
  MapPin,
  MoreVertical,
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
  type TripParticipant,
  createTrip,
  deleteTripParticipant,
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

type ParticipantMenuState = {
  participantId: string;
  top: number;
  left: number;
};

type TripFormState = {
  countryCode: string;
  cityName: string;
  description: string;
  registrationDeadline: string;
  startDate: string;
  endDate: string;
  peopleLimit: string;
  restrictions: string;
  cost: string;
  note: string;
};

const emptyForm: TripFormState = {
  countryCode: "",
  cityName: "",
  description: "",
  registrationDeadline: "",
  startDate: "",
  endDate: "",
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
  const [viewingParticipant, setViewingParticipant] = useState<TripParticipant | null>(null);
  const [participantToDelete, setParticipantToDelete] = useState<TripParticipant | null>(null);
  const [isDeletingParticipant, setIsDeletingParticipant] = useState(false);

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

    const validationError = validateTripForm(form);

    if (validationError) {
      setModalError(validationError);
      return;
    }

    setIsSaving(true);

    const payload: CreateTripInput = {
      countryCode: form.countryCode,
      cityName: form.cityName,
      description: form.description,
      registrationDeadline: form.registrationDeadline,
      startDate: form.startDate,
      endDate: form.endDate,
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
        setSelectedTrip({ ...savedTrip, participants: editingTrip.participants || [] });
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

  const handleBackToTrips = () => {
    setSelectedTrip(null);
    setViewingParticipant(null);
    setParticipantToDelete(null);
  };

  const handleDeleteParticipant = async () => {
    if (!selectedTrip || !participantToDelete) {
      return;
    }

    const participantId = participantToDelete.id;
    setIsDeletingParticipant(true);
    setError("");

    try {
      await deleteTripParticipant(selectedTrip.id, participantId);
      setSelectedTrip((currentTrip) => removeParticipantFromSelectedTrip(currentTrip, participantId));
      setTrips((currentTrips) => {
        const nextTrips = removeParticipantFromTripList(currentTrips, selectedTrip.id);

        setMetrics(buildMetrics(nextTrips));
        return nextTrips;
      });
      setParticipantToDelete(null);
    } catch (requestError) {
      if (isUnauthorizedError(requestError)) {
        onLogout();
        return;
      }

      setError("Не удалось удалить участника");
    } finally {
      setIsDeletingParticipant(false);
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
            onBack={handleBackToTrips}
            onDelete={() => handleDeleteTrip(selectedTrip)}
            onEdit={() => openEditModal(selectedTrip)}
            onViewParticipant={setViewingParticipant}
            onRequestDeleteParticipant={setParticipantToDelete}
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
                <span>Регистрация до</span>
                <div className="input-shell">
                  <CalendarDays size={19} aria-hidden="true" />
                  <input
                    required
                    type="date"
                    value={form.registrationDeadline}
                    onChange={(event) => updateForm("registrationDeadline", event.target.value)}
                  />
                </div>
              </label>

              <label className="form-field">
                <span>Начало поездки</span>
                <div className="input-shell">
                  <CalendarDays size={19} aria-hidden="true" />
                  <input
                    required
                    type="date"
                    value={form.startDate}
                    onChange={(event) => updateForm("startDate", event.target.value)}
                  />
                </div>
              </label>

              <label className="form-field">
                <span>Окончание поездки</span>
                <div className="input-shell">
                  <CalendarDays size={19} aria-hidden="true" />
                  <input
                    required
                    type="date"
                    value={form.endDate}
                    onChange={(event) => updateForm("endDate", event.target.value)}
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

      {viewingParticipant ? (
        <ParticipantViewModal
          participant={viewingParticipant}
          onClose={() => setViewingParticipant(null)}
        />
      ) : null}

      {participantToDelete ? (
        <DeleteParticipantModal
          participant={participantToDelete}
          isDeleting={isDeletingParticipant}
          onCancel={() => setParticipantToDelete(null)}
          onConfirm={handleDeleteParticipant}
        />
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
            <span role="columnheader">Регистрация</span>
            <span role="columnheader">Даты поездки</span>
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
              <strong role="cell">
                {countryFlag(trip.countryCode)} {trip.countryName}
              </strong>
              <span role="cell">{trip.cityName}</span>
              <span role="cell">до {formatDate(shortDate(trip.registrationDeadline || trip.date))}</span>
              <span role="cell">{formatDateRange(shortDate(trip.startDate || trip.date), shortDate(trip.endDate || trip.date))}</span>
              <span role="cell">{getAvailableSpots(trip)} из {trip.peopleLimit}</span>
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
  onViewParticipant: (participant: TripParticipant) => void;
  onRequestDeleteParticipant: (participant: TripParticipant) => void;
};

function TripDetails({
  trip,
  isDeleting,
  onBack,
  onDelete,
  onEdit,
  onViewParticipant,
  onRequestDeleteParticipant,
}: TripDetailsProps) {
  const participants = trip.participants || [];
  const [openParticipantMenu, setOpenParticipantMenu] = useState<ParticipantMenuState | null>(null);

  useEffect(() => {
    if (!openParticipantMenu) {
      return;
    }

    const closeMenu = () => setOpenParticipantMenu(null);

    window.addEventListener("resize", closeMenu);
    window.addEventListener("scroll", closeMenu, true);

    return () => {
      window.removeEventListener("resize", closeMenu);
      window.removeEventListener("scroll", closeMenu, true);
    };
  }, [openParticipantMenu]);

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
            {countryFlag(trip.countryCode)} {trip.cityName}, {trip.countryName}
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
          <dt>Регистрация до</dt>
          <dd>{formatDate(shortDate(trip.registrationDeadline || trip.date))}</dd>
        </div>
        <div>
          <dt>Даты поездки</dt>
          <dd>{formatDateRange(shortDate(trip.startDate || trip.date), shortDate(trip.endDate || trip.date))}</dd>
        </div>
        <div>
          <dt>Кол-во людей</dt>
          <dd>{getAvailableSpots(trip)} из {trip.peopleLimit}</dd>
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

      <div className="trip-detail__section">
        <div className="participants-header">
          <div>
            <h3>Участники поездки</h3>
            <p>Здесь будут отображаться люди, которые подтвердили участие в этой поездке.</p>
          </div>
          <span className="status-pill">{participants.length} согласились</span>
        </div>

        {participants.length ? (
          <div
            className="participants-table"
            role="table"
            aria-label="Участники поездки"
          >
            <div className="participants-table__row participants-table__row--head" role="row">
              <span role="columnheader">Имя</span>
              <span role="columnheader">Город</span>
              <span role="columnheader">Дней</span>
              <span role="columnheader">Телефон</span>
              <span role="columnheader">Пожертвование</span>
              <span role="columnheader">Статус</span>
              <span className="participant-actions participant-actions--head" role="columnheader" aria-label="Действия" />
            </div>
            {participants.map((participant) => (
              <div className="participants-table__row" role="row" key={participant.id}>
                <strong role="cell">{participant.fullName}</strong>
                <span role="cell">{participant.cityName || "—"}</span>
                <span role="cell">{participant.availableDays ? `${participant.availableDays}` : "—"}</span>
                <span role="cell">{participant.phone || "—"}</span>
                <span role="cell">{participant.donation || "—"}</span>
                <span role="cell">{participant.status}</span>
                <div className="participant-actions" role="cell">
                  <button
                    className="participant-actions__trigger"
                    type="button"
                    aria-label={`Действия для ${participant.fullName}`}
                    aria-haspopup="menu"
                    aria-expanded={openParticipantMenu?.participantId === participant.id}
                    onClick={(event) => {
                      const buttonRect = event.currentTarget.getBoundingClientRect();
                      const menuWidth = 150;
                      const menuHeight = 92;
                      const maxLeft = Math.max(window.innerWidth - menuWidth - 12, 12);
                      const left = Math.min(Math.max(buttonRect.right - menuWidth, 12), maxLeft);
                      const top =
                        buttonRect.bottom + menuHeight + 12 > window.innerHeight
                          ? Math.max(buttonRect.top - menuHeight - 6, 12)
                          : buttonRect.bottom + 6;

                      setOpenParticipantMenu((currentMenu) =>
                        currentMenu?.participantId === participant.id
                          ? null
                          : { participantId: participant.id, top, left },
                      );
                    }}
                  >
                    <MoreVertical size={21} aria-hidden="true" />
                  </button>

                  {openParticipantMenu?.participantId === participant.id ? (
                    <div
                      className="participant-actions__menu"
                      role="menu"
                      style={{ top: openParticipantMenu.top, left: openParticipantMenu.left }}
                    >
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setOpenParticipantMenu(null);
                          onViewParticipant(participant);
                        }}
                      >
                        <Eye size={16} aria-hidden="true" />
                        Смотреть
                      </button>
                      <button
                        className="participant-actions__danger"
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setOpenParticipantMenu(null);
                          onRequestDeleteParticipant(participant);
                        }}
                      >
                        <Trash2 size={16} aria-hidden="true" />
                        Удалить
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state empty-state--compact">
            <h3>Пока нет участников</h3>
            <p>Когда подключим заявки пользователей, подтвержденные люди появятся в этой таблице.</p>
          </div>
        )}
      </div>
    </section>
  );
}

type ParticipantViewModalProps = {
  participant: TripParticipant;
  onClose: () => void;
};

function ParticipantViewModal({ participant, onClose }: ParticipantViewModalProps) {
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="trip-modal participant-modal" role="dialog" aria-modal="true" aria-label="Участник поездки">
        <div className="trip-modal__header">
          <div>
            <span className="admin-kicker">Участник поездки</span>
            <h2>{participant.fullName}</h2>
          </div>
          <button className="icon-button" type="button" aria-label="Закрыть" onClick={onClose}>
            <X size={21} aria-hidden="true" />
          </button>
        </div>

        <dl className="participant-modal__grid">
          <div>
            <dt>Город</dt>
            <dd>{participant.cityName || "—"}</dd>
          </div>
          <div>
            <dt>Дней</dt>
            <dd>{participant.availableDays || "—"}</dd>
          </div>
          <div>
            <dt>Телефон</dt>
            <dd>{participant.phone || "—"}</dd>
          </div>
          <div>
            <dt>Email</dt>
            <dd>{participant.email || "—"}</dd>
          </div>
          <div>
            <dt>Пожертвование</dt>
            <dd>{participant.donation || "—"}</dd>
          </div>
          <div>
            <dt>Статус</dt>
            <dd>{participant.status}</dd>
          </div>
          <div>
            <dt>Дата заявки</dt>
            <dd>{formatDateTime(participant.createdAt)}</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}

type DeleteParticipantModalProps = {
  participant: TripParticipant;
  isDeleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

function DeleteParticipantModal({
  participant,
  isDeleting,
  onCancel,
  onConfirm,
}: DeleteParticipantModalProps) {
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="trip-modal confirm-modal" role="dialog" aria-modal="true" aria-label="Удаление участника">
        <div className="trip-modal__header">
          <div>
            <span className="admin-kicker">Удаление участника</span>
            <h2>Удалить заявку?</h2>
          </div>
          <button className="icon-button" type="button" aria-label="Закрыть" onClick={onCancel}>
            <X size={21} aria-hidden="true" />
          </button>
        </div>

        <p>
          Вы уверены, что хотите удалить участника <strong>{participant.fullName}</strong>?
        </p>

        <div className="confirm-modal__actions">
          <button className="button button--secondary button--neutral" type="button" onClick={onCancel}>
            Отмена
          </button>
          <button className="button button--danger" type="button" disabled={isDeleting} onClick={onConfirm}>
            <Trash2 size={18} aria-hidden="true" />
            {isDeleting ? "Удаляем..." : "Удалить"}
          </button>
        </div>
      </section>
    </div>
  );
}

function tripToForm(trip: Trip): TripFormState {
  return {
    countryCode: trip.countryCode,
    cityName: trip.cityName,
    description: trip.description || "",
    registrationDeadline: shortDate(trip.registrationDeadline || trip.date),
    startDate: shortDate(trip.startDate || trip.date),
    endDate: shortDate(trip.endDate || trip.startDate || trip.date),
    peopleLimit: String(trip.peopleLimit),
    restrictions: trip.restrictions || "",
    cost: trip.cost,
    note: trip.note || "",
  };
}

function removeParticipantFromSelectedTrip(trip: Trip | null, participantId: string) {
  if (!trip) {
    return trip;
  }

  const participants = (trip.participants || []).filter((participant) => participant.id !== participantId);
  const participantsCount = participants.length;

  return {
    ...trip,
    participants,
    participantsCount,
    availableSpots: Math.max(Number(trip.peopleLimit || 0) - participantsCount, 0),
  };
}

function removeParticipantFromTripList(trips: Trip[], tripId: string) {
  return trips.map((trip) => {
    if (trip.id !== tripId) {
      return trip;
    }

    const participantsCount = Math.max(
      Number(trip.participantsCount ?? trip.participants?.length ?? 0) - 1,
      0,
    );

    return {
      ...trip,
      participantsCount,
      availableSpots: Math.max(Number(trip.peopleLimit || 0) - participantsCount, 0),
    };
  });
}

function buildMetrics(trips: Trip[]): AdminMetric[] {
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

function validateTripForm(form: TripFormState) {
  if (form.registrationDeadline > form.startDate) {
    return "Дата закрытия регистрации не может быть позже начала поездки.";
  }

  if (form.endDate < form.startDate) {
    return "Дата окончания поездки не может быть раньше даты начала.";
  }

  return "";
}

function countryFlag(code: string) {
  return code
    .toUpperCase()
    .replace(/./g, (char) => String.fromCodePoint(127397 + char.charCodeAt(0)));
}

function getAvailableSpots(trip: Trip) {
  if (typeof trip.availableSpots === "number") {
    return Math.max(trip.availableSpots, 0);
  }

  const participantsCount = Number(trip.participantsCount ?? trip.participants?.length ?? 0);

  return Math.max(Number(trip.peopleLimit || 0) - participantsCount, 0);
}

function shortDate(value: string) {
  return value ? value.slice(0, 10) : "";
}

function formatDate(value: string) {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat("ru", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

function formatDateRange(startDate: string, endDate: string) {
  if (!startDate && !endDate) {
    return "—";
  }

  if (startDate === endDate) {
    return formatDate(startDate);
  }

  return `${formatDate(startDate)} - ${formatDate(endDate)}`;
}

function formatDateTime(value?: string) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat("ru", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
