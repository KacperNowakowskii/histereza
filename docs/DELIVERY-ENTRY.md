# Dodawanie dostaw

W panelu firmy wybierz **Import CSV** albo **Dodaj ręcznie**. Obie metody korzystają ze wspólnej walidacji i zapisują ten sam model dostawy. Priorytet może być pusty lub wskazywać grupę 1, 2, 3… i może się powtarzać. Dodanie, edycja i usunięcie dostawy nie uruchamiają planowania ani cut-off.

Formularz wyszukuje biznes po ID lub nazwie i pozwala wybrać pojazd z Floty. Przyciski **Nowy biznes w formularzu** oraz **Nowy pojazd w formularzu** umożliwiają utworzenie rekordów katalogu wraz z dostawą, bez opuszczania ekranu. ID nowych rekordów można podać lub pozostawić systemowi.

## CSV

Pola wymagane w każdym wierszu: `externalRef,date,cargoType,courierId`. Cargo: `standard`, `fresh`, `cold`. `priority` może być puste lub pominięte; starsza wartość `0` również oznacza brak priorytetu. Grupy numerowane muszą tworzyć ciąg 1…N dla kuriera, pojazdu i daty, bez luk. Kolejność wierszy CSV nie ma znaczenia: walidowany jest cały wynikowy zestaw. Pole `quantity` zostało usunięte; nieobsługiwane kolumny powodują błąd wiersza.

| Rekord | Istniejący | Nowy |
| --- | --- | --- |
| Biznes | `businessId` lub `businessName` | `businessName,businessLat,businessLng,opens,closes,bayIds`; opcjonalne ID |
| Pojazd | `vehicleId` lub `registrationNumber` | `registrationNumber`, model oraz dane techniczne; opcjonalne ID |

Biznes musi należeć do wybranej firmy. ID i nazwa muszą wskazywać ten sam rekord. Przy powtarzających się nazwach wymagane jest ID. Dla nowego biznesu `bayIds` zawiera istniejące miejsca oddzielone `|`; opcjonalne pola to `unloadingConditions,unattendedDropAllowed`. Godziny istniejącego biznesu pobierane są z bazy. Podanie `opens,closes` ustawia okno tej dostawy, zachowując godziny w katalogu.

Nowy pojazd wymaga `vehicleModelId` lub `vehicleModelName`, `fuelType,emissionStandard,productionYear,dimensionsVerified`. `hasCooling` jest opcjonalne, ale cargo `cold` wymaga chłodni. Istniejący model uzupełnia wymiary, ładowność i DMC. Nowy model wymaga `lengthM,widthM,heightM,maxLoadKg,gvwKg`. Paliwo: `diesel`, `petrol`, `electric`; wartości logiczne: `true/false` lub `1/0`. Pozostawione puste wymagane parametry, niezweryfikowane wymiary oraz niedozwolony pojazd blokują zapis. Podane dane istniejącego pojazdu lub modelu muszą odpowiadać katalogowi.

Przykłady: `server/data/samples/deliveries.csv`, `errors.csv`, `dynamic-deliveries.csv`. Daty przykładów odnoszą się do początkowego czasu symulacji. Po zmianie dnia dostosuj datę do istniejącego horyzontu trzech kolejnych dni. Cut-off następuje o 00:00 rozpoczynającym dzień dostaw. CSV obsługuje cytowane wartości z przecinkami.

**Sprawdź wiersze** nie zmienia bazy. Jeśli choć jeden wiersz zawiera błąd, import nie zapisze żadnej dostawy, biznesu ani pojazdu. Poprawny import zapisuje wszystkie rekordy w jednej transakcji. Dalsze wiersze mogą korzystać z biznesów i pojazdów tworzonych wcześniej w tym samym pliku.

## Edycja i usuwanie

Lista pod formularzem pokazuje dostawy wybranej firmy. **Edytuj** wczytuje dane do formularza i wyraźnie pokazuje numer i ID edytowanej dostawy. Można zmienić biznes, datę, cargo, pojazd, kuriera, priorytet i okno przyjmowania. Numer i ID dostawy pozostają niezmienne. **Usuń** usuwa dostawę i zachowuje rekordy katalogów.

Zmiany dotyczą dostaw przygotowanych, które nie weszły do planu, przed istniejącym cut-off. Dostawy w planie lub zakończone mają zablokowane akcje; backend niezależnie egzekwuje ten warunek. Zachowana jest reguła jednego pojazdu kuriera na dany dzień.

