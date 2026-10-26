import { searchLocations } from '../weather-travel/api.js';

const curatedBudgets = {
    seoul: {
        currency: 'KRW',
        symbol: '₩',
        base: 72000
    },
    paris: {
        currency: 'EUR',
        symbol: '€',
        base: 82
    },
    london: {
        currency: 'GBP',
        symbol: '£',
        base: 76
    },
    tokyo: {
        currency: 'JPY',
        symbol: '¥',
        base: 9300
    },
    tashkent: {
        currency: 'UZS',
        symbol: 'soʻm',
        base: 380000
    }
};

const COUNTRY_DATA_URL = 'https://raw.githubusercontent.com/annexare/Countries/master/dist/countries.min.json';
const WIKIPEDIA_API_URL = 'https://en.wikipedia.org/w/api.php';
const WIKIDATA_API_URL = 'https://www.wikidata.org/w/api.php';
const USD_RATES_URL = 'https://open.er-api.com/v6/latest/USD';

let countryDirectoryRequest;
let usdRatesRequest;

function normalizeName(value) {
    return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}

async function fetchJson(url, message) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(message);
    return response.json();
}

export function getCountryDirectory() {
    if (!countryDirectoryRequest) {
        countryDirectoryRequest = fetchJson(COUNTRY_DATA_URL, 'Country suggestions are unavailable. Please try again later.')
            .then((data) => {
                const countries = Object.entries(data)
                    .filter(([, country]) => country && typeof country.name === 'string')
                    .map(([code, country]) => ({ code, ...country }));
                if (!countries.length) throw new Error('The country directory returned no countries.');
                return countries.sort((first, second) => first.name.localeCompare(second.name));
            })
            .catch((error) => {
                countryDirectoryRequest = undefined;
                throw error;
            });
    }
    return countryDirectoryRequest;
}

function matchCountry(query, countries) {
    const normalizedQuery = normalizeName(query);
    return countries.find((country) => {
        const names = [country.name, country.native, ...(Array.isArray(country.alias) ? country.alias : [])];
        return names.some((name) => typeof name === 'string' && normalizeName(name) === normalizedQuery);
    });
}

function selectLocation(locations, countryCode) {
    const matches = countryCode
        ? locations.filter((location) => location.country_code?.toUpperCase() === countryCode.toUpperCase())
        : locations;
    return matches.sort((first, second) => {
        const rank = (location) => location.feature_code === 'PPLC' ? 2 : location.feature_code?.startsWith('PPLA') ? 1 : 0;
        return rank(second) - rank(first) || (second.population || 0) - (first.population || 0);
    })[0];
}

async function getPlaceTypes(pages) {
    const pageIds = [...new Set(pages
        .map((page) => page.pageprops?.wikibase_item)
        .filter((id) => /^Q\d+$/.test(id || '')))].slice(0, 50);
    if (!pageIds.length) return new Map();

    const entitiesParams = new URLSearchParams({
        action: 'wbgetentities',
        ids: pageIds.join('|'),
        props: 'claims',
        format: 'json',
        origin: '*'
    });
    const entitiesData = await fetchJson(`${WIKIDATA_API_URL}?${entitiesParams}`, 'Nearby place categories could not be loaded.');
    const entities = Object.values(entitiesData.entities || {});
    const classIds = [...new Set(entities.flatMap((entity) => (entity.claims?.P31 || [])
        .map((claim) => claim.mainsnak.datavalue?.value?.id)
        .filter((id) => /^Q\d+$/.test(id || ''))))].slice(0, 50);
    if (!classIds.length) return new Map();

    const labelsParams = new URLSearchParams({
        action: 'wbgetentities',
        ids: classIds.join('|'),
        props: 'labels',
        languages: 'en',
        format: 'json',
        origin: '*'
    });
    const labelsData = await fetchJson(`${WIKIDATA_API_URL}?${labelsParams}`, 'Nearby place categories could not be loaded.');
    const labels = new Map(Object.values(labelsData.entities || {})
        .map((entity) => [entity.id, entity.labels?.en?.value || '']));

    return new Map(entities.map((entity) => [
        entity.id,
        (entity.claims?.P31 || [])
            .map((claim) => labels.get(claim.mainsnak.datavalue?.value?.id))
            .filter(Boolean)
    ]));
}

