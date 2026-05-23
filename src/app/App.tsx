import { useCallback, useEffect, useState } from "react";
import { Footer } from "../widgets/Footer";
import { Header } from "../widgets/Header";
import { AboutSection } from "../sections/AboutSection";
import { ContactSection } from "../sections/ContactSection";
import { HeroSection } from "../sections/HeroSection";
import { MissionSection } from "../sections/MissionSection";
import { MinistrySection } from "../sections/MinistrySection";
import { TripsSection } from "../sections/TripsSection";
import { AdminPanel } from "../pages/AdminPanel";
import { ApplyPage } from "../pages/ApplyPage";
import { LoginPage } from "../pages/LoginPage";
import {
  type AuthUser,
  clearLegacyAuthData,
  getCurrentUser,
  hasAccessToken,
  signOutAdmin,
  verifyAdminSession,
} from "../shared/lib/auth";
import { type AppRoute, appPath, getRouteFromLocation } from "../shared/lib/routes";
import { useScrollReveal } from "../shared/hooks/useScrollReveal";

type LandingPageProps = {
  loginHref: string;
  onLoginClick: () => void;
};

function LandingPage({ loginHref, onLoginClick }: LandingPageProps) {
  useScrollReveal();

  return (
    <>
      <Header loginHref={loginHref} onLoginClick={onLoginClick} />
      <main>
        <HeroSection />
        <AboutSection />
        <MissionSection />
        <MinistrySection />
        <TripsSection loginHref={loginHref} onLoginClick={onLoginClick} />
        <ContactSection />
      </main>
      <Footer />
    </>
  );
}

export function App() {
  const [route, setRoute] = useState<AppRoute>(() => getRouteFromLocation());
  const [isAuthenticated, setIsAuthenticated] = useState(() => hasAccessToken());
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(() => getCurrentUser());
  const [isCheckingSession, setIsCheckingSession] = useState(() => hasAccessToken());

  const navigateTo = useCallback((nextRoute: AppRoute) => {
    window.history.pushState({}, "", appPath(nextRoute));
    setRoute(nextRoute);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const goHome = useCallback(() => navigateTo("/"), [navigateTo]);
  const goLogin = useCallback(() => navigateTo("/login"), [navigateTo]);
  const handleLoginSuccess = useCallback(() => {
    setIsAuthenticated(true);
    setCurrentUser(getCurrentUser());
    navigateTo("/admin");
  }, [navigateTo]);
  const handleLogout = useCallback(() => {
    signOutAdmin();
    setIsAuthenticated(false);
    setCurrentUser(null);
    navigateTo("/login");
  }, [navigateTo]);

  useEffect(() => {
    clearLegacyAuthData();

    const handlePopState = () => {
      setRoute(getRouteFromLocation());
      setIsAuthenticated(hasAccessToken());
      setCurrentUser(getCurrentUser());
    };

    window.addEventListener("popstate", handlePopState);

    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function checkSession() {
      if (!hasAccessToken()) {
        setIsAuthenticated(false);
        setCurrentUser(null);
        setIsCheckingSession(false);
        return;
      }

      setIsCheckingSession(true);
      const user = await verifyAdminSession();

      if (!isMounted) {
        return;
      }

      setCurrentUser(user);
      setIsAuthenticated(Boolean(user));
      setIsCheckingSession(false);
    }

    void checkSession();

    return () => {
      isMounted = false;
    };
  }, []);

  const homeHref = appPath("/");
  const loginHref = appPath("/login");

  if (route === "/login") {
    return <LoginPage homeHref={homeHref} onBack={goHome} onSuccess={handleLoginSuccess} />;
  }

  if (route === "/apply") {
    return <ApplyPage homeHref={homeHref} onHome={goHome} />;
  }

  if (route === "/admin") {
    if (isCheckingSession) {
      return <AuthLoadingPage />;
    }

    if (!isAuthenticated || !currentUser) {
      return <LoginPage homeHref={homeHref} onBack={goHome} onSuccess={handleLoginSuccess} />;
    }

    return <AdminPanel homeHref={homeHref} onHome={goHome} onLogout={handleLogout} user={currentUser} />;
  }

  return <LandingPage loginHref={loginHref} onLoginClick={goLogin} />;
}

function AuthLoadingPage() {
  return (
    <main className="auth-page">
      <section className="auth-card auth-card--loading" aria-live="polite">
        <div className="auth-card__header">
          <div>
            <span>Admin</span>
            <h2>Проверяем доступ</h2>
          </div>
        </div>
      </section>
    </main>
  );
}
