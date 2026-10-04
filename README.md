# Histereza — miejska koordynacja dostaw

Lokalne MVP dla hipotetycznych miejsc w historycznym centrum Krakowa. Wspólny planer ustala kolejność dostaw przypisanych przez firmę do kurierów, rezerwuje miejsca i automatycznie naprawia konflikty. Nie ma ręcznej edycji planu ani pierwszeństwa wynikającego z płatności.

## Uruchomienie na Windows (PowerShell)

Wymagane Node.js 24 i npm. W terminalu VS Code:

```powershell
npm.cmd ci
npm.cmd run build
npm.cmd start
```

Otwórz **http://localhost:3001**. `start` uruchamia Express, który udostępnia API i zbudowany frontend. Zatrzymanie: `Ctrl+C`. Ponowne uruchomienie zachowuje dane SQLite. Zależności zostały już zainstalowane w obecnym workspace.

Tryb programistyczny z automatycznym odświeżaniem:

```powershell
npm.cmd run dev
```

## Pierwszy scenariusz

1. Otwórz **Symulator** i wybierz firmę oraz jej kuriera.
2. Wybierz gotowy scenariusz albo losową symulację i kliknij **Przygotuj sesję**.
3. Kliknij **Uruchom symulację**. Pozycja i obsługa punktów zmieniają się według własnego zegara sesji.
4. Mapa, plan, oś czasu i log pokazują wyłącznie wybranego kuriera. Zdarzenia pokazują konflikt, propozycję i zastosowaną naprawę.
5. **Zatrzymaj symulację**, **Reset symulatora** i **Nowa sesja** dotyczą tylko demonstracji.

Dane Symulatora są w pamięci serwera, bez dostępu do SQLite głównej aplikacji. Zmiana zakładki zatrzymuje sesję. Restart serwera usuwa sesje demonstracyjne, zachowując główną bazę. Szczegóły scenariuszy i konfiguracji: [docs/SIMULATOR.md](docs/SIMULATOR.md).

## Import własnego CSV

Panel firmy → wybierz firmę i przyszły dzień → pobierz przykładowy CSV → wczytaj go → **Sprawdź wiersze** → **Importuj zweryfikowane dostawy**. Deklaracje można zmieniać do końca poprzedniego dnia. Zegar systemowy/symulowany automatycznie zamyka dzień o 00:00 i generuje trasy dla kurierów; kolejność importów nie nadaje pierwszeństwa. Nawigacja pokazuje dwa poprzednie dni, dzisiaj i trzy kolejne dni. Historia i dzień bieżący są tylko do podglądu.

Wymagane kolumny:

```csv
externalRef,businessId,businessName,date,cargoType,priority,courierId,vehicleId,opens,closes
D1,business1,Lokal demonstracyjny 1,2026-10-07,standard,0,courier1,vehicle1,07:00,23:59
```

`cargoType`: `standard`, `fresh`, `cold`. `businessId` wskazuje istniejący biznes, a `businessName` odpowiada jego nazwie. `vehicleId` wskazuje istniejący pojazd floty. Kurier oraz pojazd muszą należeć do wskazanej firmy. Każdy kurier używa jednego pojazdu w danym dniu. Godziny pracy są danymi firmy, zapisanymi także przy konkretnej dostawie, dzięki czemu dwie firmy nie nadpisują wzajemnie swoich ograniczeń. `priority` może być puste (brak priorytetu) lub wskazywać grupę 1, 2, 3… . Grupy muszą być ciągłe dla kuriera, pojazdu i daty; kilka dostaw może mieć ten sam numer. Niższe grupy realizujemy wcześniej, a dostawy bez priorytetu po grupach numerowanych. W grupie pozostaje dotychczasowa optymalizacja. Załadunek grup jest odwrotny do realizacji, a ułożenie paczek wewnątrz grupy dowolne. Jedna grupa lub brak priorytetów oznacza swobodny dostęp.

System obsługuje kurierów firmowych. Odbiorca ma wyłącznie podgląd dostaw i powiadomień.

