import { type FormEvent, useCallback, useMemo, useState, useEffect } from "react";
import {
  CheckCircle2,
  ClipboardList,
  LockKeyhole,
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
  type AccessPermission,
  type AccessRole,
  type AuthUser,
  type CreateAccessRoleInput,
  type CreateMinistryInput,
  type CreateStaffAccountInput,
  type MinistryAccess,
  type StaffAccount,
  type UpdateStaffAccountInput,
  createAccessRole,
  createMinistry,
  createStaffAccount,
  deleteAccessRole,
  deleteMinistry,
  deleteStaffAccount,
  fetchAccessControlSummary,
  hasAnyPermission,
  hasPermission,
  isForbiddenError,
  isUnauthorizedError,
  updateAccessRole,
  updateMinistry,
  updateStaffAccount,
} from "../shared/lib/auth";

type AdminAccessPanelProps = {
  onLogout: () => void;
  user: AuthUser;
};

type AccessTab = "accounts" | "ministries" | "roles";
type ModalMode = "create" | "edit";
type AccessModal =
  | { type: "account"; mode: ModalMode; account?: StaffAccount }
  | { type: "ministry"; mode: ModalMode; ministry?: MinistryAccess };
type RoleEditorState = { mode: ModalMode; role?: AccessRole };

type AccountFormState = {
  fullName: string;
  phone: string;
  password: string;
  ministryId: string;
  roleId: string;
};

type MinistryFormState = {
  name: string;
  description: string;
};

type RoleFormState = {
  name: string;
  ministryId: string;
  permissions: string[];
};

type PermissionAction = AccessPermission["action"];

type PermissionModuleRow = {
  group: string;
  resource: string;
  label: string;
  permissions: Partial<Record<PermissionAction, AccessPermission>>;
};

const permissionActions: Array<{ id: PermissionAction; label: string }> = [
  { id: "view", label: "Просмотр" },
  { id: "create", label: "Создать" },
  { id: "update", label: "Изменить" },
  { id: "delete", label: "Удалить" },
];

const accessTabs: Array<{
  id: AccessTab;
  label: string;
  description: string;
  icon: typeof UsersRound;
}> = [
  {
    id: "accounts",
    label: "Аккаунты",
    description: "Пользователи, которые смогут входить по телефону и паролю.",
    icon: UsersRound,
  },
  {
    id: "ministries",
    label: "Служения",
    description: "Команды и направления, к которым привязываются аккаунты.",
    icon: Settings,
  },
  {
    id: "roles",
    label: "Роли",
    description: "Наборы доступов по служениям для будущих прав сайта.",
    icon: ShieldCheck,
  },
];

const accessTabPermissions: Record<AccessTab, string[]> = {
  accounts: ["accounts:view", "accounts:create", "accounts:update", "accounts:delete"],
  ministries: ["ministries:view", "ministries:create", "ministries:update", "ministries:delete"],
  roles: ["roles:view", "roles:create", "roles:update", "roles:delete"],
};

const createPermissionByTab: Record<AccessTab, string> = {
  accounts: "accounts:create",
  ministries: "ministries:create",
  roles: "roles:create",
};

const emptyAccountForm: AccountFormState = {
  fullName: "",
  phone: "",
  password: "",
  ministryId: "",
  roleId: "",
};

const emptyMinistryForm: MinistryFormState = {
  name: "",
  description: "",
};

const emptyRoleForm: RoleFormState = {
  name: "",
  ministryId: "",
  permissions: [],
};

