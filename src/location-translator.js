// Location translation utilities
// Maps API country/region names to translation keys

// Common country name variations that APIs might return
export const COUNTRY_NAME_MAPPINGS = {
  // United States variations
  'United States': 'united_states',
  'United States of America': 'united_states', 
  'USA': 'united_states',
  'US': 'united_states',
  'America': 'united_states',
  
  // United Kingdom variations
  'United Kingdom': 'united_kingdom',
  'UK': 'united_kingdom',
  'Great Britain': 'united_kingdom',
  'Britain': 'united_kingdom',
  'England': 'united_kingdom',
  'Scotland': 'united_kingdom',
  'Wales': 'united_kingdom',
  'Northern Ireland': 'united_kingdom',
  
  // China variations
  'China': 'china',
  'People\'s Republic of China': 'china',
  'PRC': 'china',
  
  // Russia variations
  'Russia': 'russia',
  'Russian Federation': 'russia',
  
  // South Korea variations
  'South Korea': 'south_korea',
  'Korea, South': 'south_korea',
  'Republic of Korea': 'south_korea',
  'ROK': 'south_korea',
  
  // North Korea variations
  'North Korea': 'north_korea',
  'Korea, North': 'north_korea',
  'Democratic People\'s Republic of Korea': 'north_korea',
  'DPRK': 'north_korea',
  
  // Germany variations
  'Germany': 'germany',
  'Deutschland': 'germany',
  
  // France variations
  'France': 'france',
  'French Republic': 'france',
  
  // Spain variations
  'Spain': 'spain',
  'Kingdom of Spain': 'spain',
  
  // Italy variations
  'Italy': 'italy',
  'Italian Republic': 'italy',
  
  // Japan variations
  'Japan': 'japan',
  'Nippon': 'japan',
  'Nihon': 'japan',
  
  // Brazil variations
  'Brazil': 'brazil',
  'Brasil': 'brazil',
  'Federative Republic of Brazil': 'brazil',
  
  // Mexico variations
  'Mexico': 'mexico',
  'United Mexican States': 'mexico',
  'México': 'mexico',
  
  // Canada variations
  'Canada': 'canada',
  
  // Australia variations
  'Australia': 'australia',
  'Commonwealth of Australia': 'australia',
  
  // India variations
  'India': 'india',
  'Republic of India': 'india',
  'Bharat': 'india',
  
  // South Africa variations
  'South Africa': 'south_africa',
  'Republic of South Africa': 'south_africa',
  
  // Netherlands variations
  'Netherlands': 'netherlands',
  'Holland': 'netherlands',
  'Kingdom of the Netherlands': 'netherlands',
  
  // Switzerland variations
  'Switzerland': 'switzerland',
  'Swiss Confederation': 'switzerland',
  'Schweiz': 'switzerland',
  'Suisse': 'switzerland',
  'Svizzera': 'switzerland',
  
  // United Arab Emirates variations
  'United Arab Emirates': 'united_arab_emirates',
  'UAE': 'united_arab_emirates',
  'Emirates': 'united_arab_emirates',
  
  // Saudi Arabia variations
  'Saudi Arabia': 'saudi_arabia',
  'Kingdom of Saudi Arabia': 'saudi_arabia',
  
  // New Zealand variations
  'New Zealand': 'new_zealand',
  'NZ': 'new_zealand',
  'Aotearoa': 'new_zealand',
  
  // Czech Republic variations
  'Czech Republic': 'czech_republic',
  'Czechia': 'czech_republic',
  'Czech': 'czech_republic',
  
  // Democratic Republic of the Congo variations
  'Democratic Republic of the Congo': 'democratic_republic_of_the_congo',
  'DR Congo': 'democratic_republic_of_the_congo',
  'DRC': 'democratic_republic_of_the_congo',
  'Congo-Kinshasa': 'democratic_republic_of_the_congo',
  
  // Ivory Coast variations
  'Ivory Coast': 'ivory_coast',
  'Côte d\'Ivoire': 'ivory_coast',
  
  // Myanmar variations
  'Myanmar': 'myanmar',
  'Burma': 'myanmar',
  
  // Add more as needed...
};