async function searchNearbyPlaces(latitude, longitude) {
    const parameters = new URLSearchParams({
        action: 'query',
        generator: 'geosearch',
        ggscoord: `${latitude}|${longitude}`,
        ggsradius: '10000',
        ggsort: 'distance',
        ggsnamespace: '0',
        ggslimit: '50',
        prop: 'coordinates|pageprops',
        coprop: 'type',
        format: 'json',
        origin: '*'
    });
    const data = await fetchJson(`${WIKIPEDIA_API_URL}?${parameters}`, 'Nearby places could not be loaded. Please try again later.');
    const pages = Object.values(data.query?.pages || {});
    const placeTypes = await getPlaceTypes(pages);
    const excludedType = /^(?:adm\d\w*|airport|city|country|edu|event|railwaystation|station)$/i;
    const excludedTitle = /\b(?:airport|archdiocese|attack|bank|battle|bombing|borough|commune|corporation|district|embassy|federation|festival|headquarters|hotel|inn|metropolitan area|metro|municipality|oblast|police|province|railway station|region|resort|school|siege|stadium|station|suburb|subway|timeline|train station|university|war)\b/i;
    const attractionTitle = /\b(?:aquarium|bazaar|beach|botanical|bridge|castle|cathedral|church|citadel|fort|fountain|gallery|garden|heritage|historic|island|isle|lake|library|market|madrasa|madrasah|mausoleum|memorial|museum|monastery|monument|mosque|mountain|park|palace|plaza|temple|theatre|theater|tower|waterfall|zoo)\b/i;
    const nonAttractionClass = /\b(?:accommodation|administrative region|archdiocese|bank|borough|business|city|company|district|embassy|event|federation|government agency|government office|hospital|hotel|municipality|neighbourhood|neighborhood|organization|organisation|political party|police|province|resort|school|settlement|stadium|suburb|university|village|war)\b/i;
    const attractionClass = /\b(?:aquarium|archaeological site|bazaar|beach|bridge|castle|cathedral|church|citadel|fort|fountain|gallery|garden|heritage site|historic site|island|lake|landmark|library|market|madrasa|mausoleum|memorial|monastery|monument|mosque|mountain|museum|opera house|palace|park|plaza|square|temple|theatre|theater|tourist attraction|tower|waterfall|zoo)\b/i;
    const sortedPages = pages.sort((first, second) => {
        const landmarkRank = (page) => page.coordinates?.[0]?.type === 'landmark' ? 1 : 0;
        return landmarkRank(second) - landmarkRank(first) || first.index - second.index;
    });
    const seen = new Set();
    const places = sortedPages
        .filter((page) => typeof page.title === 'string' && page.title.trim())
        .filter((page) => !excludedType.test(page.coordinates?.[0]?.type || ''))
        .filter((page) => !excludedTitle.test(page.title))
        .filter((page) => {
            const classes = placeTypes.get(page.pageprops?.wikibase_item) || [];
            if (classes.some((label) => nonAttractionClass.test(label))) return false;
            return page.coordinates?.[0]?.type === 'landmark'
                || page.coordinates?.[0]?.type === 'isle'
                || attractionTitle.test(page.title)
                || classes.some((label) => attractionClass.test(label));
        })
        .filter((page) => {
            const title = normalizeName(page.title);
            if (seen.has(title)) return false;
            seen.add(title);
            return true;
        })
        .map((page) => page.title);

    if (!places.length) throw new Error('No nearby attractions were found. Try a larger city or its country.');
    return places;
}

async function getUsdRates() {
    if (!usdRatesRequest) {
        usdRatesRequest = fetchJson(USD_RATES_URL, 'Currency estimates are unavailable.')
            .then((data) => {
                if (data.result !== 'success' || !data.rates) throw new Error('The currency service returned invalid exchange rates.');
                return data.rates;
            })
            .catch((error) => {
                usdRatesRequest = undefined;
                throw error;
            });
    }
    return usdRatesRequest;
}

function getCurrencySymbol(currency) {
    try {
        return new Intl.NumberFormat('en', { style: 'currency', currency })
            .formatToParts(0)
            .find((part) => part.type === 'currency')?.value || currency;
    } catch {
        return currency;
    }
}