export function AdminAccessPanel({ onLogout, user }: AdminAccessPanelProps) {
  const visibleTabs = useMemo(
    () => accessTabs.filter((tab) => hasAnyPermission(user, accessTabPermissions[tab.id])),
    [user],
  );
  const firstVisibleTab = visibleTabs[0]?.id || "accounts";
  const [activeTab, setActiveTab] = useState<AccessTab>(firstVisibleTab);
  const [accounts, setAccounts] = useState<StaffAccount[]>([]);
  const [ministries, setMinistries] = useState<MinistryAccess[]>([]);
  const [roles, setRoles] = useState<AccessRole[]>([]);
  const [accessOptions, setAccessOptions] = useState<AccessPermission[]>([]);
  const [modal, setModal] = useState<AccessModal | null>(null);
  const [roleEditor, setRoleEditor] = useState<RoleEditorState | null>(null);
  const [accountForm, setAccountForm] = useState<AccountFormState>(emptyAccountForm);
  const [ministryForm, setMinistryForm] = useState<MinistryFormState>(emptyMinistryForm);
  const [roleForm, setRoleForm] = useState<RoleFormState>(emptyRoleForm);
  const [error, setError] = useState("");
  const [modalError, setModalError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeletingId, setIsDeletingId] = useState("");

  const activeTabMeta = visibleTabs.find((tab) => tab.id === activeTab) || visibleTabs[0] || accessTabs[0];
  const ActiveIcon = activeTabMeta.icon;
  const canAccessPanel = visibleTabs.length > 0;
  const canCreateActiveEntity = canAccessPanel && hasPermission(user, createPermissionByTab[activeTab]);
  const canUpdateAccounts = hasPermission(user, "accounts:update");
  const canDeleteAccounts = hasPermission(user, "accounts:delete");
  const canUpdateMinistries = hasPermission(user, "ministries:update");
  const canDeleteMinistries = hasPermission(user, "ministries:delete");
  const canUpdateRoles = hasPermission(user, "roles:update");
  const canDeleteRoles = hasPermission(user, "roles:delete");

  const availableRolesForAccount = useMemo(
    () => roles.filter((role) => role.ministryId === accountForm.ministryId),
    [accountForm.ministryId, roles],
  );

  const rolePermissionMap = useMemo(() => {
    return new Map(roles.map((role) => [role.id, role.permissions]));
  }, [roles]);

  useEffect(() => {
    if (!visibleTabs.some((tab) => tab.id === activeTab)) {
      setActiveTab(firstVisibleTab);
    }
  }, [activeTab, firstVisibleTab, visibleTabs]);

  const loadAccessData = useCallback(async () => {
    if (!canAccessPanel) {
      setAccounts([]);
      setMinistries([]);
      setRoles([]);
      setAccessOptions([]);
      setIsLoading(false);
      return;
    }

    setError("");
    setIsLoading(true);

    try {
      const summary = await fetchAccessControlSummary();

      setAccounts(summary.accounts);
      setMinistries(summary.ministries);
      setRoles(summary.roles);
      setAccessOptions(summary.accessOptions);
    } catch (requestError) {
      if (isUnauthorizedError(requestError)) {
        onLogout();
        return;
      }

      if (isForbiddenError(requestError)) {
        setError("Недостаточно прав для управления доступами.");
        return;
      }

      setError("Не удалось загрузить аккаунты, служения и роли.");
    } finally {
      setIsLoading(false);
    }
  }, [canAccessPanel, onLogout]);

  useEffect(() => {
    void loadAccessData();
  }, [loadAccessData]);

  const openCreateModal = () => {
    if (!canCreateActiveEntity) {
      return;
    }

    setModalError("");

    if (activeTab === "accounts") {
      setAccountForm(emptyAccountForm);
      setModal({ type: "account", mode: "create" });
      return;
    }

    if (activeTab === "ministries") {
      setMinistryForm(emptyMinistryForm);
      setModal({ type: "ministry", mode: "create" });
      return;
    }

    setRoleForm(emptyRoleForm);
    setRoleEditor({ mode: "create" });
  };

  const openEditAccount = (account: StaffAccount) => {
    if (!canUpdateAccounts) {
      return;
    }

    setAccountForm({
      fullName: account.fullName,
      phone: account.phone,
      password: "",
      ministryId: account.ministryId,
      roleId: account.roleId,
    });
    setModalError("");
    setModal({ type: "account", mode: "edit", account });
  };

  const openEditMinistry = (ministry: MinistryAccess) => {
    if (!canUpdateMinistries) {
      return;
    }

    setMinistryForm({
      name: ministry.name,
      description: ministry.description || "",
    });
    setModalError("");
    setModal({ type: "ministry", mode: "edit", ministry });
  };

  const openEditRole = (role: AccessRole) => {
    if (!canUpdateRoles) {
      return;
    }

    setRoleForm({
      name: role.name,
      ministryId: role.ministryId,
      permissions: role.permissions,
    });
    setModalError("");
    setRoleEditor({ mode: "edit", role });
  };

  const closeModal = () => {
    setModal(null);
    setModalError("");
    setAccountForm(emptyAccountForm);
    setMinistryForm(emptyMinistryForm);
  };

  const closeRoleEditor = () => {
    setRoleEditor(null);
    setModalError("");
    setRoleForm(emptyRoleForm);
  };

  const handleSaveAccount = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setModalError("");

    const isEditingAccount = modal?.type === "account" && modal.mode === "edit" && modal.account;

    if (!hasPermission(user, isEditingAccount ? "accounts:update" : "accounts:create")) {
      setModalError("Недостаточно прав для сохранения аккаунта.");
      return;
    }

    if (!accountForm.fullName.trim() || !accountForm.phone.trim() || !accountForm.ministryId || !accountForm.roleId) {
      setModalError("Заполните ФИО, телефон, служение и роль.");
      return;
    }

    if (modal?.type === "account" && modal.mode === "create" && accountForm.password.trim().length < 6) {
      setModalError("Пароль должен быть не короче 6 символов.");
      return;
    }

    setIsSaving(true);

    try {
      if (modal?.type === "account" && modal.mode === "edit" && modal.account) {
        const payload: UpdateStaffAccountInput = {
          fullName: accountForm.fullName,
          phone: accountForm.phone,
          ministryId: accountForm.ministryId,
          roleId: accountForm.roleId,
          ...(accountForm.password.trim() ? { password: accountForm.password } : {}),
        };

        await updateStaffAccount(modal.account.id, payload);
      } else {
        const payload: CreateStaffAccountInput = {
          fullName: accountForm.fullName,
          phone: accountForm.phone,
          password: accountForm.password,
          ministryId: accountForm.ministryId,
          roleId: accountForm.roleId,
        };

        await createStaffAccount(payload);
      }

      await loadAccessData();
      closeModal();
    } catch (requestError) {
      if (isUnauthorizedError(requestError)) {
        onLogout();
        return;
      }

      if (isForbiddenError(requestError)) {
        setModalError("Недостаточно прав для сохранения аккаунта.");
        return;
      }

      setModalError(getRequestErrorMessage(requestError, "Не удалось сохранить аккаунт. Проверьте телефон, пароль и выбранную роль."));
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveMinistry = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setModalError("");

    const isEditingMinistry = modal?.type === "ministry" && modal.mode === "edit" && modal.ministry;

    if (!hasPermission(user, isEditingMinistry ? "ministries:update" : "ministries:create")) {
      setModalError("Недостаточно прав для сохранения служения.");
      return;
    }

    if (!ministryForm.name.trim()) {
      setModalError("Укажите название служения.");
      return;
    }

    setIsSaving(true);

    try {
      const payload: CreateMinistryInput = {
        name: ministryForm.name,
        description: ministryForm.description,
      };

      if (modal?.type === "ministry" && modal.mode === "edit" && modal.ministry) {
        await updateMinistry(modal.ministry.id, payload);
      } else {
        await createMinistry(payload);
      }

      await loadAccessData();
      closeModal();
    } catch (requestError) {
      if (isUnauthorizedError(requestError)) {
        onLogout();
        return;
      }

      if (isForbiddenError(requestError)) {
        setModalError("Недостаточно прав для сохранения служения.");
        return;
      }

      setModalError(getRequestErrorMessage(requestError, "Не удалось сохранить служение."));
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveRole = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setModalError("");

    const isEditingRole = roleEditor?.mode === "edit" && roleEditor.role;

    if (!hasPermission(user, isEditingRole ? "roles:update" : "roles:create")) {
      setModalError("Недостаточно прав для сохранения роли.");
      return;
    }

    if (!roleForm.name.trim() || !roleForm.ministryId) {
      setModalError("Укажите название роли и служение.");
      return;
    }

    if (!roleForm.permissions.length) {
      setModalError("Выберите хотя бы один доступ для роли.");
      return;
    }

    setIsSaving(true);

    try {
      const payload: CreateAccessRoleInput = {
        name: roleForm.name,
        ministryId: roleForm.ministryId,
        permissions: roleForm.permissions,
      };

      if (roleEditor?.mode === "edit" && roleEditor.role) {
        await updateAccessRole(roleEditor.role.id, payload);
      } else {
        await createAccessRole(payload);
      }

      await loadAccessData();
      closeRoleEditor();
    } catch (requestError) {
      if (isUnauthorizedError(requestError)) {
        onLogout();
        return;
      }

      if (isForbiddenError(requestError)) {
        setModalError("Недостаточно прав для сохранения роли.");
        return;
      }

      setModalError(getRequestErrorMessage(requestError, "Не удалось сохранить роль и список доступов."));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteAccount = async (account: StaffAccount) => {
    if (!canDeleteAccounts) {
      setError("Недостаточно прав для удаления аккаунта.");
      return;
    }

    if (!window.confirm(`Удалить аккаунт ${account.fullName}?`)) {
      return;
    }

    await deleteEntity(account.id, () => deleteStaffAccount(account.id), "Не удалось удалить аккаунт.");
  };

  const handleDeleteMinistry = async (ministry: MinistryAccess) => {
    if (!canDeleteMinistries) {
      setError("Недостаточно прав для удаления служения.");
      return;
    }

    if (!window.confirm(`Удалить служение ${ministry.name}? Аккаунты и роли этого служения тоже будут удалены.`)) {
      return;
    }

    await deleteEntity(ministry.id, () => deleteMinistry(ministry.id), "Не удалось удалить служение.");
  };

  const handleDeleteRole = async (role: AccessRole) => {
    if (!canDeleteRoles) {
      setError("Недостаточно прав для удаления роли.");
      return;
    }

    if (!window.confirm(`Удалить роль ${role.name}? У аккаунтов с этой ролью она будет сброшена.`)) {
      return;
    }

    await deleteEntity(role.id, () => deleteAccessRole(role.id), "Не удалось удалить роль.");
  };

  const deleteEntity = async (id: string, action: () => Promise<void>, message: string) => {
    setIsDeletingId(id);
    setError("");

    try {
      await action();
      await loadAccessData();
    } catch (requestError) {
      if (isUnauthorizedError(requestError)) {
        onLogout();
        return;
      }

      if (isForbiddenError(requestError)) {
        setError("Недостаточно прав для этого действия.");
        return;
      }

      setError(message);
    } finally {
      setIsDeletingId("");
    }
  };

  const updateAccountForm = (field: keyof AccountFormState, value: string) => {
    setAccountForm((currentForm) => {
      const nextForm = {
        ...currentForm,
        [field]: value,
      };

      if (field === "ministryId") {
        const nextRole = roles.find((role) => role.ministryId === value);
        nextForm.roleId = nextRole?.id || "";
      }

      return nextForm;
    });
  };

  const updateRolePermission = (permissionId: string, isChecked: boolean) => {
    setRoleForm((currentForm) => {
      const [resource, action] = permissionId.split(":");
      const permissionSet = new Set(currentForm.permissions);

      if (isChecked) {
        permissionSet.add(permissionId);

        if (action !== "view") {
          permissionSet.add(`${resource}:view`);
        }
      } else {
        permissionSet.delete(permissionId);

        if (action === "view") {
          for (const permission of Array.from(permissionSet)) {
            if (permission.startsWith(`${resource}:`)) {
              permissionSet.delete(permission);
            }
          }
        }
      }

      return {
        ...currentForm,
        permissions: Array.from(permissionSet),
      };
    });
  };

  if (!canAccessPanel) {
    return (
      <section className="admin-panel">
        <div className="empty-state empty-state--compact">
          <h3>Нет доступа к управлению</h3>
          <p>Администратор пока не выдал права на аккаунты, служения или роли.</p>
        </div>
      </section>
    );
  }

  if (roleEditor) {
    return (
      <RoleEditorScreen
        form={roleForm}
        mode={roleEditor.mode}
        ministries={ministries}
        accessOptions={accessOptions}
        error={modalError}
        isSaving={isSaving}
        onSubmit={handleSaveRole}
        onClose={closeRoleEditor}
        onChange={(field, value) => setRoleForm((currentForm) => ({ ...currentForm, [field]: value }))}
        onPermissionChange={updateRolePermission}
      />
    );
  }

  return (
    <>
      <section className="access-tabs" aria-label="Разделы аккаунтов">
        {visibleTabs.map((tab) => {
          const TabIcon = tab.icon;

          return (
            <button
              className={`access-tab${activeTab === tab.id ? " access-tab--active" : ""}`}
              type="button"
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id);
                setError("");
              }}
            >
              <TabIcon size={19} aria-hidden="true" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </section>

      <header className="admin-topbar">
        <div>
          <span className="admin-kicker">Управление доступами</span>
          <h1>{activeTabMeta.label}</h1>
          <p className="access-topbar__description">{activeTabMeta.description}</p>
        </div>
        {canCreateActiveEntity ? (
          <button className="button button--primary admin-create" type="button" onClick={openCreateModal}>
            <Plus size={19} aria-hidden="true" />
            {getCreateLabel(activeTab)}
          </button>
        ) : null}
      </header>

      {error ? (
        <p className="admin-error" role="alert">
          {error}
        </p>
      ) : null}

      <section className="access-overview" aria-label="Краткая сводка">
        <article className="metric-card">
          <UsersRound size={22} aria-hidden="true" />
          <span>Аккаунты</span>
          <strong>{accounts.length}</strong>
        </article>
        <article className="metric-card">
          <Settings size={22} aria-hidden="true" />
          <span>Служения</span>
          <strong>{ministries.length}</strong>
        </article>
        <article className="metric-card">
          <ShieldCheck size={22} aria-hidden="true" />
          <span>Роли</span>
          <strong>{roles.length}</strong>
        </article>
        <article className="metric-card">
          <ClipboardList size={22} aria-hidden="true" />
          <span>Доступы</span>
          <strong>{accessOptions.length}</strong>
        </article>
      </section>

      {isLoading ? (
        <section className="admin-panel">
          <div className="empty-state empty-state--compact">
            <h3>Загружаем данные</h3>
            <p>Сейчас подтянем аккаунты, служения и роли из API.</p>
          </div>
        </section>
      ) : (
        <>
          {activeTab === "accounts" ? (
            <AccountsView
              accounts={accounts}
              roles={roles}
              rolePermissionMap={rolePermissionMap}
              accessOptions={accessOptions}
              isDeletingId={isDeletingId}
              canUpdate={canUpdateAccounts}
              canDelete={canDeleteAccounts}
              onEdit={openEditAccount}
              onDelete={handleDeleteAccount}
            />
          ) : null}
          {activeTab === "ministries" ? (
            <MinistriesView
              accounts={accounts}
              ministries={ministries}
              roles={roles}
              isDeletingId={isDeletingId}
              canUpdate={canUpdateMinistries}
              canDelete={canDeleteMinistries}
              onEdit={openEditMinistry}
              onDelete={handleDeleteMinistry}
            />
          ) : null}
          {activeTab === "roles" ? (
            <RolesView
              roles={roles}
              accessOptions={accessOptions}
              isDeletingId={isDeletingId}
              canUpdate={canUpdateRoles}
              canDelete={canDeleteRoles}
              onEdit={openEditRole}
              onDelete={handleDeleteRole}
            />
          ) : null}
        </>
      )}

      {modal?.type === "account" ? (
        <AccountModal
          form={accountForm}
          mode={modal.mode}
          ministries={ministries}
          roles={availableRolesForAccount}
          error={modalError}
          isSaving={isSaving}
          onSubmit={handleSaveAccount}
          onClose={closeModal}
          onChange={updateAccountForm}
        />
      ) : null}

      {modal?.type === "ministry" ? (
        <MinistryModal
          form={ministryForm}
          mode={modal.mode}
          error={modalError}
          isSaving={isSaving}
          onSubmit={handleSaveMinistry}
          onClose={closeModal}
          onChange={(field, value) => setMinistryForm((currentForm) => ({ ...currentForm, [field]: value }))}
        />
      ) : null}

    </>
  );
}

type AccountsViewProps = {
  accounts: StaffAccount[];
  roles: AccessRole[];
  rolePermissionMap: Map<string, string[]>;
  accessOptions: AccessPermission[];
  isDeletingId: string;
  canUpdate: boolean;
  canDelete: boolean;
  onEdit: (account: StaffAccount) => void;
  onDelete: (account: StaffAccount) => void;
};

function AccountsView({
  accounts,
  roles,
  rolePermissionMap,
  accessOptions,
  isDeletingId,
  canUpdate,
  canDelete,
  onEdit,
  onDelete,
}: AccountsViewProps) {
  return (
    <section className="admin-panel access-panel">
      <div className="admin-panel__header">
        <div>
          <span>Аккаунты</span>
          <h2>Доступ пользователей</h2>
        </div>
      </div>

      {accounts.length ? (
        <div className="access-table" role="table" aria-label="Аккаунты">
          <div className="access-table__row access-table__row--head access-table__row--accounts" role="row">
            <span role="columnheader">ФИО</span>
            <span role="columnheader">Телефон</span>
            <span role="columnheader">Служение</span>
            <span role="columnheader">Роль</span>
            <span role="columnheader">Доступы</span>
            <span role="columnheader" aria-label="Действия" />
          </div>

          {accounts.map((account) => {
            const permissions = rolePermissionMap.get(account.roleId) || [];

            return (
              <div className="access-table__row access-table__row--accounts" role="row" key={account.id}>
                <strong role="cell">{account.fullName}</strong>
                <span role="cell">{account.phone}</span>
                <span role="cell">{account.ministryName || "Нет служения"}</span>
                <span role="cell">{account.roleName || "Нет роли"}</span>
                <span role="cell">{formatPermissionSummary(permissions, accessOptions)}</span>
                <TableActions
                  isDeleting={isDeletingId === account.id}
                  canEdit={canUpdate}
                  canDelete={canDelete}
                  onEdit={() => onEdit(account)}
                  onDelete={() => onDelete(account)}
                />
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyAccessState
          title="Аккаунтов пока нет"
          text={roles.length ? "Создайте аккаунт, привяжите его к служению и роли." : "Сначала создайте служение и роль, затем появится полноценная привязка аккаунта."}
        />
      )}
    </section>
  );
}

type MinistriesViewProps = {
  accounts: StaffAccount[];
  ministries: MinistryAccess[];
  roles: AccessRole[];
  isDeletingId: string;
  canUpdate: boolean;
  canDelete: boolean;
  onEdit: (ministry: MinistryAccess) => void;
  onDelete: (ministry: MinistryAccess) => void;
};

function MinistriesView({
  accounts,
  ministries,
  roles,
  isDeletingId,
  canUpdate,
  canDelete,
  onEdit,
  onDelete,
}: MinistriesViewProps) {
  return (
    <section className="access-card-grid" aria-label="Служения">
      {ministries.length ? (
        ministries.map((ministry) => {
          const ministryRoles = roles.filter((role) => role.ministryId === ministry.id).length;
          const ministryAccounts = accounts.filter((account) => account.ministryId === ministry.id).length;

          return (
            <article className="admin-panel access-card" key={ministry.id}>
              <div className="access-card__header">
                <div className="access-card__icon">
                  <Settings size={22} aria-hidden="true" />
                </div>
                {canUpdate || canDelete ? (
                  <div className="access-card__actions">
                    {canUpdate ? (
                      <button className="icon-button" type="button" aria-label="Редактировать" onClick={() => onEdit(ministry)}>
                        <Pencil size={18} aria-hidden="true" />
                      </button>
                    ) : null}
                    {canDelete ? (
                      <button
                        className="icon-button icon-button--danger"
                        type="button"
                        aria-label="Удалить"
                        disabled={isDeletingId === ministry.id}
                        onClick={() => onDelete(ministry)}
                      >
                        <Trash2 size={18} aria-hidden="true" />
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
              <h2>{ministry.name}</h2>
              <p>{ministry.description || "Описание служения можно добавить позже."}</p>
              <div className="access-card__stats">
                <span>{ministryRoles} ролей</span>
                <span>{ministryAccounts} аккаунтов</span>
              </div>
            </article>
          );
        })
      ) : (
        <section className="admin-panel access-panel">
          <EmptyAccessState
            title="Служений пока нет"
            text="Создайте первое служение, чтобы потом привязывать к нему роли и аккаунты."
          />
        </section>
      )}
    </section>
  );
}

type RolesViewProps = {
  roles: AccessRole[];
  accessOptions: AccessPermission[];
  isDeletingId: string;
  canUpdate: boolean;
  canDelete: boolean;
  onEdit: (role: AccessRole) => void;
  onDelete: (role: AccessRole) => void;
};

function RolesView({ roles, accessOptions, isDeletingId, canUpdate, canDelete, onEdit, onDelete }: RolesViewProps) {
  return (
    <section className="admin-panel access-panel">
      <div className="admin-panel__header">
        <div>
          <span>Роли</span>
          <h2>Права по служениям</h2>
        </div>
      </div>

      {roles.length ? (
        <div className="access-table" role="table" aria-label="Роли">
          <div className="access-table__row access-table__row--head access-table__row--roles" role="row">
            <span role="columnheader">Роль</span>
            <span role="columnheader">Служение</span>
            <span role="columnheader">Доступы</span>
            <span role="columnheader">Создано</span>
            <span role="columnheader" aria-label="Действия" />
          </div>

          {roles.map((role) => (
            <div className="access-table__row access-table__row--roles" role="row" key={role.id}>
              <strong role="cell">{role.name}</strong>
              <span role="cell">{role.ministryName || "Нет служения"}</span>
              <span role="cell">{formatPermissionSummary(role.permissions, accessOptions)}</span>
              <span role="cell">{formatDateTime(role.createdAt)}</span>
              <TableActions
                isDeleting={isDeletingId === role.id}
                canEdit={canUpdate}
                canDelete={canDelete}
                onEdit={() => onEdit(role)}
                onDelete={() => onDelete(role)}
              />
            </div>
          ))}
        </div>
      ) : (
        <EmptyAccessState
          title="Ролей пока нет"
          text="Создайте роль, выберите служение и отметьте чекбоксами, куда пользователь сможет заходить."
        />
      )}
    </section>
  );
}

type AccountModalProps = {
  form: AccountFormState;
  mode: ModalMode;
  ministries: MinistryAccess[];
  roles: AccessRole[];
  error: string;
  isSaving: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
  onChange: (field: keyof AccountFormState, value: string) => void;
};

function AccountModal({
  form,
  mode,
  ministries,
  roles,
  error,
  isSaving,
  onSubmit,
  onClose,
  onChange,
}: AccountModalProps) {
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="trip-modal access-modal" role="dialog" aria-modal="true" aria-label="Аккаунт">
        <ModalHeader kicker={mode === "edit" ? "Редактирование" : "Новый аккаунт"} title={mode === "edit" ? "Изменить аккаунт" : "Создать аккаунт"} onClose={onClose} />

        <form className="trip-form" onSubmit={onSubmit}>
          <label className="form-field">
            <span>ФИО</span>
            <div className="input-shell">
              <UserRound size={19} aria-hidden="true" />
              <input
                required
                value={form.fullName}
                onChange={(event) => onChange("fullName", event.target.value)}
                placeholder="Например, Иван Петров"
              />
            </div>
          </label>

          <label className="form-field">
            <span>Телефон</span>
            <div className="input-shell">
              <Phone size={19} aria-hidden="true" />
              <input
                required
                value={form.phone}
                onChange={(event) => onChange("phone", event.target.value)}
                placeholder="+7 777 000 00 00"
              />
            </div>
          </label>

          <label className="form-field">
            <span>{mode === "edit" ? "Новый пароль" : "Пароль"}</span>
            <div className="input-shell">
              <LockKeyhole size={19} aria-hidden="true" />
              <input
                required={mode === "create"}
                type="password"
                value={form.password}
                onChange={(event) => onChange("password", event.target.value)}
                placeholder={mode === "edit" ? "Оставьте пустым, чтобы не менять" : "Минимум 6 символов"}
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

          <ModalActions isSaving={isSaving} saveLabel={mode === "edit" ? "Сохранить" : "Создать аккаунт"} onClose={onClose} />
        </form>
      </section>
    </div>
  );
}

type MinistryModalProps = {
  form: MinistryFormState;
  mode: ModalMode;
  error: string;
  isSaving: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
  onChange: (field: keyof MinistryFormState, value: string) => void;
};

function MinistryModal({ form, mode, error, isSaving, onSubmit, onClose, onChange }: MinistryModalProps) {
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="trip-modal access-modal" role="dialog" aria-modal="true" aria-label="Служение">
        <ModalHeader kicker={mode === "edit" ? "Редактирование" : "Новое служение"} title={mode === "edit" ? "Изменить служение" : "Создать служение"} onClose={onClose} />

        <form className="trip-form" onSubmit={onSubmit}>
          <label className="form-field form-field--wide">
            <span>Название</span>
            <div className="input-shell">
              <Settings size={19} aria-hidden="true" />
              <input
                required
                value={form.name}
                onChange={(event) => onChange("name", event.target.value)}
                placeholder="Например, Молодежное служение"
              />
            </div>
          </label>

          <label className="form-field form-field--wide">
            <span>Описание</span>
            <textarea
              rows={4}
              value={form.description}
              onChange={(event) => onChange("description", event.target.value)}
              placeholder="Кратко опишите, чем занимается это служение"
            />
          </label>

          {error ? (
            <p className="admin-error form-field--wide" role="alert">
              {error}
            </p>
          ) : null}

          <ModalActions isSaving={isSaving} saveLabel={mode === "edit" ? "Сохранить" : "Создать служение"} onClose={onClose} />
        </form>
      </section>
    </div>
  );
}

type RoleEditorScreenProps = {
  form: RoleFormState;
  mode: ModalMode;
  ministries: MinistryAccess[];
  accessOptions: AccessPermission[];
  error: string;
  isSaving: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
  onChange: (field: keyof RoleFormState, value: string | string[]) => void;
  onPermissionChange: (permissionId: string, isChecked: boolean) => void;
};

function RoleEditorScreen({
  form,
  mode,
  ministries,
  accessOptions,
  error,
  isSaving,
  onSubmit,
  onClose,
  onChange,
  onPermissionChange,
}: RoleEditorScreenProps) {
  const permissionRows = useMemo(() => buildPermissionRows(accessOptions), [accessOptions]);
  const permissionGroups = useMemo(
    () => Array.from(new Set(permissionRows.map((row) => row.group))),
    [permissionRows],
  );
  const [activePermissionGroup, setActivePermissionGroup] = useState("");

  useEffect(() => {
    if (!permissionGroups.length) {
      setActivePermissionGroup("");
      return;
    }

    if (!activePermissionGroup || !permissionGroups.includes(activePermissionGroup)) {
      setActivePermissionGroup(permissionGroups[0]);
    }
  }, [activePermissionGroup, permissionGroups]);

  const visiblePermissionRows = permissionRows.filter((row) => row.group === activePermissionGroup);

  return (
    <section className="admin-panel role-editor-screen" aria-label="Роль">
      <div className="role-editor-screen__header">
        <div>
          <span className="admin-kicker">{mode === "edit" ? "Редактирование" : "Новая роль"}</span>
          <h2>{mode === "edit" ? "Изменить роль" : "Создать роль"}</h2>
        </div>
        <button className="icon-button" type="button" aria-label="Закрыть" onClick={onClose}>
          <X size={21} aria-hidden="true" />
        </button>
      </div>

      <form className="role-editor" onSubmit={onSubmit}>
          <div className="role-editor__meta">
            <label className="form-field">
              <span>Название роли</span>
              <div className="input-shell">
                <ShieldCheck size={19} aria-hidden="true" />
                <input
                  required
                  value={form.name}
                  onChange={(event) => onChange("name", event.target.value)}
                  placeholder="Например, Лидер служения"
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
                  onChange={(event) => {
                    onChange("ministryId", event.target.value);
                    onChange("permissions", []);
                  }}
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
          </div>

          {form.ministryId ? (
            <div className="role-editor__workspace">
              <aside className="role-editor__sidebar" aria-label="Разделы доступов">
                {permissionGroups.map((group) => (
                  <button
                    className={`role-editor__section${activePermissionGroup === group ? " role-editor__section--active" : ""}`}
                    type="button"
                    key={group}
                    onClick={() => setActivePermissionGroup(group)}
                  >
                    {group}
                  </button>
                ))}
              </aside>

              <div className="permission-matrix" role="table" aria-label="Права роли">
                <div className="permission-matrix__row permission-matrix__row--head" role="row">
                  <span role="columnheader">Название</span>
                  {permissionActions.map((action) => (
                    <span role="columnheader" key={action.id}>
                      {action.label}
                    </span>
                  ))}
                </div>

                {visiblePermissionRows.map((row) => (
                  <div className="permission-matrix__row" role="row" key={row.resource}>
                    <strong role="cell">{row.label}</strong>
                    {permissionActions.map((action) => {
                      const permission = row.permissions[action.id];

                      return (
                        <span className="permission-matrix__cell" role="cell" key={action.id}>
                          {permission ? (
                            <label className="permission-matrix__checkbox">
                              <input
                                type="checkbox"
                                checked={form.permissions.includes(permission.id)}
                                onChange={(event) => onPermissionChange(permission.id, event.target.checked)}
                                aria-label={`${row.label}: ${action.label}`}
                              />
                            </label>
                          ) : (
                            <span className="permission-matrix__dash" aria-hidden="true">
                              -
                            </span>
                          )}
                        </span>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="form-field">
              <div className="permission-empty">
                <CheckCircle2 size={20} aria-hidden="true" />
                <span>Выберите служение, и здесь откроется таблица доступов по разделам.</span>
              </div>
            </div>
          )}

          {error ? (
            <p className="admin-error" role="alert">
              {error}
            </p>
          ) : null}

        <ModalActions isSaving={isSaving} saveLabel={mode === "edit" ? "Сохранить" : "Создать роль"} onClose={onClose} />
      </form>
    </section>
  );
}

type ModalHeaderProps = {
  kicker: string;
  title: string;
  onClose: () => void;
};

function ModalHeader({ kicker, title, onClose }: ModalHeaderProps) {
  return (
    <div className="trip-modal__header">
      <div>
        <span className="admin-kicker">{kicker}</span>
        <h2>{title}</h2>
      </div>
      <button className="icon-button" type="button" aria-label="Закрыть" onClick={onClose}>
        <X size={21} aria-hidden="true" />
      </button>
    </div>
  );
}

type ModalActionsProps = {
  isSaving: boolean;
  saveLabel: string;
  onClose: () => void;
};

function ModalActions({ isSaving, saveLabel, onClose }: ModalActionsProps) {
  return (
    <div className="trip-form__actions">
      <button className="button button--secondary button--neutral" type="button" onClick={onClose}>
        Отмена
      </button>
      <button className="button button--primary" type="submit" disabled={isSaving}>
        <Plus size={19} aria-hidden="true" />
        {isSaving ? "Сохраняем..." : saveLabel}
      </button>
    </div>
  );
}

type TableActionsProps = {
  isDeleting: boolean;
  canEdit: boolean;
  canDelete: boolean;
  onEdit: () => void;
  onDelete: () => void;
};

function TableActions({ isDeleting, canEdit, canDelete, onEdit, onDelete }: TableActionsProps) {
  if (!canEdit && !canDelete) {
    return <span className="access-table__actions access-table__actions--empty" role="cell" />;
  }

  return (
    <div className="access-table__actions" role="cell">
      {canEdit ? (
        <button className="icon-button" type="button" aria-label="Редактировать" onClick={onEdit}>
          <Pencil size={18} aria-hidden="true" />
        </button>
      ) : null}
      {canDelete ? (
        <button
          className="icon-button icon-button--danger"
          type="button"
          aria-label="Удалить"
          disabled={isDeleting}
          onClick={onDelete}
        >
          <Trash2 size={18} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}

type EmptyAccessStateProps = {
  title: string;
  text: string;
};

function EmptyAccessState({ title, text }: EmptyAccessStateProps) {
  return (
    <div className="empty-state empty-state--compact">
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}

function getCreateLabel(tab: AccessTab) {
  if (tab === "accounts") {
    return "Создать аккаунт";
  }

  if (tab === "ministries") {
    return "Создать служение";
  }

  return "Создать роль";
}

function buildPermissionRows(accessOptions: AccessPermission[]) {
  const rows = new Map<string, PermissionModuleRow>();

  for (const option of accessOptions) {
    const rowKey = `${option.group}:${option.resource}`;
    const currentRow = rows.get(rowKey) || {
      group: option.group,
      resource: option.resource,
      label: option.resourceLabel || option.label,
      permissions: {},
    };

    currentRow.permissions[option.action] = option;
    rows.set(rowKey, currentRow);
  }

  return Array.from(rows.values());
}

function formatPermissionSummary(permissionIds: string[], accessOptions: AccessPermission[]) {
  if (!permissionIds.length) {
    return "Нет доступов";
  }

  const resourceLabels = new Map<string, string>();

  for (const permissionId of permissionIds) {
    const option = accessOptions.find((item) => item.id === permissionId);

    if (option) {
      resourceLabels.set(option.resource, option.resourceLabel || option.label);
    }
  }

  const labels = Array.from(resourceLabels.values());

  if (labels.length <= 2) {
    return labels.join(", ");
  }

  return `${labels.slice(0, 2).join(", ")} и еще ${labels.length - 2}`;
}

function getRequestErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}

function formatDateTime(value?: string) {
  if (!value) {
    return "Нет даты";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Нет даты";
  }

  return new Intl.DateTimeFormat("ru", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}
