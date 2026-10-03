# Decyzje MVP

- Uruchomienie lokalne na Windows, bez chmury, Dockera i logowania. Przełącznik ról służy demonstracji, nie stanowi zabezpieczenia produkcyjnego.
- Node 24: wersja zainstalowana przez użytkownika, zamiast wycofanego Node 20. better-sqlite3 12 obsługuje ten runtime.
- Sprzeczność limitu zmian: twarda reguła mówi 4/h, podana konfiguracja 2/h. Stosujemy konserwatywny MAX_CHANGES_PER_HOUR=2 z config.ts, spełniający również maksimum 4/h.
- Dane SCT są regułami demonstratora dostarczonymi w specyfikacji, nie aktualizowanym źródłem przepisów miasta.
- Czas domenowy pochodzi wyłącznie z zegara symulacji. Demo zaczyna się 2026-10-07 o 07:00 czasu lokalnego, planowanie 2026-10-06 o 17:00.
- Hub rowerowy i tryb pozagodzinny odroczone zgodnie z SHOULD; brak fikcyjnych implementacji.
- Brak legalnej pojemności oznacza oczekiwanie z powiadomieniem i ponownym planowaniem, nigdy nielegalny slot.
- Node 24 pozwala użyć Vite 7 i better-sqlite3 12. Vitest zaktualizowano do 4.1.11 po wykryciu podatności mockera we wcześniejszej wersji.
- Godziny pracy są zapisywane przy dostawie wprowadzonej przez firmę; dane punktu odbioru są jedynie domyślnym źródłem zastępczym.
- Ładowność demonstratora: quantity oznacza jednostki po 10 kg, ponieważ CSV nie zawiera osobnej masy.
- Zgodnie z późniejszą instrukcją użytkownika dalsze kroki i testy wykonano autonomicznie, bez zatrzymywania po każdym pliku.
- W hipotetycznych danych jedna grupa bliźniaczych miejsc leży na tej samej ulicy. Scenariusz zamknięcia ulicy obejmuje wszystkie miejsca tej grupy; bliźniak na tej samej ulicy nie jest legalną alternatywą.
