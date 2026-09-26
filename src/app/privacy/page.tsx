import Link from 'next/link'
import { ContactLink, LegalPage, Section } from '@/components/legal/legal-page'

export const metadata = { title: 'Privacybeleid' }
export const dynamic = 'force-dynamic'

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacybeleid"
      updated="26 september 2026"
      intro={
        <p>
          Snatzee houdt je Yahtzee-scores bij, op de website en in de iOS-app. Hieronder staat welke
          gegevens daarvoor nodig zijn, wie ze kan zien en wat je er zelf over te zeggen hebt. Kort
          gezegd: alleen wat de app nodig heeft, geen advertenties, geen tracking en niets wordt
          verkocht.
        </p>
      }
    >
      <Section title="Wie is verantwoordelijk">
        <p>
          Snatzee wordt beheerd door een particuliere beheerder. Vragen over je gegevens of dit
          beleid kun je sturen naar <ContactLink />.
        </p>
      </Section>

      <Section title="Welke gegevens we bewaren">
        <ul>
          <li>
            <strong>Account:</strong> je e-mailadres en je wachtwoord (alleen versleuteld
            opgeslagen). Log je in met Apple, dan bewaren we de koppeling met je Apple ID en het
            e-mailadres dat Apple doorgeeft — dat kan een anoniem doorstuuradres zijn.
          </li>
          <li>
            <strong>Profiel:</strong> je username, weergavenaam en, als je die invult, je bio en
            profielfoto. Ook of je profiel privé is.
          </li>
          <li>
            <strong>Spelgegevens:</strong> je scores, of je won, het aantal Yahtzees, het ingevulde
            scoreblad, de datum en een eventuele notitie. Daaruit volgen je statistieken, level en
            achievements.
          </li>
          <li>
            <strong>Contacten binnen Snatzee:</strong> vrienden en vriendverzoeken, groepen waar je
            lid van bent, spelers die je blokkeert en meldingen die je doet.
          </li>
          <li>
            <strong>Meldingen:</strong> zet je pushmeldingen aan, dan bewaren we het adres waarop je
            apparaat of browser ze ontvangt.
          </li>
          <li>
            <strong>Technisch:</strong> de server houdt tijdelijk logs bij (zoals IP-adressen) om
            misbruik te voorkomen en storingen op te lossen.
          </li>
        </ul>
        <p>Instellingen zoals geluid en trillen worden alleen op je eigen apparaat opgeslagen.</p>
      </Section>

      <Section title="Waarvoor we ze gebruiken">
        <p>
          Alleen om Snatzee te laten werken: je aanmelden, je scores en statistieken tonen,
          ranglijsten, vrienden en groepen, meldingen versturen en misbruik tegengaan. De grondslag
          is de uitvoering van de overeenkomst met jou (je gebruikt de app) en, voor beveiliging en
          moderatie, ons gerechtvaardigd belang.
        </p>
      </Section>

      <Section title="Wie wat kan zien">
        <ul>
          <li>
            Je username, weergavenaam, profielfoto en je cijfers in de ranglijsten zijn zichtbaar
            voor andere spelers.
          </li>
          <li>
            Je bio, achievements en laatste potjes zijn zichtbaar op je publieke profiel, tenzij je
            profiel privé is: dan zien alleen je vrienden die details.
          </li>
          <li>Je scoreblad en notities zie alleen jij.</li>
          <li>Wie je blokkeert, ziet je niet meer in zoeken, ranglijsten en meldingen.</li>
        </ul>
      </Section>

      <Section title="Met wie we gegevens delen">
        <p>
          We verkopen niets en tonen geen advertenties. Er is geen tracking of analytics van derden.
          Wel werken we met:
        </p>
        <ul>
          <li>de server waarop Snatzee draait, in beheer van de beheerder;</li>
          <li>een e-mailprovider, om bevestigings- en inlogmails te versturen;</li>
          <li>Apple, voor inloggen met Apple en pushmeldingen op iPhone;</li>
          <li>
            de pushdienst van je browser (bijvoorbeeld van Google, Mozilla of Apple), als je
            meldingen op de website aanzet.
          </li>
        </ul>
      </Section>

      <Section title="Hoe lang we ze bewaren">
        <p>
          Zolang je account bestaat. Verwijder je je account (in de app of op de website onder
          Instellingen → Account verwijderen), dan worden je profiel, scores, vriendschappen,
          groepslidmaatschappen, profielfoto en pushadressen direct gewist. Log je in met Apple, dan
          trekken we ook de toegang van Snatzee tot je Apple ID in. Meldingen die jij over anderen
          deed, blijven zonder jouw naam bewaard zodat beheerders ze kunnen afhandelen.
        </p>
      </Section>

      <Section title="Jouw rechten">
        <p>
          Je kunt je gegevens inzien en de meeste zelf aanpassen of verwijderen in de app. Voor een
          kopie van je gegevens, correctie, bezwaar of andere vragen kun je mailen naar{' '}
          <ContactLink />. Ben je niet tevreden over hoe we met je gegevens omgaan, dan kun je een
          klacht indienen bij de Autoriteit Persoonsgegevens.
        </p>
      </Section>

      <Section title="Beveiliging">
        <p>
          Alle verbindingen zijn versleuteld (https). De database geeft elke speler alleen toegang
          tot wat die speler mag zien, en wachtwoorden worden nooit leesbaar opgeslagen.
        </p>
      </Section>

      <Section title="Wijzigingen">
        <p>
          Verandert dit beleid, dan passen we deze pagina en de datum hierboven aan. Zie ook de{' '}
          <Link href="/voorwaarden" className="font-semibold text-ink underline underline-offset-4">
            voorwaarden
          </Link>
          .
        </p>
      </Section>
    </LegalPage>
  )
}