// Convert country name to translation key
export function getCountryKey(countryName) {
  if (!countryName) return null;
  
  // Direct mapping
  const directKey = COUNTRY_NAME_MAPPINGS[countryName];
  if (directKey) return directKey;
  
  // Fallback: convert to snake_case
  return countryName
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '') // Remove special characters
    .replace(/\s+/g, '_')        // Replace spaces with underscores
    .replace(/_+/g, '_')         // Remove duplicate underscores
    .replace(/^_|_$/g, '');      // Remove leading/trailing underscores
}

// State/Province mappings for major countries
export const STATE_PROVINCE_MAPPINGS = {
  // US States
  'California': { key: 'california', country: 'united_states' },
  'New York': { key: 'new_york_state', country: 'united_states' },
  'Texas': { key: 'texas', country: 'united_states' },
  'Florida': { key: 'florida', country: 'united_states' },
  'Illinois': { key: 'illinois', country: 'united_states' },
  'Pennsylvania': { key: 'pennsylvania', country: 'united_states' },
  'Ohio': { key: 'ohio', country: 'united_states' },
  
  // Canadian Provinces
  'Ontario': { key: 'ontario', country: 'canada' },
  'Quebec': { key: 'quebec', country: 'canada' },
  'British Columbia': { key: 'british_columbia', country: 'canada' },
  'Alberta': { key: 'alberta', country: 'canada' },
  
  // German States
  'Bavaria': { key: 'bavaria', country: 'germany' },
  'Baden-Württemberg': { key: 'baden_wurttemberg', country: 'germany' },
  'North Rhine-Westphalia': { key: 'north_rhine_westphalia', country: 'germany' },
  
  // French Regions
  'Île-de-France': { key: 'ile_de_france', country: 'france' },
  'Provence-Alpes-Côte d\'Azur': { key: 'provence_alpes_cote_azur', country: 'france' },
  
  // UK regions
  'England': { key: 'england', country: 'united_kingdom' },
  'Scotland': { key: 'scotland', country: 'united_kingdom' },
  'Wales': { key: 'wales', country: 'united_kingdom' },
  'Northern Ireland': { key: 'northern_ireland', country: 'united_kingdom' },
  
  // Australian States
  'New South Wales': { key: 'new_south_wales', country: 'australia' },
  'Victoria': { key: 'victoria', country: 'australia' },
  'Queensland': { key: 'queensland', country: 'australia' },
  'Western Australia': { key: 'western_australia', country: 'australia' },
  
  // Add more as needed...
};

// Get state/province key
export function getStateProvinceKey(stateName) {
  if (!stateName) return null;
  
  const mapping = STATE_PROVINCE_MAPPINGS[stateName];
  return mapping ? mapping.key : null;
}

