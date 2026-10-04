# Rozbudowane dane demonstracyjne

Seed: 5 firm, 18 kurierów, 24 pojazdy, 45 biznesów, 14 miejsc, 198 dostaw oraz 500 rekordów czasu rozładunku. Zegar głównego demo jest ustawiony na **7 października 2026, 08:20 Europe/Warsaw**; nie jest to czas komputera.

| Dzień | Dostawy | Stan |
|---|---:|---|
| 4 października (-3) | 10 | dodatkowa historia |
| 5 października (-2) | 28 | zakończone |
| 6 października (-1) | 32 | zakończone |
| 7 października | 36 | realizacja w toku |
| 8 października | 36 | deklaracje |
| 9 października | 28 | deklaracje |
| 10 października | 28 | deklaracje |

Dodatkowy dzień -3 daje siedem dni danych przy zachowaniu sześciodniowej nawigacji i trzydniowego horyzontu. Przyszłe dni nie mają tras. Zamknięte dni planuje istniejący `closeDueDeliveryDays`, a katalogi i dostawy korzystają z istniejących resolverów oraz walidacji.

## Przypadki do prezentacji

- **Wisła Logistyka / courier1**: dostawy w grupach 1, 2 i 3, także bez priorytetu; widoczny postęp własnej trasy.
- **Wisła Logistyka / courier2**: brak priorytetów, kilka biznesów obsługiwanych z jednego miejsca; rozładunek w toku.
- **vehicle22**: Iveco Daily L4, 6,5 m; pasuje do `bay14`, nie mieści się na większości pozostałych miejsc.
- **vehicle23 i vehicle24**: starsze pojazdy problematyczne dla SCT; obecny model w okresie przejściowym oznacza płatny wjazd, później zakaz. Nie nadano im dostaw wymagających nielegalnego wjazdu.
- **demo-incident-1**: historyczny przedłużony rozładunek +12 minut z rzeczywistym dłuższym postojem w wolnym odstępie kalendarza.
- **demo-incident-2 i demo-incident-3**: rozwiązane historyczne zajęcia miejsca.
- **demo-qr / KR QR777**: zakończony pięciominutowy postój QR między rezerwacjami przy `bay1`.

Biznesy obejmują restauracje, kawiarnie, piekarnie, delikatesy, apteki, hotele, sklepy i usługi. Godziny są zróżnicowane; część dostaw ma odrębne okno przyjmowania. Floty mają auta elektryczne, benzynowe i diesle, kilka chłodni, różne modele i roczniki. Historyczne czasy mają odchylenia, a próbki incydentowe są wyłączone z estymacji zgodnie z istniejącym polem `excluded`.

## CSV

- `server/data/samples/deliveries.csv`: 28 poprawnych dostaw firmy org1 na jutro.
- `deliveries-next-day.csv`: 28 poprawnych dostaw org1 na drugi przyszły dzień.
- `dynamic-deliveries.csv`: dwa rekordy tworzące biznes i chłodnię w trakcie importu, dla kuriera bez deklaracji w wybranym dniu.
- `errors.csv`: zamknięty dzień, nieznany biznes/kurier, obca flota, sprzeczna nazwa, brak chłodni, luka priorytetu i nieprawidłowa data.

Przykłady można przetestować oddzielnie na świeżym seedzie. Import jednego przykładu nie jest warunkiem importowania kolejnego; dynamiczny przykład wybiera inny pojazd, więc nie należy wcześniej przypisywać temu kurierowi pojazdu z drugiego przykładu na ten sam dzień.

## Uruchomienie od zera

```powershell
.\node_modules\.bin\tsx.cmd scripts/seed-demo.ts
.\node_modules\.bin\tsx.cmd scripts/generate-delivery-samples.ts
npm.cmd run build
npm.cmd start
```

Skrypt najpierw buduje seed w SQLite w pamięci, z pełną walidacją, następnie zapisuje kopię dotychczasowej bazy do `server/data/demo.sqlite.before-expanded-demo.sqlite` i zapisuje nowe dane. Istniejąca kopia nie jest nadpisywana. Nowe instalacje domyślnie ładują `demoSeed`; mały `seed` pozostaje deterministyczną fixture testów domenowych. Symulator korzysta z rozszerzonych katalogów, ale nadal ma własny, odseparowany stan.

Priorytety: 104 dostawy bez priorytetu (52,5%), 59 w grupie 1 (29,8%), 29 w grupie 2 (14,6%) oraz 6 w grupie 3 (3%). Grupy są ciągłe w zakresie kuriera, pojazdu i dnia. W Symulatorze katalog zawiera wszystkie firmy i kurierów; scenariusz uruchamia wybranego kuriera oraz wybraną grupę pozostałych, a reszta nie ma pracy w tej sesji.
