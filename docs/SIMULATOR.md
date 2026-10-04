# Izolowany Symulator

`/api/sim` obsługuje wyłącznie demonstracyjne sesje w pamięci. Router nie przyjmuje `Repo` i nie ma dostępu do głównego SQLite. Każda sesja ma osobny `State`, zegar, losowania, log i kopię początkową. Odpowiedzi API są kopiami. Nie kopiujemy dostaw użytkownika: domyślne dane pochodzą z generatora demonstracyjnego.

Wybierz firmę, jej kuriera i tryb. Live przesuwa czas o 1/5/15 minut na sekundę, można też wykonać krok. Zatrzymanie wstrzymuje zegar. Reset przywraca tylko stan początkowy sesji i zatrzymuje ją. Wyjście z zakładki zatrzymuje sesję; restart serwera usuwa sesje. Mapa pokazuje wyłącznie trasę wybranego kuriera. Pozostali demonstracyjni kurierzy poruszają się w tle, aby wspólne miejsca generowały rzeczywiste konflikty domenowe.

Planowanie: `saveDelivery` i `closeDueDeliveryDays`. Przebieg dnia: `courierAction`, `canDrive`, GPS/czujniki demonstracyjne. Konflikty: istniejące `tick`, `predict`, `repair`, wraz z histerezą i zamrożonym celem. Pozycja między punktami jest interpolacją demonstracyjną według istniejącego `travelMin`, a nie pozycją z urządzenia GPS. Przerwa korzysta z istniejącego mechanizmu zakończenia i 5-minutowego bufora; demonstracyjny kierowca potwierdza jej koniec po zadanym czasie.

## Scenariusze jako pliki

Dodaj JSON do `server/data/scenarios/` i uruchom serwer ponownie. `id` musi być unikalne. Przykłady: `morning.json`, `quiet.json`.

```json
{
  "id": "moj-scenariusz",
  "name": "Korek i tankowanie",
  "startDate": "2026-10-07",
  "startTime": "07:00",
  "deliveriesPerCourier": 4,
  "positions": {"courier1": {"lat": 50.054, "lng": 19.944}},
  "events": [
    {"minute": 3, "kind": "traffic", "duration": 8},
    {"minute": 30, "kind": "fuel", "duration": 10, "courierId": "courier1"}
  ]
}
```

`minute` to czas od początku sesji, `duration` to minuty. Rodzaje: `delay`, `traffic`, `overstay`, `occupied`, `break`, `fuel`. Bez `courierId` zdarzenie dotyczy wybranego kuriera. Przerwa/tankowanie mają dopuszczalne czasy 5/10/15/20/30. Zdarzenie bez aktywnego punktu lub podczas niedostępności zapisuje informację o pominięciu. Przedłużony rozładunek zgłoszony przed przybyciem jest przypisany do tego punktu i uwzględniony przy jego obsłudze.

Opcjonalne `initialState` zawiera pełny dokument modelu `State`, dzięki czemu plik może definiować własne firmy, kurierów, biznesy, pojazdy, dostawy, trasy i rezerwacje. Używaj wyłącznie fikcyjnych danych. Struktura stanu i referencje dostaw podlegają walidacji; stan zostaje skopiowany przed działaniem silnika. Bez tego pola scenariusz tworzy bazowe katalogi i planuje wskazaną liczbę dostaw na kuriera.

## Losowania

Wszystkie prawdopodobieństwa na minutę, zakresy długości i cooldown są w `server/src/sim/demoConfig.ts`. Obecne prawdopodobieństwa wynoszą 0,05–0,3% na przyczynę i minutę. Każda przyczyna ma niezależne losowanie, lecz na kuriera można zastosować najwyżej jedno zdarzenie w danej minucie i co najmniej 25 minut między zdarzeniami. Nie wymuszamy zdarzeń dla wszystkich kurierów. Ziarno umożliwia powtarzalne testy i prezentacje. Tryb losowy wykorzystuje dane początkowe scenariusza, pomijając zaprogramowane zdarzenia.

## Izolacja i weryfikacja

`server/tests/simulation-isolation.test.ts` porównuje cały dokument głównego stanu i wszystkie rekordy każdej tabeli SQLite przed i po pełnych sesjach obu trybów, zatrzymaniu, resetach i usunięciu sesji. Sprawdza także brak dostępu roli Symulator do zegara operatora i odrzucenie starych endpointów zmieniających główne dane (`/sim/reset`, `/sim/demo`, `/sim/day`, `/sim/tick`, `/sim/gps`, `/sim/scenario`).

Kontrole rzeczywistego systemu, takie jak zamknięcie ulicy czy jego istniejący zegar testowy, należą do API operatora (`/operator/scenario`, `/operator/tick`, `/operator/day`) i nie są wykorzystywane przez Symulator. Zegar głównej aplikacji nie przesuwa się przy demonstracji.

`scripts/check-simulator-ui.ts` używa Edge i izolowanej bazy w pamięci. `npm run test:browser` uruchamia ten test; `npm run test:smoke` używa własnej sesji demonstracyjnej na działającym serwerze. Żaden z nich nie resetuje głównej aplikacji.
