import { getWeatherByCity, getWeatherByCoordinates } from './api.js';

const state = { units: localStorage.getItem('weather-units') || 'metric' };
const $ = (id) => document.getElementById(id);
const iconMap = { Clear: '☼', Clouds: '☁', Rain: '☂', Drizzle: '╱', Snow: '❄', Thunderstorm: 'ϟ', Mist: '≋', Fog: '≋' };
const unitLabel = () => state.units === 'metric' ? 'C' : 'F';
const displayTemp = (value) => Math.round(value);

function recommendations(weather) {
  const condition = weather.weather[0].main.toLowerCase();
  const temp = weather.main.temp;
  if (condition.includes('rain') || condition.includes('drizzle') || condition.includes('thunder')) return ['Make room for rain.', 'A light waterproof layer and shoes with grip will keep the day open. Look for covered markets, galleries, and cafes between showers.'];
  if (condition.includes('snow')) return ['Follow the quiet streets.', 'Insulated layers, waterproof boots, and gloves are the move. Give yourself extra time: beautiful weather can make slow travel better.'];
  if (temp >= (state.units === 'metric' ? 29 : 84)) return ['Chase the shade.', 'Breathable fabrics, water, and an early start will make the heat feel generous instead of demanding.'];
  if (temp <= (state.units === 'metric' ? 8 : 46)) return ['Layer with intention.', 'Bring a warm mid-layer and leave room for a hot drink stop. The best cold-weather walks have a destination.'];
  return ['A very good day to wander.', 'A comfortable layer and shoes you trust are enough. Leave some space in the itinerary for an unplanned turn.'];
}

function renderCurrent(weather) {
  const [condition] = weather.weather;
  $('location-name').textContent = `${weather.name}, ${weather.sys.country}`;
  $('location-time').textContent = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  $('weather-icon').textContent = iconMap[condition.main] || '☼';
  $('temperature').textContent = displayTemp(weather.main.temp);
  $('temperature-unit').textContent = unitLabel();
  $('condition').textContent = condition.description;
  $('feels-like').textContent = `${displayTemp(weather.main.feels_like)}°`;
  $('humidity').textContent = `${weather.main.humidity}%`;
  $('wind').textContent = `${Math.round(weather.wind.speed)} ${state.units === 'metric' ? 'm/s' : 'mph'}`;
  const [title, text] = recommendations(weather);
  $('recommendation-title').textContent = title;
  $('recommendation-text').textContent = text;
}

function renderForecast(forecast) {
  const daily = forecast.list.filter((item) => item.dt_txt.includes('12:00:00')).slice(0, 5);
  $('forecast-grid').innerHTML = daily.map((day) => { const condition = day.weather[0]; return `<article class="forecast-card"><span class="forecast-day">${new Date(day.dt * 1000).toLocaleDateString(undefined, { weekday: 'short' })}</span><span class="forecast-icon">${iconMap[condition.main] || '☼'}</span><strong>${displayTemp(day.main.temp_max)}°</strong><span class="low">${displayTemp(day.main.temp_min)}°</span><p>${condition.description}</p></article>`; }).join('');
}

async function loadWeather(loader) { $('status').textContent = 'Reading the sky...'; try { const [weather, forecast] = await loader(); renderCurrent(weather); renderForecast(forecast); $('status').textContent = `Updated for ${weather.name}`; $('last-updated').textContent = `Updated ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`; } catch (error) { $('status').textContent = error.message; } }

$('search-form').addEventListener('submit', (event) => { event.preventDefault(); const city = $('city-input').value.trim(); if (city) loadWeather(() => getWeatherByCity(city, state.units)); });
$('unit-toggle').addEventListener('click', () => { state.units = state.units === 'metric' ? 'imperial' : 'metric'; localStorage.setItem('weather-units', state.units); $('unit-toggle').innerHTML = state.units === 'metric' ? '°C <span>/ °F</span>' : '°F <span>/ °C</span>'; const city = $('location-name').textContent.split(',')[0]; if (city !== 'Your location') loadWeather(() => getWeatherByCity(city, state.units)); });
$('unit-toggle').innerHTML = state.units === 'metric' ? '°C <span>/ °F</span>' : '°F <span>/ °C</span>';
if (navigator.geolocation) navigator.geolocation.getCurrentPosition(({ coords }) => loadWeather(() => getWeatherByCoordinates(coords.latitude, coords.longitude, state.units)), () => { $('status').textContent = 'Search a city to begin your atlas.'; }); else $('status').textContent = 'Search a city to begin your atlas.';