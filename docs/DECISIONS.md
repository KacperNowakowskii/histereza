# Decyzje MVP

- Uruchomienie lokalne na Windows, bez chmury, Dockera i logowania. Przełącznik ról służy demonstracji, nie stanowi zabezpieczenia produkcyjnego.
- Node 24: wersja zainstalowana przez użytkownika, zamiast wycofanego Node 20. better-sqlite3 12 obsługuje ten runtime.
- Sprzeczność limitu zmian: twarda reguła mówi 4/h, podana konfiguracja 2/h. Stosujemy konserwatywny MAX_CHANGES_PER_HOUR=2 z config.ts, spełniający również maksimum 4/h.
- Dane SCT są regułami demonstratora dostarczonymi w specyfikacji, nie aktualizowanym źródłem przepisów miasta.
- Czas domenowy pochodzi z `s.now`. Główna aplikacja i izolowane sesje Symulatora mają osobne zegary. Cut-off to automatyczne 00:00 rozpoczynające dzień dostaw, według Europe/Warsaw.
- Hub rowerowy i tryb pozagodzinny odroczone zgodnie z SHOULD; brak fikcyjnych implementacji.
- Brak legalnej pojemności oznacza oczekiwanie z powiadomieniem i ponownym planowaniem, nigdy nielegalny slot.
- Node 24 pozwala użyć Vite 7 i better-sqlite3 12. Vitest zaktualizowano do 4.1.11 po wykryciu podatności mockera we wcześniejszej wersji.
- Godziny pracy są zapisywane przy dostawie wprowadzonej przez firmę; dane punktu odbioru są jedynie domyślnym źródłem zastępczym.
- Model dostawy nie zawiera ilości ani masy, dlatego usunięto wcześniejszą walidację ładowności opartą na sztucznym przeliczniku. Wymiary i SCT nadal podlegają dotychczasowej walidacji.
- Zgodnie z późniejszą instrukcją użytkownika dalsze kroki i testy wykonano autonomicznie, bez zatrzymywania po każdym pliku.
- W hipotetycznych danych jedna grupa bliźniaczych miejsc leży na tej samej ulicy. Scenariusz zamknięcia ulicy obejmuje wszystkie miejsca tej grupy; bliźniak na tej samej ulicy nie jest legalną alternatywą.
- Aktualizacja modelu: wyłącznie firmy i kurierzy firmowi; siedmiu kurierów w świeżym seedzie należy do dwóch firm. Starsze dane uczestników spoza firm usuwa migracja po zapisaniu kopii bazy.
- Dostawa zawiera businessId, businessName, date, cargoType, vehicleId, courierId i priority, oprócz technicznych pól identyfikacji i stanu. Nazwę sprawdzamy względem rekordu biznesu. Relacje do biznesu, floty i kuriera są walidowane w Zod oraz egzekwowane przez klucze obce SQLite.
- Priority przechowuje 0 jako brak priorytetu albo numer grupy od 1. Numery mogą się powtarzać i muszą tworzyć ciąg bez luk osobno dla firmy, kuriera, pojazdu i daty. Niższa grupa jest realizowana wcześniej, brak priorytetu po grupach numerowanych. Planner, brama i naprawy egzekwują tę kolejność. Załadunek odwraca grupy, bez sztywnego ułożenia w grupie; jednolita grupa i brak priorytetów oznaczają swobodny dostęp. Starsze numery migrujemy do ciągu 1…N bez przebudowy zapisanych tras.
- CSV i formularz ręczny korzystają ze wspólnego resolvera, obsługują istniejące oraz dynamiczne biznesy i pojazdy. Firma przypisuje kuriera; planner i naprawy nie zmieniają tego przypisania.
