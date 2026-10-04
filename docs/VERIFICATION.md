# Weryfikacja lokalnego MVP

Uruchomiono na Windows, Node 24.21.0, npm 11.19.0.

Poniższe wcześniejsze wyniki opisują historyczne etapy prac. Aktualne reguły i najnowsze wyniki znajdują się na końcu dokumentu.

Aktualizacja grup priorytetowych: **89/89 testów**, poprawny TypeScript i build. Testy `priorities.test.ts` oraz Edge `scripts/check-priorities-ui.ts` sprawdzają brak luk, zakres kuriera/pojazdu/daty, kolejność realizacji, naprawy tras, blokady jazdy, odwrotny załadunek grup i swobodę w jednej grupie. Ten etap dotyczył wyłącznie priorytetów; bieżący cut-off i ekran kuriera opisano w późniejszych etapach.

Aktualizacja ekranu dodawania dostaw: **65/65 testów**, poprawny TypeScript i build. Nowe testy `delivery-entry.test.ts` sprawdzają zgodność CSV z formularzem, dynamiczne katalogi, atomowość podglądu i błędnego zapisu, sprzeczności i niejednoznaczności, pełną edycję, usuwanie i ochronę planu. Test Edge `scripts/check-delivery-entry-ui.ts` używa bazy w pamięci i nie resetuje danych użytkownika. Szczegóły: [DELIVERY-ENTRY.md](DELIVERY-ENTRY.md).

Weryfikacja pierwszego MVP: **28/28 testów Vitest**, poprawny typecheck i build, zakończone testy HTTP oraz Edge (desktop i 390 px). Aktualizacja modelu dostawy jest weryfikowana osobno przez `delivery-model.test.ts`.

Po dodaniu zakładek Biznesy i Flota: **51/51 testów Vitest**, poprawny TypeScript i build produkcyjny. Vite zgłasza wyłącznie ostrzeżenie rozmiaru głównego pliku JS (około 511 kB). `server/tests/catalog.test.ts` sprawdza CRUD, izolację firm, walidację godzin i parametrów technicznych, wyszukiwanie i niejednoznaczne nazwy, ochronę używanych rekordów, niezmienność współdzielonych modeli oraz migrację właścicieli biznesów.

`npx tsx scripts/check-catalog-ui.ts` uruchamia test Edge z bazą SQLite w pamięci: CRUD obu katalogów, uzupełnianie po ID i nazwie, przełączanie firmy, nawigację przy 390 px oraz brak wyjątków JavaScript. Test zachowuje dostawy i trasy i nie dotyka bazy użytkownika. Po ponownym uruchomieniu lokalnego serwera potwierdzono migrację 25 biznesów, zachowanie 33 dostaw i 5 tras; skrót zawartości dostaw, tras, postojów i rezerwacji pozostał identyczny. Kopia sprzed migracji: `server/data/demo.sqlite.pre-model-v3.sqlite`.

## Vitest

T1–T16 znajdują się w `server/tests/acceptance.test.ts`. Dodatkowe testy domenowe i integracyjne sprawdzają: kalendarz przez północ, funkcję miejsca, percentyle i wykluczenia historii, Haversine, brak mutacji wejścia planera, trwałość bazy po ponownym otwarciu, atomowy import z błędami, role API, bufor po wcześniejszym zakończeniu w bazie i domenie, offline/awarię czujników oraz czas zimowy Warszawy.

Testy nowego modelu obejmują wymagane pola dostawy, poprawność i powtarzalność priorytetów, brak usuniętych pól, istnienie biznesu/floty/kuriera, spójność nazwy biznesu, klucze obce SQLite, atomowość odmowy zapisu, usuniętą rolę w API i seedzie, migrację starszych danych z kopią bazy oraz swobodę planowania i załadunku przy jednolitej grupie lub braku priorytetów.

Wynik aktualizacji modelu: **43/43 testy Vitest**, poprawne `npm.cmd run typecheck` i `npm.cmd run build`. `node scripts/check-model-ui.mjs` potwierdził w Edge sześć dostępnych ról, przekierowanie usuniętego adresu, usunięcie dawnej roli z localStorage oraz poprawność relacji dostaw, bez resetowania istniejącej bazy. Migracja lokalnej bazy zachowała 33 dostawy przypisane pięciu kurierom dwóch firm; `foreign_key_check` nie zgłosił błędów. Kopia: `server/data/demo.sqlite.pre-model-v2.sqlite`.

Test `street.test.ts` potwierdza, że zamknięcie ulicy obejmuje wszystkie bliźniaki i blokuje jazdę do zamkniętej ulicy, a nowy slot rozpoczyna się dopiero po jej otwarciu.

## HTTP

Historyczny test smoke (obecnie zastąpiony testem izolacji sesji) sprawdzał wygenerowanie 45 dostaw i 7 tras, zachowanie przypisań CSV, pełny cykl kuriera (pojazd → załadunek → wyjazd → brama → jazda → GPS/czujnik → przybycie → doręczenie → czujnik wolne → wyjazd), aktualizację historii, zakłócenia, offline/przywrócenie, odmowę edycji przez biznes, raport, SVG QR, routing SPA i brak kolizji z buforem.

## Edge

`scripts/browser.mjs` sprawdza wybór ról, działania kuriera, podgląd biznesu bez importu, raport operatora, strony QR i ekranu miejsca, brak wyjątków JavaScript oraz brak poziomego przewijania przy 390 px. Zrzuty: `docs/screenshots/`.

