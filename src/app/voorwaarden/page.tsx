import Link from 'next/link'
import { ContactLink, LegalPage, Section } from '@/components/legal/legal-page'

export const metadata = { title: 'Voorwaarden' }
export const dynamic = 'force-dynamic'

export default function TermsPage() {
  return (
    <LegalPage
      title="Voorwaarden"
      updated="26 september 2026"
      intro={
        <p>
          Door een account te maken of Snatzee te gebruiken, op de website of in de iOS-app, ga je
          akkoord met deze voorwaarden.
        </p>
      }
    >
      <Section title="Het gebruik">
        <p>
          Snatzee is een gratis app om je Yahtzee-scores bij te houden en te vergelijken met
          vrienden. Je bent zelf verantwoordelijk voor je account en je inloggegevens. Eén account
          per persoon.
        </p>
      </Section>

      <Section title="Gedragsregels">
        <p>
          Snatzee is er voor iedereen die van een potje Yahtzee houdt. Voor aanstootgevende inhoud
          en onaangenaam gedrag is <strong>geen enkele ruimte</strong>. Het is niet toegestaan om:
        </p>
        <ul>
          <li>
            een aanstootgevende, beledigende of misleidende username, naam, bio of profielfoto te
            gebruiken;
          </li>
          <li>andere spelers te intimideren, te pesten, te bedreigen of te discrimineren;</li>
          <li>seksuele, gewelddadige of haatdragende inhoud te plaatsen;</li>
          <li>spam te versturen of je voor te doen als iemand anders;</li>
          <li>met opzet verzonnen scores in te voeren om in de ranglijsten te komen;</li>
          <li>
            de app of de server te misbruiken, te overbelasten of te proberen binnen te dringen.
          </li>
        </ul>
      </Section>

      <Section title="Melden en blokkeren">
        <p>
          Zie je iets dat niet door de beugel kan? Open het profiel van de speler en kies{' '}
          <strong>Melden</strong>. Een beheerder bekijkt elke melding, in de regel binnen 24 uur.
          Met <strong>Blokkeren</strong> haal je iemand direct uit je zoekresultaten, ranglijsten en
          meldingen; een vriendschap vervalt dan ook.
        </p>
      </Section>

      <Section title="Moderatie">
        <p>
          Beheerders mogen inhoud die tegen deze regels ingaat aanpassen of verwijderen, scores uit
          de ranglijsten halen en accounts tijdelijk of definitief blokkeren, zonder voorafgaande
          waarschuwing.
        </p>
      </Section>

      <Section title="Je eigen inhoud">
        <p>
          Wat je invult (je naam, foto, bio en scores) blijft van jou. Je geeft Snatzee alleen
          toestemming om het te bewaren en te tonen voor zover de app dat nodig heeft, zoals
          beschreven in het{' '}
          <Link href="/privacy" className="font-semibold text-ink underline underline-offset-4">
            privacybeleid
          </Link>
          .
        </p>
      </Section>

      <Section title="Geen garanties">
        <p>
          Snatzee wordt met zorg gemaakt, maar wordt aangeboden zoals het is. We doen ons best om de
          app beschikbaar te houden en je gegevens te bewaren, maar kunnen niet garanderen dat dat
          altijd lukt. Voor zover de wet dat toestaat, zijn we niet aansprakelijk voor schade door
          het gebruik van de app.
        </p>
      </Section>

      <Section title="Stoppen">
        <p>
          Je kunt je account altijd zelf verwijderen via Instellingen → Account verwijderen. Wij
          kunnen je account beëindigen als je je niet aan deze voorwaarden houdt, of de dienst
          stoppen.
        </p>
      </Section>

      <Section title="Overig">
        <p>
          Op deze voorwaarden is Nederlands recht van toepassing. Wijzigen ze, dan passen we deze
          pagina aan. Vragen? Mail naar <ContactLink />.
        </p>
      </Section>
    </LegalPage>
  )
}
