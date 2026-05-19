import { Footer } from "../widgets/Footer";
import { Header } from "../widgets/Header";
import { AboutSection } from "../sections/AboutSection";
import { ContactSection } from "../sections/ContactSection";
import { HeroSection } from "../sections/HeroSection";
import { MissionSection } from "../sections/MissionSection";
import { MinistrySection } from "../sections/MinistrySection";
import { TripsSection } from "../sections/TripsSection";
import { useScrollReveal } from "../shared/hooks/useScrollReveal";

export function App() {
  useScrollReveal();

  return (
    <>
      <Header />
      <main>
        <HeroSection />
        <AboutSection />
        <MissionSection />
        <MinistrySection />
        <TripsSection />
        <ContactSection />
      </main>
      <Footer />
    </>
  );
}
