# Weryfikacja lokalnego MVP

Uruchomiono na Windows, Node 24.21.0, npm 11.19.0.

Końcowy wynik: **28/28 testów Vitest**, poprawny typecheck i build, zakończone testy HTTP oraz Edge (desktop i 390 px).

## Vitest

T1–T16 znajdują się w `server/tests/acceptance.test.ts`. Dodatkowe testy domenowe i integracyjne sprawdzają: kalendarz przez północ, funkcję miejsca, percentyle i wykluczenia historii, Haversine, brak mutacji wejścia planera, trwałość bazy po ponownym otwarciu, atomowy import z błędami, role API, bufor po wcześniejszym zakończeniu w bazie i domenie, mustFollow z lokalną poprawą, offline/awarię czujników oraz czas zimowy Warszawy.

Test `street.test.ts` potwierdza, że zamknięcie ulicy obejmuje wszystkie bliźniaki i blokuje jazdę do zamkniętej ulicy, a nowy slot rozpoczyna się dopiero po jej otwarciu.

## HTTP

`scripts/smoke.mjs` sprawdza wygenerowanie 45 dostaw i 7 tras, zachowanie przypisań CSV, pełny cykl kuriera (pojazd → załadunek → wyjazd → brama → jazda → GPS/czujnik → przybycie → doręczenie → czujnik wolne → wyjazd), aktualizację historii, zakłócenia, offline/przywrócenie, odmowę edycji przez biznes, raport, SVG QR, routing SPA i brak kolizji z buforem.

## Edge

`scripts/browser.mjs` sprawdza wybór ról, działania kuriera, podgląd biznesu bez importu, raport operatora, strony QR i ekranu miejsca, brak wyjątków JavaScript oraz brak poziomego przewijania przy 390 px. Zrzuty: `docs/screenshots/`.

Test przeglądarkowy wykrył poziome przewijanie w panelu kuriera. Naprawiono szerokość elementów siatki i potwierdzono ponownym przebiegiem.

## Ograniczenia weryfikacji

T1 uruchamia konkurujące żądania na repozytorium SQLite i sprawdza atomowe odrzucenie drugiej rezerwacji. Nie jest testem obciążeniowym wielu procesów. GPS, czujnik i ruch pozostają danymi symulatora; testy nie potwierdzają integracji ze sprzętem ani prawa obowiązującego w Krakowie. Brak testu produkcyjnego wdrożenia publicznego, które jest poza zakresem lokalnego MVP.