## Grupy priorytetowe i załadunek

Niższy numer realizowany jest wcześniej. Dostawy bez priorytetu obsługiwane są po grupach numerowanych. Kilka dostaw może mieć ten sam numer. Usunięcie lub edycja ostatniej dostawy z grupy 1 jest zablokowane, jeśli pozostaje grupa 2; analogicznie dla dalszych grup. Reguła obejmuje także przenoszenie dostaw między datami, kurierami i pojazdami.

Planner zachowuje grupy, a wewnątrz nich stosuje dotychczasowe reguły cargo, godzin i odległości. Różne grupy nie są łączone w jeden postój. Wybór celu i naprawa trasy nie mogą ominąć niedokończonej niższej grupy. Niedostępna wcześniejsza grupa blokuje późniejsze grupy do jej zakończenia.

Grupy załadunku są odwrotne: bez priorytetu, N…3, 2, 1. Paczki priorytetu 1 ładuje się ostatnie. W obrębie grupy kolejność ułożenia jest dowolna. Jeśli istnieje tylko jedna grupa lub wszystkie dostawy są bez priorytetu, całość ma swobodny dostęp. API zapisuje `loadingMode` i `loadingGroups`, zachowując `loadingList` dla istniejącego ekranu kuriera. Ekran kuriera pozostaje bez zmian.

Migracja modelu 4 wykonuje kopię `server/data/demo.sqlite.pre-model-v4.sqlite`, usuwa dawne pola przez projekcję na bieżący model i porządkuje starsze numery z lukami do 1…N, zachowując ich wzajemną kolejność. Istniejące zapisane trasy nie są automatycznie przebudowywane. Nowo tworzone plany stosują grupy priorytetowe.

## Weryfikacja

`npm.cmd test`: 89/89 testów. `npm.cmd run build`: TypeScript i build zakończone poprawnie; Vite ostrzega o rozmiarze głównego pliku JS.

`server/tests/priorities.test.ts` obejmuje luki, osobne zakresy, atomowy zapis, edycję i usuwanie, opcjonalny priorytet, kolejność wierszy CSV, grupowanie postojów, pierwszeństwo przed cargo i odległością, swobodny załadunek i odwrotne grupy, blokady jazdy i napraw oraz migrację. `npx tsx scripts/check-priorities-ui.ts` potwierdza w Edge blokady wyboru, edycji i usuwania oraz opis załadunku 3→2→1 na bazie w pamięci.

`npx tsx scripts/check-delivery-entry-ui.ts`: Edge, izolowana baza SQLite w pamięci; ręczne dodawanie, dynamiczne katalogi, edycja wszystkich wskazanych pól, usuwanie, import po nazwie i rejestracji, błędy wierszy, zakres firmy i widok 390 px. Potwierdzono brak wyjątków JavaScript, poziomego przewijania oraz zmian tras i cut-off. `scripts/check-catalog-ui.ts` sprawdza nadal zakładki Biznesy i Flota.

## Daty i automatyczne zamknięcie

Nawigacja: dwa dni historyczne, dzień bieżący, trzy przyszłe dni. Dodawanie, edycja i usuwanie są dostępne wyłącznie dla przyszłych deklaracji. Każda data zamyka się raz o 00:00 w strefie Europe/Warsaw, według `s.now`; nie korzystamy z czasu komputera w logice domenowej. O 23:59 można zapisać dostawę na jutro; o 00:00 backend odrzuca zapis, edycję, usunięcie i wiersz CSV z komunikatem o przekroczeniu terminu. Wówczas powstają trasy dostępne dla kuriera; dalsze daty pozostają bez tras. Usunięto przycisk i endpoint ręcznego cut-off.

Repozytorium synchronizuje zamknięcia przy uruchomieniu i zmianach stanu, a symulator po każdej minucie. `closedDeliveryDates` zastępuje globalny znacznik. Migracja v5 tworzy kopię `.pre-model-v5.sqlite`, zachowuje historyczne/bieżące trasy, a przedwcześnie zaplanowane przyszłe dostawy przywraca do deklaracji. Przy offline lista nadal zamyka się, a trasy bez bezpiecznego slotu oczekują na przydział.

Weryfikacja: 102 testy, w tym granice północy, CSV, API, restart, migracja, zmiana czasu oraz ochrona archiwalnych tras; TypeScript/build i Edge na izolowanej bazie.
