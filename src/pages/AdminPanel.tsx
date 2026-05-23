import { type FormEvent, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  CalendarDays,
  ClipboardList,
  Crown,
  Eye,
  FileText,
  Globe2,
  LayoutDashboard,
  LockKeyhole,
  LogOut,
  MapPin,
  MoreVertical,
  Pencil,
  Phone,
  Plus,
  Settings,
  ShieldCheck,
  Trash2,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import {
  type AccessRole,
  type AdminMetric,
  type AssignTripLeaderInput,
  type AuthUser,
  type CityOption,
  type CountryOption,
  type CreateTripInput,
  type MinistryAccess,
  type Trip,
  type TripParticipant,
  type TripReport,
  assignTripLeader,
  createTrip,
  deleteTripParticipant,
  deleteTrip,
  fetchCities,
  fetchAccessControlSummary,
  fetchCountries,
  fetchDashboardSummary,
  fetchLeaderTrips,
  fetchTrip,
  hasAnyPermission,
  hasPermission,
  isForbiddenError,
  isUnauthorizedError,
  updateTrip,
} from "../shared/lib/auth";
import { Logo } from "../shared/ui/Logo";
import { AdminAccessPanel } from "./AdminAccessPanel";
import { AdminReportsPanel } from "./AdminReportsPanel";
import { TripReportEditor } from "./TripReportEditor";

type AdminPanelProps = {
  homeHref: string;
  onHome: () => void;
  onLogout: () => void;
  user: AuthUser;
};

type ParticipantMenuState = {
  participantId: string;
  top: number;
  left: number;
};

type AdminSection = "trips" | "accounts" | "reports";

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

type LeaderModalState = {
  trip: Trip;
  participant: TripParticipant;
};

type LeaderFormState = {
  password: string;
  ministryId: string;
  roleId: string;
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

const emptyLeaderForm: LeaderFormState = {
  password: "",
  ministryId: "",
  roleId: "",
};

const metricIcons: Record<AdminMetric["id"], typeof CalendarDays> = {
  trips: CalendarDays,
  requests: ClipboardList,
  members: UsersRound,
  reports: FileText,
};

const accessSectionPermissions = [
  "accounts:view",
  "accounts:create",
  "accounts:update",
  "accounts:delete",
  "ministries:view",
  "ministries:create",
  "ministries:update",
  "ministries:delete",
  "roles:view",
  "roles:create",
  "roles:update",
  "roles:delete",
];

const reportSectionPermissions = ["reports:view", "reports:create", "reports:update", "reports:delete"];

export function AdminPanel({ homeHref, onHome, onLogout, user }: AdminPanelProps) {
  const canViewTrips = hasPermission(user, "trips:view");
  const canCreateTrip = hasPermission(user, "trips:create");
  const canUpdateTrip = hasPermission(user, "trips:update");
  const canDeleteTrip = hasPermission(user, "trips:delete");
  const canViewParticipants = canViewTrips && hasPermission(user, "participants:view");
  const canDeleteParticipants = canViewParticipants && hasPermission(user, "participants:delete");
  const canViewReports = hasPermission(user, "reports:view");
  const canCreateReports = hasPermission(user, "reports:create");
  const canUpdateReports = hasPermission(user, "reports:update");
  const canDeleteReports = hasPermission(user, "reports:delete");
  const canUseLeaderTrips = user.role === "account" && hasAnyPermission(user, reportSectionPermissions);
  const canOpenTripsSection = canViewTrips || canUseLeaderTrips;
  const canAssignLeader = canViewParticipants && canUpdateTrip && hasPermission(user, "accounts:create");
  const canViewTripParticipants = canViewParticipants || canUseLeaderTrips;
  const canManageAccess = hasAnyPermission(user, accessSectionPermissions);
  const canUseTripForm = canCreateTrip || canUpdateTrip;
  const hasAnyAdminSection = canOpenTripsSection || canManageAccess || canViewReports;
  const [activeSection, setActiveSection] = useState<AdminSection>(() =>
    canOpenTripsSection ? "trips" : canViewReports ? "reports" : "accounts",
  );
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
  const [leaderModal, setLeaderModal] = useState<LeaderModalState | null>(null);
  const [leaderForm, setLeaderForm] = useState<LeaderFormState>(emptyLeaderForm);
  const [leaderMinistries, setLeaderMinistries] = useState<MinistryAccess[]>([]);
  const [leaderRoles, setLeaderRoles] = useState<AccessRole[]>([]);
  const [leaderModalError, setLeaderModalError] = useState("");
  const [isLeaderSaving, setIsLeaderSaving] = useState(false);

  const selectedCountry = useMemo(
    () => countries.find((country) => country.code === form.countryCode),
    [countries, form.countryCode],
  );
  const availableLeaderRoles = useMemo(
    () => leaderRoles.filter((role) => role.ministryId === leaderForm.ministryId),
    [leaderForm.ministryId, leaderRoles],
  );

  useEffect(() => {
    if (activeSection === "trips" && !canOpenTripsSection) {
      setActiveSection(canViewReports ? "reports" : "accounts");
    }

    if (activeSection === "accounts" && !canManageAccess && canViewTrips) {
      setActiveSection("trips");
    }

    if (activeSection === "reports" && !canViewReports) {
      setActiveSection(canOpenTripsSection ? "trips" : "accounts");
    }
  }, [activeSection, canManageAccess, canOpenTripsSection, canViewReports, canViewTrips]);

  useEffect(() => {
    let isMounted = true;

    async function loadInitialData() {
      if (!canOpenTripsSection) {
        setTrips([]);
        setMetrics([]);
        setCountries([]);
        return;
      }

      try {
        if (canViewTrips) {
          const [summary, nextCountries] = await Promise.all([
            fetchDashboardSummary(),
            canUseTripForm ? fetchCountries() : Promise.resolve([]),
          ]);

          if (isMounted) {
            setTrips(summary.trips);
            setMetrics(summary.metrics);
            setCountries(nextCountries);
          }
        } else {
          const leaderTrips = await fetchLeaderTrips();

          if (isMounted) {
            setTrips(leaderTrips);
            setMetrics(buildMetrics(leaderTrips));
            setCountries([]);
          }
        }
      } catch (requestError) {
        if (isUnauthorizedError(requestError)) {
          onLogout();
          return;
        }

        if (isForbiddenError(requestError)) {
          if (isMounted) {
            setError("Недостаточно прав для просмотра поездок.");
          }
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
  }, [canOpenTripsSection, canUseTripForm, canViewTrips, onLogout]);

  useEffect(() => {
    let isMounted = true;

    if (!canUseTripForm || !form.countryCode) {
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
            return;
          }

          if (isForbiddenError(requestError) && isMounted) {
            setModalError("Недостаточно прав для выбора города.");
          }
        });
    }, 220);

    return () => {
      isMounted = false;
      window.clearTimeout(timer);
    };
  }, [canUseTripForm, form.cityName, form.countryCode, onLogout]);

  const handleSaveTrip = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setModalError("");

    if (editingTrip ? !canUpdateTrip : !canCreateTrip) {
      setModalError("Недостаточно прав для сохранения поездки.");
      return;
    }

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

      if (isForbiddenError(requestError)) {
        setModalError("Недостаточно прав для сохранения поездки.");
        return;
      }

      setModalError("Не удалось сохранить поездку. Проверьте заполнение полей.");
    } finally {
      setIsSaving(false);
    }
  };

  const openCreateModal = () => {
    if (!canCreateTrip) {
      return;
    }

    setEditingTrip(null);
    setForm(emptyForm);
    setCities([]);
    setModalError("");
    setIsCreateOpen(true);
  };

  const openEditModal = (trip: Trip) => {
    if (!canUpdateTrip) {
      return;
    }

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
    if (!canDeleteTrip) {
      setError("Недостаточно прав для удаления поездки.");
      return;
    }

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

      if (isForbiddenError(requestError)) {
        setError("Недостаточно прав для удаления поездки.");
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

    if (!canDeleteParticipants) {
      setError("Недостаточно прав для удаления участника.");
      setParticipantToDelete(null);
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

      if (isForbiddenError(requestError)) {
        setError("Недостаточно прав для удаления участника.");
        return;
      }

      setError("Не удалось удалить участника");
    } finally {
      setIsDeletingParticipant(false);
    }
  };

  const openTrip = async (tripId: string) => {
    if (!canOpenTripsSection) {
      setError("Недостаточно прав для просмотра поездок.");
      return;
    }

    setError("");
    setIsLoadingTrip(true);

    try {
      if (canViewTrips) {
        setSelectedTrip(await fetchTrip(tripId));
      } else {
        const leaderTrip = trips.find((trip) => trip.id === tripId);

        if (!leaderTrip) {
          setError("Поездка не найдена среди назначенных.");
          return;
        }

        setSelectedTrip(leaderTrip);
      }
    } catch (requestError) {
      if (isUnauthorizedError(requestError)) {
        onLogout();
        return;
      }

      if (isForbiddenError(requestError)) {
        setError("Недостаточно прав для открытия поездки.");
        return;
      }

      setError("Не удалось открыть поездку");
    } finally {
      setIsLoadingTrip(false);
    }
  };

  const openLeaderModal = async (participant: TripParticipant) => {
    if (!selectedTrip || !canAssignLeader) {
      return;
    }

    setLeaderModal({ trip: selectedTrip, participant });
    setLeaderForm(emptyLeaderForm);
    setLeaderModalError("");

    try {
      const summary = await fetchAccessControlSummary();
      const firstMinistry = summary.ministries[0];
      const firstRole = firstMinistry
        ? summary.roles.find((role) => role.ministryId === firstMinistry.id)
        : undefined;

      setLeaderMinistries(summary.ministries);
      setLeaderRoles(summary.roles);
      setLeaderForm({
        password: "",
        ministryId: firstMinistry?.id || "",
        roleId: firstRole?.id || "",
      });
    } catch (requestError) {
      if (isUnauthorizedError(requestError)) {
        onLogout();
        return;
      }

      setLeaderModalError("Не удалось загрузить служения и роли для лидера.");
    }
  };

  const closeLeaderModal = () => {
    setLeaderModal(null);
    setLeaderForm(emptyLeaderForm);
    setLeaderModalError("");
  };

  const updateLeaderForm = (field: keyof LeaderFormState, value: string) => {
    setLeaderForm((currentForm) => {
      const nextForm = {
        ...currentForm,
        [field]: value,
      };

      if (field === "ministryId") {
        nextForm.roleId = leaderRoles.find((role) => role.ministryId === value)?.id || "";
      }

      return nextForm;
    });
  };

  const handleAssignLeader = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!leaderModal) {
      return;
    }

    if (!leaderForm.password.trim() || !leaderForm.ministryId || !leaderForm.roleId) {
      setLeaderModalError("Укажите пароль, служение и роль лидера.");
      return;
    }

    setIsLeaderSaving(true);
    setLeaderModalError("");

    const payload: AssignTripLeaderInput = {
      participantId: leaderModal.participant.id,
      password: leaderForm.password,
      ministryId: leaderForm.ministryId,
      roleId: leaderForm.roleId,
    };

    try {
      const result = await assignTripLeader(leaderModal.trip.id, payload);

      setSelectedTrip(result.trip);
      setTrips((currentTrips) =>
        currentTrips.map((trip) => (trip.id === result.trip.id ? { ...trip, ...result.trip } : trip)),
      );
      closeLeaderModal();
    } catch (requestError) {
      if (isUnauthorizedError(requestError)) {
        onLogout();
        return;
      }

      if (isForbiddenError(requestError)) {
        setLeaderModalError("Недостаточно прав для назначения лидера.");
        return;
      }

      setLeaderModalError(requestError instanceof Error && requestError.message
        ? requestError.message
        : "Не удалось назначить лидера поездки.");
    } finally {
      setIsLeaderSaving(false);
    }
  };

  const handleReportSaved = (report: TripReport, isCompleted: boolean) => {
    const nextStatus = isCompleted ? "Завершена" : selectedTrip?.status;

    setSelectedTrip((currentTrip) =>
      currentTrip
        ? {
            ...currentTrip,
            status: nextStatus || currentTrip.status,
            report,
          }
        : currentTrip,
    );
    setTrips((currentTrips) =>
      currentTrips.map((trip) =>
        trip.id === report.tripId
          ? {
              ...trip,
              status: nextStatus || trip.status,
              report,
            }
          : trip,
      ),
    );
  };

  const updateForm = (field: keyof TripFormState, value: string) => {
    setForm((currentForm) => ({
      ...currentForm,
      [field]: value,
      ...(field === "countryCode" ? { cityName: "" } : {}),
    }));
  };

  const openTripsSection = () => {
    if (!canOpenTripsSection) {
      return;
    }

    setActiveSection("trips");
  };

  const openAccountsSection = () => {
    if (!canManageAccess) {
      return;
    }

    setActiveSection("accounts");
    setSelectedTrip(null);
    setIsCreateOpen(false);
    setEditingTrip(null);
    setViewingParticipant(null);
    setParticipantToDelete(null);
    setLeaderModal(null);
  };

  const openReportsSection = () => {
    if (!canViewReports) {
      return;
    }

    setActiveSection("reports");
    setSelectedTrip(null);
    setIsCreateOpen(false);
    setEditingTrip(null);
    setViewingParticipant(null);
    setParticipantToDelete(null);
    setLeaderModal(null);
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
          {canOpenTripsSection ? (
            <button
              className={`admin-menu__item${activeSection === "trips" ? " admin-menu__item--active" : ""}`}
              type="button"
              onClick={openTripsSection}
            >
              <LayoutDashboard size={19} aria-hidden="true" />
              Поездки
            </button>
          ) : null}
          {canViewReports ? (
            <button
              className={`admin-menu__item${activeSection === "reports" ? " admin-menu__item--active" : ""}`}
              type="button"
              onClick={openReportsSection}
            >
              <FileText size={19} aria-hidden="true" />
              Отчеты
            </button>
          ) : null}
          {canManageAccess ? (
            <button
              className={`admin-menu__item${activeSection === "accounts" ? " admin-menu__item--active" : ""}`}
              type="button"
              onClick={openAccountsSection}
            >
              <UsersRound size={19} aria-hidden="true" />
              Аккаунты
            </button>
          ) : null}
        </nav>

        <button className="admin-logout" type="button" onClick={onLogout}>
          <LogOut size={19} aria-hidden="true" />
          Выйти
        </button>
      </aside>

      <main className="admin-main">
        {!hasAnyAdminSection ? (
          <section className="admin-panel">
            <div className="empty-state empty-state--compact">
              <h3>Нет доступных разделов</h3>
              <p>Администратор пока не выдал права для этой учетной записи.</p>
            </div>
          </section>
        ) : activeSection === "accounts" && canManageAccess ? (
          <AdminAccessPanel onLogout={onLogout} user={user} />
        ) : activeSection === "reports" && canViewReports ? (
          <AdminReportsPanel canDelete={canDeleteReports} onLogout={onLogout} />
        ) : canOpenTripsSection ? (
          <>
            <header className="admin-topbar">
              <div>
                <span className="admin-kicker">Панель администратора</span>
                <h1>{canViewTrips ? "Миссионерские поездки" : "Мои поездки"}</h1>
              </div>
              {canCreateTrip ? (
                <button className="button button--primary admin-create" type="button" onClick={openCreateModal}>
                  <Plus size={19} aria-hidden="true" />
                  Новая поездка
                </button>
              ) : null}
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
                canEdit={canUpdateTrip}
                canDelete={canDeleteTrip}
                canViewParticipants={canViewTripParticipants}
                canDeleteParticipants={canDeleteParticipants}
                canAssignLeader={canAssignLeader}
                canFillReport={canUseLeaderTrips && selectedTrip.leaderAccountId === user.id}
                canCreateReport={canCreateReports}
                canUpdateReport={canUpdateReports}
                onLogout={onLogout}
                onRequestLeader={openLeaderModal}
                onReportSaved={handleReportSaved}
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
          </>
        ) : (
          <AdminAccessPanel onLogout={onLogout} user={user} />
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

      {participantToDelete && canDeleteParticipants ? (
        <DeleteParticipantModal
          participant={participantToDelete}
          isDeleting={isDeletingParticipant}
          onCancel={() => setParticipantToDelete(null)}
          onConfirm={handleDeleteParticipant}
        />
      ) : null}

      {leaderModal ? (
        <LeaderAccountModal
          form={leaderForm}
          participant={leaderModal.participant}
          ministries={leaderMinistries}
          roles={availableLeaderRoles}
          error={leaderModalError}
          isSaving={isLeaderSaving}
          onSubmit={handleAssignLeader}
          onClose={closeLeaderModal}
          onChange={updateLeaderForm}
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
  canEdit: boolean;
  canDelete: boolean;
  canViewParticipants: boolean;
  canDeleteParticipants: boolean;
  canAssignLeader: boolean;
  canFillReport: boolean;
  canCreateReport: boolean;
  canUpdateReport: boolean;
  onLogout: () => void;
  onRequestLeader: (participant: TripParticipant) => void;
  onReportSaved: (report: TripReport, isCompleted: boolean) => void;
  onBack: () => void;
  onDelete: () => void;
  onEdit: () => void;
  onViewParticipant: (participant: TripParticipant) => void;
  onRequestDeleteParticipant: (participant: TripParticipant) => void;
};

function TripDetails({
  trip,
  isDeleting,
  canEdit,
  canDelete,
  canViewParticipants,
  canDeleteParticipants,
  canAssignLeader,
  canFillReport,
  canCreateReport,
  canUpdateReport,
  onLogout,
  onRequestLeader,
  onReportSaved,
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
          {canEdit ? (
            <button className="button button--secondary button--neutral" type="button" onClick={onEdit}>
              <Pencil size={18} aria-hidden="true" />
              Редактировать
            </button>
          ) : null}
          {canDelete ? (
            <button className="button button--danger" type="button" disabled={isDeleting} onClick={onDelete}>
              <Trash2 size={18} aria-hidden="true" />
              {isDeleting ? "Удаляем..." : "Удалить"}
            </button>
          ) : null}
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

      {canViewParticipants ? (
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
              <span className="participant-leader-cell participant-leader-cell--head" role="columnheader" aria-label="Лидер" />
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
                <div className="participant-leader-cell" role="cell">
                  {canAssignLeader ? (
                    <button
                      className={`leader-crown${trip.leaderParticipantId === participant.id ? " leader-crown--active" : ""}`}
                      type="button"
                      aria-label={`Назначить лидером ${participant.fullName}`}
                      onClick={() => onRequestLeader(participant)}
                    >
                      <Crown size={18} aria-hidden="true" />
                    </button>
                  ) : trip.leaderParticipantId === participant.id ? (
                    <span className="leader-crown leader-crown--active leader-crown--readonly">
                      <Crown size={18} aria-hidden="true" />
                    </span>
                  ) : (
                    <span aria-hidden="true">—</span>
                  )}
                </div>
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
                      const menuHeight = canDeleteParticipants ? 92 : 48;
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
                      {canDeleteParticipants ? (
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
                      ) : null}
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
      ) : null}

      {canFillReport ? (
        <TripReportEditor
          trip={trip}
          canCreate={canCreateReport}
          canUpdate={canUpdateReport}
          onLogout={onLogout}
          onReportSaved={onReportSaved}
        />
      ) : null}
    </section>
  );
}

type LeaderAccountModalProps = {
  form: LeaderFormState;
  participant: TripParticipant;
  ministries: MinistryAccess[];
  roles: AccessRole[];
  error: string;
  isSaving: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
  onChange: (field: keyof LeaderFormState, value: string) => void;
};

function LeaderAccountModal({
  form,
  participant,
  ministries,
  roles,
  error,
  isSaving,
  onSubmit,
  onClose,
  onChange,
}: LeaderAccountModalProps) {
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="trip-modal access-modal" role="dialog" aria-modal="true" aria-label="Лидер поездки">
        <div className="trip-modal__header">
          <div>
            <span className="admin-kicker">Лидер поездки</span>
            <h2>Создать аккаунт лидера</h2>
          </div>
          <button className="icon-button" type="button" aria-label="Закрыть" onClick={onClose}>
            <X size={21} aria-hidden="true" />
          </button>
        </div>

        <form className="trip-form" onSubmit={onSubmit}>
          <label className="form-field">
            <span>ФИО</span>
            <div className="input-shell">
              <UserRound size={19} aria-hidden="true" />
              <input disabled value={participant.fullName} />
            </div>
          </label>

          <label className="form-field">
            <span>Телефон</span>
            <div className="input-shell">
              <Phone size={19} aria-hidden="true" />
              <input disabled value={participant.phone || ""} />
            </div>
          </label>

          <label className="form-field">
            <span>Пароль</span>
            <div className="input-shell">
              <LockKeyhole size={19} aria-hidden="true" />
              <input
                required
                type="password"
                value={form.password}
                onChange={(event) => onChange("password", event.target.value)}
                placeholder="Минимум 6 символов"
              />
            </div>
          </label>

          <label className="form-field">
            <span>Служение</span>
            <div className="input-shell input-shell--select">
              <Settings size={19} aria-hidden="true" />
              <select
                required
                value={form.ministryId}
                onChange={(event) => onChange("ministryId", event.target.value)}
              >
                <option value="">Выберите служение</option>
                {ministries.map((ministry) => (
                  <option key={ministry.id} value={ministry.id}>
                    {ministry.name}
                  </option>
                ))}
              </select>
            </div>
          </label>

          <label className="form-field form-field--wide">
            <span>Роль</span>
            <div className="input-shell input-shell--select">
              <ShieldCheck size={19} aria-hidden="true" />
              <select
                required
                disabled={!form.ministryId || !roles.length}
                value={form.roleId}
                onChange={(event) => onChange("roleId", event.target.value)}
              >
                <option value="">{form.ministryId ? "Выберите роль" : "Сначала выберите служение"}</option>
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </select>
            </div>
          </label>

          {error ? (
            <p className="admin-error form-field--wide" role="alert">
              {error}
            </p>
          ) : null}

          <div className="trip-form__actions form-field--wide">
            <button className="button button--secondary button--neutral" type="button" onClick={onClose}>
              Отмена
            </button>
            <button className="button button--primary" type="submit" disabled={isSaving}>
              <Crown size={19} aria-hidden="true" />
              {isSaving ? "Назначаем..." : "Назначить лидером"}
            </button>
          </div>
        </form>
      </section>
    </div>
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
