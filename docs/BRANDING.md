# Identyfikacja wizualna Histerezy

Tło aplikacji: `#F4E9E1`. Panele mają ciepłą, prawie białą powierzchnię `#FFFCF9`; obramowania i neutralne stany są dopasowane do beżowego tła. Granat i koral oryginalnego logo pozostają kolorami marki.

Oryginalne pliki SVG są w `client/public/brand`. Nie zmieniono ścieżek, kolorów ani proporcji znaków. Wspólny `BrandLogo` wybiera wariant poziomy (sidebar i ładowanie), pionowy (start), znak (header) lub wordmark (stopka). Znak jest również faviconą.

`client/src/brand.css` przechowuje paletę i konfigurację Tailwind 4 (`@theme inline`): granat `#0A0F47` oraz koral `#EB493A` pochodzą z logo. Pozostałe tokeny opisują neutralne powierzchnie, tekst, obramowania i semantyczne stany. Koral wyróżnia aktualny punkt; kolejny punkt i główne akcje są granatowe. Ciemniejszy wariant koralu służy czytelnemu tekstowi. Błędy, ostrzeżenia i sukcesy mają odrębne tokeny.

Arkusze główny, katalogów, kuriera i Symulatora korzystają ze zmiennych zamiast lokalnych kolorów. `brand-ui.css` zawiera wspólne wizualne wykończenie. `components/brandColors.ts` przekazuje te same zmienne do znaczników SVG Leaflet. Nowe klasy Tailwind mogą używać np. `bg-brand`, `text-accent`, `bg-surface` i `border-border`.

Weryfikacja: `npm.cmd run build` (łącznie z TypeScript), `npm.cmd test` oraz `node --import tsx scripts/check-rebrand-ui.ts` przy działającym lokalnym serwerze. Test Edge obejmuje 11 ekranów przy 1440 i 390 px, ładowanie i proporcje logo, kolory map oraz niezmienność danych. Zrzuty znajdują się w `docs/screenshots/rebrand`.

Zakres obejmuje wyłącznie frontend i materiały wizualne. Backend, API, modele, dane, routing, akcje i algorytmy pozostają bez zmian.