async function getBudget(currency, curatedPlan) {
    if (curatedPlan) {
        return {
            currency: curatedPlan.currency,
            symbol: curatedPlan.symbol,
            base: curatedPlan.base
        };
    }

    if (currency && /^[A-Z]{3}$/.test(currency)) {
        try {
            const rates = await getUsdRates();
            if (typeof rates[currency] === 'number') {
                return {
                    currency,
                    symbol: getCurrencySymbol(currency),
                    base: Math.round(85 * rates[currency])
                };
            }
        } catch (error) {
            console.error('Could not load local currency estimates.', error);
        }
    }

    return {
        currency: 'USD',
        symbol: '$',
        base: 85,
        note: 'A local exchange rate was unavailable, so the budget is shown in USD.'
    };
}

export async function resolveDestination(query) {
    const search = query.trim();
    if (!search) throw new Error('Enter a city or country to build your trip.');

    let countries = [];
    let countryDirectoryError;
    try {
        countries = await getCountryDirectory();
    } catch (error) {
        countryDirectoryError = error;
    }
    let country = matchCountry(search, countries);
    let isCountryDestination = Boolean(country);
    let locations;

    if (country) {
        if (!country.capital) throw new Error(`A capital city is not listed for ${country.name}. Try entering a city instead.`);
        locations = await searchLocations(country.capital, country.code);
    } else {
        locations = await searchLocations(search);
    }

    let location = selectLocation(locations, country?.code);
    if (!location) throw new Error(`Could not find “${search}”. Try a city or country name.`);

    if (location.feature_code === 'PCLI') {
        isCountryDestination = true;
        country ||= countries.find((item) => item.code.toUpperCase() === location.country_code?.toUpperCase());
        if (!country?.capital) {
            if (countryDirectoryError) throw new Error('The country directory is unavailable. Try entering the capital city instead.');
            throw new Error(`Could not find a capital city for ${location.name}. Try entering a city instead.`);
        }
        locations = await searchLocations(country.capital, country.code);
        location = selectLocation(locations, country.code);
        if (!location) throw new Error(`Could not find the capital city of ${country.name}. Please try a city name.`);
    }

    country ||= countries.find((item) => item.code.toUpperCase() === location.country_code?.toUpperCase());
    const currency = Array.isArray(country?.currency) ? country.currency[0] : '';
    const curatedPlan = curatedBudgets[normalizeName(location.name)];
    const budget = await getBudget(currency, curatedPlan);
    if (countryDirectoryError) {
        console.error('Country details could not be loaded for this destination.', countryDirectoryError);
    }
    const places = await searchNearbyPlaces(location.latitude, location.longitude);

    return {
        name: location.name,
        country: country?.name || location.country || 'Unknown country',
        currency: budget.currency,
        symbol: budget.symbol,
        base: budget.base,
        budgetNote: countryDirectoryError
            ? 'Country details could not be loaded, so the budget is shown in USD.'
            : budget.note,
        places,
        latitude: location.latitude,
        longitude: location.longitude,
        isCountryDestination,
        query: search
    };
}

export function buildPlan(destination, days, style) {
    const multiplier = style === 'comfort' ? 1.55 : style === 'slow' ? 0.82 : 1;
    const daily = Math.round(destination.base * multiplier);
    const placeCount = destination.places.length;
    const seenPairs = new Set();
    const itinerary = Array.from({
        length: days
    }, (_, index) => {
        let firstIndex = (index * 2) % placeCount;
        let secondIndex = (firstIndex + 1 + Math.floor(index / 2)) % placeCount;
        let pairKey = [firstIndex, secondIndex].sort((a, b) => a - b).join('|');

        let attempts = 0;
        while (seenPairs.has(pairKey) && attempts < placeCount) {
            secondIndex = (secondIndex + 1) % placeCount;
            pairKey = [firstIndex, secondIndex].sort((a, b) => a - b).join('|');
            attempts += 1;
        }

        seenPairs.add(pairKey);

        return {
            day: index + 1,
            places: [destination.places[firstIndex], destination.places[secondIndex]],
            note: index === 0 ? 'Start gently and get your bearings.' : index === days - 1 ? 'Keep the last day flexible for a final favorite.' : 'Leave space for a slow lunch and an unplanned turn.'
        };
    });
    return {
        ...destination,
        daily,
        total: daily * days,
        itinerary
    };
}