// Major cities mapping
export const CITY_MAPPINGS = {
  // Major world cities
  'New York': 'new_york',
  'New York City': 'new_york', 
  'NYC': 'new_york',
  'Los Angeles': 'los_angeles',
  'LA': 'los_angeles',
  'Chicago': 'chicago',
  'Houston': 'houston',
  'Phoenix': 'phoenix',
  'Philadelphia': 'philadelphia',
  'San Antonio': 'san_antonio',
  'San Diego': 'san_diego',
  'Dallas': 'dallas',
  'San Jose': 'san_jose',
  'Austin': 'austin',
  'Jacksonville': 'jacksonville',
  'San Francisco': 'san_francisco',
  'Columbus': 'columbus',
  'Charlotte': 'charlotte',
  'Fort Worth': 'fort_worth',
  'Indianapolis': 'indianapolis',
  'Seattle': 'seattle',
  'Denver': 'denver',
  'Boston': 'boston',
  'El Paso': 'el_paso',
  'Nashville': 'nashville',
  'Detroit': 'detroit',
  'Oklahoma City': 'oklahoma_city',
  'Portland': 'portland',
  'Las Vegas': 'las_vegas',
  'Memphis': 'memphis',
  'Louisville': 'louisville',
  'Baltimore': 'baltimore',
  'Milwaukee': 'milwaukee',
  'Albuquerque': 'albuquerque',
  'Tucson': 'tucson',
  'Fresno': 'fresno',
  'Sacramento': 'sacramento',
  'Mesa': 'mesa',
  'Kansas City': 'kansas_city',
  'Atlanta': 'atlanta',
  'Long Beach': 'long_beach',
  'Colorado Springs': 'colorado_springs',
  'Raleigh': 'raleigh',
  'Miami': 'miami',
  'Virginia Beach': 'virginia_beach',
  'Omaha': 'omaha',
  'Oakland': 'oakland',
  'Minneapolis': 'minneapolis',
  'Tulsa': 'tulsa',
  'Arlington': 'arlington',
  'Tampa': 'tampa',
  'New Orleans': 'new_orleans',
  
  // International cities
  'London': 'london',
  'Paris': 'paris',
  'Berlin': 'berlin',
  'Madrid': 'madrid',
  'Rome': 'rome',
  'Milan': 'milan',
  'Barcelona': 'barcelona',
  'Amsterdam': 'amsterdam',
  'Brussels': 'brussels',
  'Vienna': 'vienna',
  'Zurich': 'zurich',
  'Geneva': 'geneva',
  'Stockholm': 'stockholm',
  'Oslo': 'oslo',
  'Copenhagen': 'copenhagen',
  'Helsinki': 'helsinki',
  'Dublin': 'dublin',
  'Edinburgh': 'edinburgh',
  'Manchester': 'manchester',
  'Liverpool': 'liverpool',
  'Birmingham': 'birmingham',
  'Glasgow': 'glasgow',
  'Leeds': 'leeds',
  'Sheffield': 'sheffield',
  'Bristol': 'bristol',
  'Cardiff': 'cardiff',
  'Belfast': 'belfast',
  
  'Tokyo': 'tokyo',
  'Osaka': 'osaka',
  'Kyoto': 'kyoto',
  'Yokohama': 'yokohama',
  'Nagoya': 'nagoya',
  'Sapporo': 'sapporo',
  'Kobe': 'kobe',
  'Fukuoka': 'fukuoka',
  
  'Beijing': 'beijing',
  'Shanghai': 'shanghai',
  'Guangzhou': 'guangzhou',
  'Shenzhen': 'shenzhen',
  'Chengdu': 'chengdu',
  'Hangzhou': 'hangzhou',
  'Wuhan': 'wuhan',
  'Xi\'an': 'xian',
  'Chongqing': 'chongqing',
  'Tianjin': 'tianjin',
  
  'Mumbai': 'mumbai',
  'Delhi': 'delhi',
  'Bangalore': 'bangalore',
  'Hyderabad': 'hyderabad',
  'Ahmedabad': 'ahmedabad',
  'Chennai': 'chennai',
  'Kolkata': 'kolkata',
  'Pune': 'pune',
  'Jaipur': 'jaipur',
  'Surat': 'surat',
  
  'Moscow': 'moscow',
  'Saint Petersburg': 'saint_petersburg',
  'Novosibirsk': 'novosibirsk',
  'Yekaterinburg': 'yekaterinburg',
  'Nizhny Novgorod': 'nizhny_novgorod',
  'Kazan': 'kazan',
  'Chelyabinsk': 'chelyabinsk',
  'Omsk': 'omsk',
  'Samara': 'samara',
  'Rostov-on-Don': 'rostov_on_don',
  
  'São Paulo': 'sao_paulo',
  'Rio de Janeiro': 'rio_de_janeiro',
  'Salvador': 'salvador',
  'Brasília': 'brasilia',
  'Fortaleza': 'fortaleza',
  'Belo Horizonte': 'belo_horizonte',
  'Manaus': 'manaus',
  'Curitiba': 'curitiba',
  'Recife': 'recife',
  'Porto Alegre': 'porto_alegre',
  
  'Cairo': 'cairo',
  'Alexandria': 'alexandria',
  'Giza': 'giza',
  'Shubra El Kheima': 'shubra_el_kheima',
  'Port Said': 'port_said',
  'Suez': 'suez',
  'Luxor': 'luxor',
  'Aswan': 'aswan',
  
  'Cape Town': 'cape_town',
  'Johannesburg': 'johannesburg',
  'Durban': 'durban',
  'Pretoria': 'pretoria',
  'Port Elizabeth': 'port_elizabeth',
  'Bloemfontein': 'bloemfontein',
  
  'Washington': 'washington',
  'Melbourne': 'melbourne',
  'Brisbane': 'brisbane',
  'Perth': 'perth',
  'Adelaide': 'adelaide',
  'Gold Coast': 'gold_coast',
  'Newcastle': 'newcastle',
  'Canberra': 'canberra',
  'Wollongong': 'wollongong',
  'Geelong': 'geelong',
  
  'Toronto': 'toronto',
  'Montreal': 'montreal',
  'Vancouver': 'vancouver',
  'Calgary': 'calgary',
  'Edmonton': 'edmonton',
  'Ottawa': 'ottawa',
  'Winnipeg': 'winnipeg',
  'Quebec City': 'quebec_city',
  'Hamilton': 'hamilton',
  'Kitchener': 'kitchener',
  
  'Mexico City': 'mexico_city',
  'Guadalajara': 'guadalajara',
  'Monterrey': 'monterrey',
  'Puebla': 'puebla',
  'Tijuana': 'tijuana',
  'León': 'leon',
  'Juárez': 'juarez',
  'Torreón': 'torreon',
  'Querétaro': 'queretaro',
  'San Luis Potosí': 'san_luis_potosi',
  
  'Buenos Aires': 'buenos_aires',
  'Córdoba': 'cordoba',
  'Rosario': 'rosario',
  'Mendoza': 'mendoza',
  'La Plata': 'la_plata',
  'San Miguel de Tucumán': 'san_miguel_de_tucuman',
  'Mar del Plata': 'mar_del_plata',
  'Salta': 'salta',
  'Santa Fe': 'santa_fe',
  'San Juan': 'san_juan',
  
  'Santiago': 'santiago',
  'Valparaíso': 'valparaiso',
  'Concepción': 'concepcion',
  'La Serena': 'la_serena',
  'Antofagasta': 'antofagasta',
  'Temuco': 'temuco',
  'Rancagua': 'rancagua',
  'Talca': 'talca',
  'Arica': 'arica',
  'Chillán': 'chillan',
  
  'Lima': 'lima',
  'Arequipa': 'arequipa',
  'Callao': 'callao',
  'Trujillo': 'trujillo',
  'Chiclayo': 'chiclayo',
  'Huancayo': 'huancayo',
  'Piura': 'piura',
  'Iquitos': 'iquitos',
  'Cusco': 'cusco',
  'Chimbote': 'chimbote',
  
  'Bogotá': 'bogota',
  'Medellín': 'medellin',
  'Cali': 'cali',
  'Barranquilla': 'barranquilla',
  'Cartagena': 'cartagena',
  'Cúcuta': 'cucuta',
  'Soledad': 'soledad',
  'Ibagué': 'ibague',
  'Bucaramanga': 'bucaramanga',
  'Soacha': 'soacha',
  
  'Caracas': 'caracas',
  'Maracaibo': 'maracaibo',
  'Valencia': 'valencia',
  'Barquisimeto': 'barquisimeto',
  'Maracay': 'maracay',
  'Ciudad Guayana': 'ciudad_guayana',
  'San Cristóbal': 'san_cristobal',
  'Maturín': 'maturin',
  'Barcelona': 'barcelona_venezuela',
  'Turmero': 'turmero',
  
  'Dubai': 'dubai',
  'Abu Dhabi': 'abu_dhabi',
  'Sharjah': 'sharjah',
  'Al Ain': 'al_ain',
  'Ajman': 'ajman',
  'Ras Al Khaimah': 'ras_al_khaimah',
  'Fujairah': 'fujairah',
  'Umm Al Quwain': 'umm_al_quwain',
  
  'Singapore': 'singapore',
  
  'Reykjavik': 'reykjavik',
  'Akureyri': 'akureyri',
  'Hafnarfjörður': 'hafnarfjordur',
  'Kópavogur': 'kopavogur',
  'Garðabær': 'gardabaer'
};

// Get city key
export function getCityKey(cityName) {
  if (!cityName) return null;
  
  // Direct mapping
  const directKey = CITY_MAPPINGS[cityName];
  if (directKey) return directKey;
  
  // Fallback: convert to snake_case
  return cityName
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '') // Remove special characters
    .replace(/\s+/g, '_')        // Replace spaces with underscores
    .replace(/_+/g, '_')         // Remove duplicate underscores
    .replace(/^_|_$/g, '');      // Remove leading/trailing underscores
}