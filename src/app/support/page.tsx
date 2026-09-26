import { ContactLink, LegalPage, Section } from '@/components/legal/legal-page'

export const metadata = { title: 'Support' }
export const dynamic = 'force-dynamic'

export default function SupportPage() {
  return (
    <LegalPage
      title="Support"
      intro={
        <p>
          Loop je ergens tegenaan in Snatzee, of heb je een idee? Mail naar <ContactLink /> en
          vertel wat je deed, wat er gebeurde en of het op de website of in de iOS-app was.
        </p>
      }
    >
      <Section title="Ik kan niet inloggen">
        <p>
          Controleer of je het e-mailadres gebruikt waarmee je je registreerde, of log in met Apple
          als je je zo hebt aangemeld. Kreeg je geen bevestigingsmail? Kijk dan ook in je
          spamfolder.
        </p>
      </Section>

      <Section title="Ik krijg geen pushmeldingen">
        <p>
          Zet in Snatzee onder Profiel → Instellingen de pushmeldingen aan en stuur een testmelding.
          Komt die niet aan, controleer dan of meldingen voor Snatzee aanstaan in de instellingen
          van je iPhone of browser.
        </p>
      </Section>

      <Section title="Een speler melden of blokkeren">
        <p>
          Open het profiel van de speler en kies Melden of Blokkeren. Geblokkeerde spelers kun je
          terugvinden en deblokkeren onder Instellingen → Privacy.
        </p>
      </Section>

      <Section title="Mijn account verwijderen">
        <p>
          Ga naar Profiel → Instellingen → Account verwijderen. Je profiel, scores en alle andere
          gegevens worden dan direct en definitief gewist.
        </p>
      </Section>
    </LegalPage>
  )
}
