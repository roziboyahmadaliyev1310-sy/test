# API Atlas

Four modular Vanilla JavaScript applications:

- `weather-travel/` - geolocation weather, five-day forecast, units, and travel recommendations.
- `currency-converter/` - fiat and crypto conversion, swap control, persistence, and a Chart.js trend view.
- `media-library/` - TMDB movie search, Google Books search, detail modal, and a local saved list.
- `trip-planner/` - live city or country search with nearby place suggestions and a seven-day itinerary.

The trip planner gets country/capital data from [Countries](https://github.com/annexare/Countries), city coordinates from Open-Meteo, nearby place suggestions from Wikipedia (classified with Wikidata), and currency estimates from ExchangeRate-API. Country searches start in the country's capital. These services need an internet connection; place suggestions are nearby Wikipedia articles, not an official or guaranteed list of attractions.

## Run

Because the apps use ES modules, serve the repository over HTTP instead of opening files directly:

```sh
python3 -m http.server 8000
```

Then open `http://localhost:8000/` and choose an app folder. The project has no build step.

## API keys

Add keys in the relevant `api.js` file:

- Weather: Open-Meteo works immediately; add an OpenWeatherMap key in `weather-travel/api.js` if you prefer that provider.
- Currency: ExchangeRate-API key in `currency-converter/api.js`. Crypto data uses CoinGecko.
- Media: TMDB key in `media-library/api.js`. Google Books requires no key for basic use.

The interfaces show a useful setup state when a key is missing rather than failing silently.
