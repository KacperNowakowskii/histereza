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

1. Wybierz **Symulator**, kliknij **Przygotuj demo · 45 dostaw**. Tworzy 7 tras dla 45 dostaw; kurierzy pozostają zgodni z CSV. Jeśli demo jest już przygotowane, nie klikaj ponownie.
2. Przełącz na **Kurier firmowy**, wybierz kuriera, potwierdź pojazd, załadunek, wyjazd, następnie **Jadę**. Lokal jest od tej chwili zamrożony.
3. W **Symulatorze** ustaw czas na początek slotu przyciskiem `+1 min`/`+5 min`. Wybierz tego samego kuriera i jego miejsce, kliknij **Kurier przy miejscu · zajęte**.
4. W panelu kuriera kliknij **Jestem na miejscu**, następnie po rozładunku **Potwierdzam doręczenia**.
5. W symulatorze ustaw **Kurier wyjechał · wolne**, a następnie u kuriera **Wyjeżdżam z miejsca**. Wróci brama decyzyjna.
6. Sprawdź zakłócenia: opóźnienie, przedłużony rozładunek (kurier musi już obsługiwać postój), obcy pojazd, zamknięcie miejsca, offline i awaria czujnika. Predykcja działa w każdym ticku; standardowe naprawy czekają 3 min, wymuszone reagują od razu.

Zegar jest ręcznym zegarem symulacji. Polling co 2 s pobiera stan, ale nie przesuwa czasu. W każdej chwili **Reset demo** usuwa demonstracyjne dane po potwierdzeniu.

## Import własnego CSV

Panel firmy → wybierz firmę → pobierz przykładowy CSV → wczytaj go → **Sprawdź wiersze** → **Importuj zweryfikowane dostawy**. Powtórz dla pozostałych firm przed cut-off. Dopiero potem **Uruchom cut-off**. Przycisk symuluje moment D-1 18:00 i przeprowadza wspólną alokację; kolejność importów nie nadaje pierwszeństwa.

Wymagane kolumny:

```csv
externalRef,businessId,date,cargoType,quantity,courierId,vehicleId,mustFollow,opens,closes
D1,business1,2026-10-07,standard,1,courier1,vehicle1,,07:00,23:59
```

`cargoType`: `standard`, `fresh`, `cold`. `mustFollow` jest numerem `externalRef` wcześniejszej dostawy tego samego kuriera i dnia. Kurier oraz pojazd muszą należeć do wskazanej firmy. Każdy kurier używa jednego pojazdu w danym dniu. Godziny pracy są danymi firmy, zapisanymi także przy konkretnej dostawie, dzięki czemu dwie firmy nie nadpisują wzajemnie swoich ograniczeń. MVP przyjmuje 10 kg na jednostkę ilości do walidacji ładowności.

Kurier samodzielny ma osobne widoki **Moje dostawy** i **Ekran kuriera**. Odbiorca ma wyłącznie podgląd dostaw i powiadomień.

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

**Uwaga: oba testy integracyjne resetują lokalne dane demo.** Test przeglądarkowy wymaga Microsoft Edge. Sprawdza ekrany na komputerze i przy szerokości 390 px; zapisuje PNG do `docs/screenshots/`. Nie wymaga pobierania osobnej przeglądarki.

## Struktura i trwałość

- `shared/src`: typy, Zod, konfiguracja, powody odmów.
- `server/src/domain`: czyste reguły, kalendarz, estymator, heurystyka z lokalną poprawą, równa alokacja, predykcja i naprawy, obecność, postój QR, raport równości, użycie.
- `server/src/services`: wdrażanie wyników domenowych, planowanie i przebieg dnia.
- `server/src/db`: schema, transakcje `BEGIN IMMEDIATE`, repozytorium, generator deterministycznego seedu.
- `server/src/sim`: jedyne źródło czasu i scenariusze.
- `client/src/pages`: ekrany firmy, kuriera, biznesu, kierowcy QR i operatora/symulatora.
- `server/data/demo.sqlite`: baza tworzona przy pierwszym starcie, ignorowana przez Git. Encje przechowuje dokument stanu, a kalendarz rezerwacji dodatkowo tabela z triggerami blokującymi kolizje i bufor.
- `server/data/seed/reference.json`, `server/data/samples/*.csv`: automatycznie generowane fikcyjne dane (8 miejsc, 25 lokali, 7 kurierów, 9 pojazdów, 300 historycznych postojów).