Test przeglądarkowy wykrył poziome przewijanie w panelu kuriera. Naprawiono szerokość elementów siatki i potwierdzono ponownym przebiegiem.

## Ograniczenia weryfikacji

T1 uruchamia konkurujące żądania na repozytorium SQLite i sprawdza atomowe odrzucenie drugiej rezerwacji. Nie jest testem obciążeniowym wielu procesów. GPS, czujnik i ruch pozostają danymi symulatora; testy nie potwierdzają integracji ze sprzętem ani prawa obowiązującego w Krakowie. Brak testu produkcyjnego wdrożenia publicznego, które jest poza zakresem lokalnego MVP.

## Widok kuriera: własna trasa

107 testów oraz TypeScript/build: OK. `scripts/check-courier-route-ui.ts` sprawdza Edge na izolowanej bazie: tylko własne punkty i pozycję na mapie, linię trasy, style zakończony/aktualny/kolejny, pionowy postęp, planowany przyjazd i czas rozładunku, Google Maps, licznik według `s.now`, istniejące potwierdzenie doręczenia, zmianę kuriera i widok mobilny. Przerwy bez zmian. Linia mapy łączy punkty według kolejności planu; nawigacja drogowa jest dostępna przez Google Maps.

## Problemy i planowane przerwy kuriera

Uruchomiono wyłącznie testy tego kroku: `server/tests/courier-problems-breaks.test.ts` (12/12) i `scripts/check-courier-problems-ui.ts` (Edge, baza w pamięci). Sprawdzono zgłoszenia zajętego miejsca/przedłużonego rozładunku, zdarzenia i predykcje, czasy 5/10/15/20/30, tankowanie podczas jazdy, start po zakończeniu punktu, brak anulowania dostawy, trwałą niedostępność do ręcznego zakończenia, granicę 4/5 minut bufora, naprawę slotów bez zmiany przypisań, walidację API, zapis przerwy w bazie oraz ekran mobilny. TypeScript/build: OK. Pełnego zestawu testów nie uruchamiano zgodnie z poleceniem.

Zgłoszenie problemu zwiększa `expectedDeparture` o 10 minut (wyjaśnione w UI), tworzy incydent i zdarzenie oraz wywołuje istniejący predictor/repair z dotychczasową histerezą. Plan przerwy jest zapisany w `Courier.pause`; nie zmienia przypisania dostaw ani nie zastępuje aktualnego punktu. Koniec oczekiwanego czasu nie kończy przerwy automatycznie. `Skończ przerwę` uruchamia 5-minutowy bufor według `s.now`; podczas przerwy/bufora nie wybieramy nowego celu i nie naliczamy no-show kurierowi czasowo niedostępnemu.

## Izolacja Symulatora

125/125 testów i TypeScript/build: OK. Nowe testy potwierdzają pełne sesje scenariuszowe/losowe bez zmiany dokumentu State ani żadnego rekordu tabel SQLite, niezależność sesji, reset, stop, ruch kuriera, ukończenie trasy, cooldown i powtarzalność losowania. Edge: wybór firmy/kuriera, własna mapa, live, konflikty, reset, oba tryby, mobilny ekran i powrót do firmy bez zmiany danych. Stare endpointy Symulatora zapisujące główną bazę usunięto; smoke/browser korzystają z własnych sesji. Szczegóły: SIMULATOR.md.

## Końcowy audyt specyfikacji

127/127 testów w 13 plikach: OK. TypeScript/build: OK; wyłącznie ostrzeżenie Vite o rozmiarze bundla. Siedem izolowanych testów Edge: katalogi, dostawy ręczne/CSV, daty i północ, priorytety, własna trasa, problemy/przerwy oraz Symulator — OK. Główna SQLite: user_version=5, integrity_check=ok, foreign_key_check bez błędów, 45 dostaw i 7 tras; brak dawnych pól w aktualnych dostawach, seedach i CSV.

Usunięto wzmiankę o dawnym polu w UI oraz poprawiono przestarzałe opisy czasu, migracji i testów. Zablokowano zmianę pojazdu po zamknięciu dnia: kurier potwierdza pojazd przypisany przez firmę. Test audytu potwierdza niezmienność zamkniętych dostaw przy potwierdzeniu pojazdu i zachowanie kurierów/pojazdów przez planowanie i naprawy.

Nazwy usuniętych pól i roli pozostają wyłącznie w migracji kompatybilności oraz testach odrzucenia i migracji starszych danych; nie są częścią aktywnego modelu. Wartości 18:00 w godzinach otwarcia biznesów nie są cut-off i pozostają prawidłowe. Archiwalne kopie bazy pozostawiono nienaruszone.

## Rozbudowane dane demo

129/129 testów w 14 plikach: OK. TypeScript/build: OK; standardowe ostrzeżenie Vite o rozmiarze bundla. Seed uruchomiony od zera: 5 firm, 18 kurierów, 24 pojazdy, 45 biznesów, 14 miejsc, 198 dostaw na siedem dni oraz 500 próbek ServiceTimeHistory. SQLite: integrity_check=ok, foreign_key_check bez błędów. Dotychczasowa baza zachowana w demo.sqlite.before-expanded-demo.sqlite.

Testy demo-seed sprawdzają relacje, własność, kalendarz, priorytety, przyszłe deklaracje i poprawne/błędne CSV. Lokalny serwer oraz Edge potwierdzają katalogi pięciu firm, zachowanie wyboru firmy pomiędzy zakładkami, rozładunek w toku i widok mobilny. Szczegóły danych: [DEMO-DATA.md](DEMO-DATA.md).