## Testy

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
```

Testy Vitest zawierają T1–T16 oraz dodatkowe przypadki graniczne. Transakcje i blokady rezerwacji są sprawdzane w prawdziwym SQLite, nie w mocku.

Przy działającym serwerze:

```powershell
npm.cmd run test:smoke
npm.cmd run test:browser
```

Oba testy integracyjne korzystają z izolowanego Symulatora i nie resetują głównej bazy. Test przeglądarkowy wymaga Microsoft Edge, sprawdza ekran na komputerze i przy szerokości 390 px.

## Struktura i trwałość

- `shared/src`: typy, Zod, konfiguracja, powody odmów.
- `server/src/domain`: czyste reguły, kalendarz, estymator, heurystyka z lokalną poprawą, równa alokacja, predykcja i naprawy, obecność, postój QR, raport równości, użycie.
- `server/src/services`: wdrażanie wyników domenowych, planowanie i przebieg dnia.
- `server/src/db`: schema, transakcje `BEGIN IMMEDIATE`, repozytorium, generator deterministycznego seedu.
- `server/src/sim`: jedyne źródło czasu i scenariusze.
- `client/src/pages`: ekrany firmy, kuriera, biznesu, kierowcy QR i operatora/symulatora.
- `server/data/demo.sqlite`: baza tworzona przy pierwszym starcie, ignorowana przez Git. Encje przechowuje dokument stanu, kalendarz rezerwacji tabela z triggerami blokującymi kolizje i bufor, a dostawy osobna tabela z kluczami obcymi do biznesów, floty i kurierów. Zapis tych danych odbywa się w jednej transakcji.
- `server/data/seed/reference.json`, `server/data/samples/*.csv`: automatycznie generowane fikcyjne dane (5 firm, 18 kurierów, 24 pojazdy, 45 biznesów, 14 miejsc, 198 dostaw i 500 historycznych postojów). Seed od zera, daty i przypadki demonstracyjne: [docs/DEMO-DATA.md](docs/DEMO-DATA.md).

<<<<<<< HEAD
## Granice MVP

System jest lokalnym demonstratorem zgodnie ze specyfikacją. Przełącznik ról i nagłówek `x-role` nie są logowaniem. Serwer nasłuchuje wyłącznie na `127.0.0.1`. Nie udostępniaj go publicznie bez uwierzytelniania i autoryzacji użytkowników.

GPS, czujniki, SMS, ruch i płatności są symulowane; powiadomienia są zapisywane w systemie. QR prowadzi do lokalnego adresu — telefon nie uzyska do niego dostępu przez własne `localhost`. Mapy korzystają z kafelków OpenStreetMap i wymagają internetu; pozostałe dane i logika działają lokalnie. Hub rowerowy oraz tryb pozagodzinny są odroczone jako SHOULD. Reguły SCT są demonstracyjnymi regułami ze specyfikacji.

Decyzje i rozstrzygnięcia sprzeczności: [docs/DECISIONS.md](docs/DECISIONS.md). Szczegółowa weryfikacja: [docs/VERIFICATION.md](docs/VERIFICATION.md).

Przy otwarciu starszej bazy aktualna migracja wykonuje kopię `server/data/demo.sqlite.pre-model-v5.sqlite`. Bazy sprzed wersji 2 przechodzą także migrację dostaw: usunięcie dawnych uczestników spoza firm, uzupełnienie nazwy biznesu i nadanie starszym dostawom priorytetu `0`. Wersja 3 przypisuje istniejące biznesy do firmy zapisanej jako źródło godzin; przy braku takiej firmy używa pierwszej istniejącej firmy. Wersja 4 usuwa dawne pola i zamienia starsze numery z lukami na ciąg 1…N w obrębie kuriera, pojazdu i daty. Wersja 5 zamyka dni osobno o 00:00, zachowuje bieżące i historyczne trasy oraz przywraca przedwcześnie zaplanowane przyszłe dostawy do deklaracji. Migracja nie resetuje bazy; przypisania kurierów pozostają bez zmian.

Panel firmy ma zakładki **Dostawy**, **Biznesy** i **Flota**. Biznesy i pojazdy można dodawać, edytować i usuwać w obrębie wybranej firmy. Wyszukiwanie biznesu po ID lub pełnej nazwie uzupełnia formularz; przy kilku jednakowych nazwach trzeba wskazać konkretny rekord. Flota przechowuje model, wymiary, ładowność, DMC, paliwo, normę Euro, rok produkcji, chłodnię i potwierdzenie wymiarów. Usunięcie rekordów wykorzystywanych przez dostawy jest blokowane. Parametry wpływające na aktywny plan można zmienić po zakończeniu dostaw.

Zakładka Dostawy oferuje równorzędny **Import CSV** i **Dodaj ręcznie**, tworzenie biznesów i pojazdów w trakcie dodawania dostawy oraz listę z edycją i usuwaniem przygotowanych rekordów. Import jest atomowy: błędny wiersz blokuje także zapis nowych katalogów. Planner respektuje grupy priorytetowe; cut-off działa automatycznie o 00:00; kurier widzi własną trasę i może zgłaszać problemy oraz planować przerwy. Szczegóły kolumn CSV, przykładów i ograniczeń edycji: [docs/DELIVERY-ENTRY.md](docs/DELIVERY-ENTRY.md).
=======
>>>>>>> 7f4db3094ff801bf84744e59a33791300eac0b18
