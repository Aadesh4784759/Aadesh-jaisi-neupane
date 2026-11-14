export type WorldRegion =
  | 'All'
  | 'Asia'
  | 'Middle East'
  | 'Europe'
  | 'Americas'
  | 'Africa'
  | 'Oceania';

export interface CountryClockEntry {
  code: string;
  country: string;
  city: string;
  region: Exclude<WorldRegion, 'All'>;
  timeZone: string;
  flag: string;
}

function isoToFlag(code: string): string {
  const upper = code.toUpperCase();
  if (!/^[A-Z]{2}$/.test(upper)) return '🌐';
  return String.fromCodePoint(
    0x1f1e6 + upper.charCodeAt(0) - 65,
    0x1f1e6 + upper.charCodeAt(1) - 65
  );
}

const RAW_COUNTRIES: Array<Omit<CountryClockEntry, 'flag'>> = [
  // Asia
  { code: 'NP', country: 'Nepal', city: 'Kathmandu', region: 'Asia', timeZone: 'Asia/Kathmandu' },
  { code: 'IN', country: 'India', city: 'New Delhi', region: 'Asia', timeZone: 'Asia/Kolkata' },
  { code: 'PK', country: 'Pakistan', city: 'Islamabad', region: 'Asia', timeZone: 'Asia/Karachi' },
  { code: 'BD', country: 'Bangladesh', city: 'Dhaka', region: 'Asia', timeZone: 'Asia/Dhaka' },
  { code: 'LK', country: 'Sri Lanka', city: 'Colombo', region: 'Asia', timeZone: 'Asia/Colombo' },
  { code: 'BT', country: 'Bhutan', city: 'Thimphu', region: 'Asia', timeZone: 'Asia/Thimphu' },
  { code: 'MV', country: 'Maldives', city: 'Malé', region: 'Asia', timeZone: 'Indian/Maldives' },
  { code: 'AF', country: 'Afghanistan', city: 'Kabul', region: 'Asia', timeZone: 'Asia/Kabul' },
  { code: 'CN', country: 'China', city: 'Beijing', region: 'Asia', timeZone: 'Asia/Shanghai' },
  { code: 'JP', country: 'Japan', city: 'Tokyo', region: 'Asia', timeZone: 'Asia/Tokyo' },
  { code: 'KR', country: 'South Korea', city: 'Seoul', region: 'Asia', timeZone: 'Asia/Seoul' },
  { code: 'KP', country: 'North Korea', city: 'Pyongyang', region: 'Asia', timeZone: 'Asia/Pyongyang' },
  { code: 'TW', country: 'Taiwan', city: 'Taipei', region: 'Asia', timeZone: 'Asia/Taipei' },
  { code: 'HK', country: 'Hong Kong', city: 'Hong Kong', region: 'Asia', timeZone: 'Asia/Hong_Kong' },
  { code: 'MO', country: 'Macau', city: 'Macau', region: 'Asia', timeZone: 'Asia/Macau' },
  { code: 'MN', country: 'Mongolia', city: 'Ulaanbaatar', region: 'Asia', timeZone: 'Asia/Ulaanbaatar' },
  { code: 'TH', country: 'Thailand', city: 'Bangkok', region: 'Asia', timeZone: 'Asia/Bangkok' },
  { code: 'VN', country: 'Vietnam', city: 'Hanoi', region: 'Asia', timeZone: 'Asia/Ho_Chi_Minh' },
  { code: 'SG', country: 'Singapore', city: 'Singapore', region: 'Asia', timeZone: 'Asia/Singapore' },
  { code: 'MY', country: 'Malaysia', city: 'Kuala Lumpur', region: 'Asia', timeZone: 'Asia/Kuala_Lumpur' },
  { code: 'ID', country: 'Indonesia', city: 'Jakarta', region: 'Asia', timeZone: 'Asia/Jakarta' },
  { code: 'PH', country: 'Philippines', city: 'Manila', region: 'Asia', timeZone: 'Asia/Manila' },
  { code: 'MM', country: 'Myanmar', city: 'Yangon', region: 'Asia', timeZone: 'Asia/Yangon' },
  { code: 'KH', country: 'Cambodia', city: 'Phnom Penh', region: 'Asia', timeZone: 'Asia/Phnom_Penh' },
  { code: 'LA', country: 'Laos', city: 'Vientiane', region: 'Asia', timeZone: 'Asia/Vientiane' },
  { code: 'BN', country: 'Brunei', city: 'Bandar Seri Begawan', region: 'Asia', timeZone: 'Asia/Brunei' },
  { code: 'TL', country: 'Timor-Leste', city: 'Dili', region: 'Asia', timeZone: 'Asia/Dili' },
  { code: 'KZ', country: 'Kazakhstan', city: 'Almaty', region: 'Asia', timeZone: 'Asia/Almaty' },
  { code: 'UZ', country: 'Uzbekistan', city: 'Tashkent', region: 'Asia', timeZone: 'Asia/Tashkent' },
  { code: 'KG', country: 'Kyrgyzstan', city: 'Bishkek', region: 'Asia', timeZone: 'Asia/Bishkek' },
  { code: 'TJ', country: 'Tajikistan', city: 'Dushanbe', region: 'Asia', timeZone: 'Asia/Dushanbe' },
  { code: 'TM', country: 'Turkmenistan', city: 'Ashgabat', region: 'Asia', timeZone: 'Asia/Ashgabat' },
  { code: 'AZ', country: 'Azerbaijan', city: 'Baku', region: 'Asia', timeZone: 'Asia/Baku' },
  { code: 'AM', country: 'Armenia', city: 'Yerevan', region: 'Asia', timeZone: 'Asia/Yerevan' },
  { code: 'GE', country: 'Georgia', city: 'Tbilisi', region: 'Asia', timeZone: 'Asia/Tbilisi' },

  // Middle East
  { code: 'AE', country: 'United Arab Emirates', city: 'Dubai', region: 'Middle East', timeZone: 'Asia/Dubai' },
  { code: 'SA', country: 'Saudi Arabia', city: 'Riyadh', region: 'Middle East', timeZone: 'Asia/Riyadh' },
  { code: 'QA', country: 'Qatar', city: 'Doha', region: 'Middle East', timeZone: 'Asia/Qatar' },
  { code: 'KW', country: 'Kuwait', city: 'Kuwait City', region: 'Middle East', timeZone: 'Asia/Kuwait' },
  { code: 'BH', country: 'Bahrain', city: 'Manama', region: 'Middle East', timeZone: 'Asia/Bahrain' },
  { code: 'OM', country: 'Oman', city: 'Muscat', region: 'Middle East', timeZone: 'Asia/Muscat' },
  { code: 'YE', country: 'Yemen', city: 'Sanaa', region: 'Middle East', timeZone: 'Asia/Aden' },
  { code: 'JO', country: 'Jordan', city: 'Amman', region: 'Middle East', timeZone: 'Asia/Amman' },
  { code: 'LB', country: 'Lebanon', city: 'Beirut', region: 'Middle East', timeZone: 'Asia/Beirut' },
  { code: 'IL', country: 'Israel', city: 'Jerusalem', region: 'Middle East', timeZone: 'Asia/Jerusalem' },
  { code: 'PS', country: 'Palestine', city: 'Ramallah', region: 'Middle East', timeZone: 'Asia/Hebron' },
  { code: 'SY', country: 'Syria', city: 'Damascus', region: 'Middle East', timeZone: 'Asia/Damascus' },
  { code: 'IQ', country: 'Iraq', city: 'Baghdad', region: 'Middle East', timeZone: 'Asia/Baghdad' },
  { code: 'IR', country: 'Iran', city: 'Tehran', region: 'Middle East', timeZone: 'Asia/Tehran' },
  { code: 'TR', country: 'Turkey', city: 'Istanbul', region: 'Middle East', timeZone: 'Europe/Istanbul' },
  { code: 'CY', country: 'Cyprus', city: 'Nicosia', region: 'Middle East', timeZone: 'Asia/Nicosia' },

  // Europe
  { code: 'GB', country: 'United Kingdom', city: 'London', region: 'Europe', timeZone: 'Europe/London' },
  { code: 'IE', country: 'Ireland', city: 'Dublin', region: 'Europe', timeZone: 'Europe/Dublin' },
  { code: 'FR', country: 'France', city: 'Paris', region: 'Europe', timeZone: 'Europe/Paris' },
  { code: 'DE', country: 'Germany', city: 'Berlin', region: 'Europe', timeZone: 'Europe/Berlin' },
  { code: 'ES', country: 'Spain', city: 'Madrid', region: 'Europe', timeZone: 'Europe/Madrid' },
  { code: 'PT', country: 'Portugal', city: 'Lisbon', region: 'Europe', timeZone: 'Europe/Lisbon' },
  { code: 'IT', country: 'Italy', city: 'Rome', region: 'Europe', timeZone: 'Europe/Rome' },
  { code: 'CH', country: 'Switzerland', city: 'Zurich', region: 'Europe', timeZone: 'Europe/Zurich' },
  { code: 'AT', country: 'Austria', city: 'Vienna', region: 'Europe', timeZone: 'Europe/Vienna' },
  { code: 'NL', country: 'Netherlands', city: 'Amsterdam', region: 'Europe', timeZone: 'Europe/Amsterdam' },
  { code: 'BE', country: 'Belgium', city: 'Brussels', region: 'Europe', timeZone: 'Europe/Brussels' },
  { code: 'LU', country: 'Luxembourg', city: 'Luxembourg', region: 'Europe', timeZone: 'Europe/Luxembourg' },
  { code: 'DK', country: 'Denmark', city: 'Copenhagen', region: 'Europe', timeZone: 'Europe/Copenhagen' },
  { code: 'NO', country: 'Norway', city: 'Oslo', region: 'Europe', timeZone: 'Europe/Oslo' },
  { code: 'SE', country: 'Sweden', city: 'Stockholm', region: 'Europe', timeZone: 'Europe/Stockholm' },
  { code: 'FI', country: 'Finland', city: 'Helsinki', region: 'Europe', timeZone: 'Europe/Helsinki' },
  { code: 'IS', country: 'Iceland', city: 'Reykjavik', region: 'Europe', timeZone: 'Atlantic/Reykjavik' },
  { code: 'PL', country: 'Poland', city: 'Warsaw', region: 'Europe', timeZone: 'Europe/Warsaw' },
  { code: 'CZ', country: 'Czechia', city: 'Prague', region: 'Europe', timeZone: 'Europe/Prague' },
  { code: 'SK', country: 'Slovakia', city: 'Bratislava', region: 'Europe', timeZone: 'Europe/Bratislava' },
  { code: 'HU', country: 'Hungary', city: 'Budapest', region: 'Europe', timeZone: 'Europe/Budapest' },
  { code: 'RO', country: 'Romania', city: 'Bucharest', region: 'Europe', timeZone: 'Europe/Bucharest' },
  { code: 'BG', country: 'Bulgaria', city: 'Sofia', region: 'Europe', timeZone: 'Europe/Sofia' },
  { code: 'GR', country: 'Greece', city: 'Athens', region: 'Europe', timeZone: 'Europe/Athens' },
  { code: 'UA', country: 'Ukraine', city: 'Kyiv', region: 'Europe', timeZone: 'Europe/Kyiv' },
  { code: 'BY', country: 'Belarus', city: 'Minsk', region: 'Europe', timeZone: 'Europe/Minsk' },
  { code: 'RU', country: 'Russia', city: 'Moscow', region: 'Europe', timeZone: 'Europe/Moscow' },
  { code: 'EE', country: 'Estonia', city: 'Tallinn', region: 'Europe', timeZone: 'Europe/Tallinn' },
  { code: 'LV', country: 'Latvia', city: 'Riga', region: 'Europe', timeZone: 'Europe/Riga' },
  { code: 'LT', country: 'Lithuania', city: 'Vilnius', region: 'Europe', timeZone: 'Europe/Vilnius' },
  { code: 'MD', country: 'Moldova', city: 'Chisinau', region: 'Europe', timeZone: 'Europe/Chisinau' },
  { code: 'RS', country: 'Serbia', city: 'Belgrade', region: 'Europe', timeZone: 'Europe/Belgrade' },
  { code: 'HR', country: 'Croatia', city: 'Zagreb', region: 'Europe', timeZone: 'Europe/Zagreb' },
  { code: 'SI', country: 'Slovenia', city: 'Ljubljana', region: 'Europe', timeZone: 'Europe/Ljubljana' },
  { code: 'BA', country: 'Bosnia & Herzegovina', city: 'Sarajevo', region: 'Europe', timeZone: 'Europe/Sarajevo' },
  { code: 'ME', country: 'Montenegro', city: 'Podgorica', region: 'Europe', timeZone: 'Europe/Podgorica' },
  { code: 'MK', country: 'North Macedonia', city: 'Skopje', region: 'Europe', timeZone: 'Europe/Skopje' },
  { code: 'AL', country: 'Albania', city: 'Tirana', region: 'Europe', timeZone: 'Europe/Tirane' },
  { code: 'XK', country: 'Kosovo', city: 'Pristina', region: 'Europe', timeZone: 'Europe/Belgrade' },
  { code: 'MT', country: 'Malta', city: 'Valletta', region: 'Europe', timeZone: 'Europe/Malta' },
  { code: 'MC', country: 'Monaco', city: 'Monaco', region: 'Europe', timeZone: 'Europe/Monaco' },
  { code: 'AD', country: 'Andorra', city: 'Andorra la Vella', region: 'Europe', timeZone: 'Europe/Andorra' },
  { code: 'LI', country: 'Liechtenstein', city: 'Vaduz', region: 'Europe', timeZone: 'Europe/Vaduz' },
  { code: 'SM', country: 'San Marino', city: 'San Marino', region: 'Europe', timeZone: 'Europe/San_Marino' },
  { code: 'VA', country: 'Vatican City', city: 'Vatican City', region: 'Europe', timeZone: 'Europe/Vatican' },

  // Americas
  { code: 'US', country: 'United States', city: 'New York', region: 'Americas', timeZone: 'America/New_York' },
  { code: 'CA', country: 'Canada', city: 'Toronto', region: 'Americas', timeZone: 'America/Toronto' },
  { code: 'MX', country: 'Mexico', city: 'Mexico City', region: 'Americas', timeZone: 'America/Mexico_City' },
  { code: 'BR', country: 'Brazil', city: 'São Paulo', region: 'Americas', timeZone: 'America/Sao_Paulo' },
  { code: 'AR', country: 'Argentina', city: 'Buenos Aires', region: 'Americas', timeZone: 'America/Argentina/Buenos_Aires' },
  { code: 'CL', country: 'Chile', city: 'Santiago', region: 'Americas', timeZone: 'America/Santiago' },
  { code: 'CO', country: 'Colombia', city: 'Bogotá', region: 'Americas', timeZone: 'America/Bogota' },
  { code: 'PE', country: 'Peru', city: 'Lima', region: 'Americas', timeZone: 'America/Lima' },
  { code: 'VE', country: 'Venezuela', city: 'Caracas', region: 'Americas', timeZone: 'America/Caracas' },
  { code: 'EC', country: 'Ecuador', city: 'Quito', region: 'Americas', timeZone: 'America/Guayaquil' },
  { code: 'BO', country: 'Bolivia', city: 'La Paz', region: 'Americas', timeZone: 'America/La_Paz' },
  { code: 'PY', country: 'Paraguay', city: 'Asunción', region: 'Americas', timeZone: 'America/Asuncion' },
  { code: 'UY', country: 'Uruguay', city: 'Montevideo', region: 'Americas', timeZone: 'America/Montevideo' },
  { code: 'GY', country: 'Guyana', city: 'Georgetown', region: 'Americas', timeZone: 'America/Guyana' },
  { code: 'SR', country: 'Suriname', city: 'Paramaribo', region: 'Americas', timeZone: 'America/Paramaribo' },
  { code: 'CU', country: 'Cuba', city: 'Havana', region: 'Americas', timeZone: 'America/Havana' },
  { code: 'DO', country: 'Dominican Republic', city: 'Santo Domingo', region: 'Americas', timeZone: 'America/Santo_Domingo' },
  { code: 'HT', country: 'Haiti', city: 'Port-au-Prince', region: 'Americas', timeZone: 'America/Port-au-Prince' },
  { code: 'JM', country: 'Jamaica', city: 'Kingston', region: 'Americas', timeZone: 'America/Jamaica' },
  { code: 'PR', country: 'Puerto Rico', city: 'San Juan', region: 'Americas', timeZone: 'America/Puerto_Rico' },
  { code: 'BS', country: 'Bahamas', city: 'Nassau', region: 'Americas', timeZone: 'America/Nassau' },
  { code: 'BB', country: 'Barbados', city: 'Bridgetown', region: 'Americas', timeZone: 'America/Barbados' },
  { code: 'TT', country: 'Trinidad & Tobago', city: 'Port of Spain', region: 'Americas', timeZone: 'America/Port_of_Spain' },
  { code: 'CR', country: 'Costa Rica', city: 'San José', region: 'Americas', timeZone: 'America/Costa_Rica' },
  { code: 'PA', country: 'Panama', city: 'Panama City', region: 'Americas', timeZone: 'America/Panama' },
  { code: 'GT', country: 'Guatemala', city: 'Guatemala City', region: 'Americas', timeZone: 'America/Guatemala' },
  { code: 'HN', country: 'Honduras', city: 'Tegucigalpa', region: 'Americas', timeZone: 'America/Tegucigalpa' },
  { code: 'SV', country: 'El Salvador', city: 'San Salvador', region: 'Americas', timeZone: 'America/El_Salvador' },
  { code: 'NI', country: 'Nicaragua', city: 'Managua', region: 'Americas', timeZone: 'America/Managua' },
  { code: 'BZ', country: 'Belize', city: 'Belmopan', region: 'Americas', timeZone: 'America/Belize' },
  { code: 'AG', country: 'Antigua & Barbuda', city: "St. John's", region: 'Americas', timeZone: 'America/Antigua' },
  { code: 'DM', country: 'Dominica', city: 'Roseau', region: 'Americas', timeZone: 'America/Dominica' },
  { code: 'GD', country: 'Grenada', city: "St. George's", region: 'Americas', timeZone: 'America/Grenada' },
  { code: 'KN', country: 'Saint Kitts & Nevis', city: 'Basseterre', region: 'Americas', timeZone: 'America/St_Kitts' },
  { code: 'LC', country: 'Saint Lucia', city: 'Castries', region: 'Americas', timeZone: 'America/St_Lucia' },
  { code: 'VC', country: 'Saint Vincent', city: 'Kingstown', region: 'Americas', timeZone: 'America/St_Vincent' },

  // Africa
  { code: 'EG', country: 'Egypt', city: 'Cairo', region: 'Africa', timeZone: 'Africa/Cairo' },
  { code: 'NG', country: 'Nigeria', city: 'Lagos', region: 'Africa', timeZone: 'Africa/Lagos' },
  { code: 'ZA', country: 'South Africa', city: 'Johannesburg', region: 'Africa', timeZone: 'Africa/Johannesburg' },
  { code: 'KE', country: 'Kenya', city: 'Nairobi', region: 'Africa', timeZone: 'Africa/Nairobi' },
  { code: 'ET', country: 'Ethiopia', city: 'Addis Ababa', region: 'Africa', timeZone: 'Africa/Addis_Ababa' },
  { code: 'GH', country: 'Ghana', city: 'Accra', region: 'Africa', timeZone: 'Africa/Accra' },
  { code: 'MA', country: 'Morocco', city: 'Casablanca', region: 'Africa', timeZone: 'Africa/Casablanca' },
  { code: 'DZ', country: 'Algeria', city: 'Algiers', region: 'Africa', timeZone: 'Africa/Algiers' },
  { code: 'TN', country: 'Tunisia', city: 'Tunis', region: 'Africa', timeZone: 'Africa/Tunis' },
  { code: 'LY', country: 'Libya', city: 'Tripoli', region: 'Africa', timeZone: 'Africa/Tripoli' },
  { code: 'SD', country: 'Sudan', city: 'Khartoum', region: 'Africa', timeZone: 'Africa/Khartoum' },
  { code: 'SS', country: 'South Sudan', city: 'Juba', region: 'Africa', timeZone: 'Africa/Juba' },
  { code: 'TZ', country: 'Tanzania', city: 'Dar es Salaam', region: 'Africa', timeZone: 'Africa/Dar_es_Salaam' },
  { code: 'UG', country: 'Uganda', city: 'Kampala', region: 'Africa', timeZone: 'Africa/Kampala' },
  { code: 'RW', country: 'Rwanda', city: 'Kigali', region: 'Africa', timeZone: 'Africa/Kigali' },
  { code: 'BI', country: 'Burundi', city: 'Gitega', region: 'Africa', timeZone: 'Africa/Bujumbura' },
  { code: 'SO', country: 'Somalia', city: 'Mogadishu', region: 'Africa', timeZone: 'Africa/Mogadishu' },
  { code: 'DJ', country: 'Djibouti', city: 'Djibouti', region: 'Africa', timeZone: 'Africa/Djibouti' },
  { code: 'ER', country: 'Eritrea', city: 'Asmara', region: 'Africa', timeZone: 'Africa/Asmara' },
  { code: 'SN', country: 'Senegal', city: 'Dakar', region: 'Africa', timeZone: 'Africa/Dakar' },
  { code: 'CI', country: "Côte d'Ivoire", city: 'Abidjan', region: 'Africa', timeZone: 'Africa/Abidjan' },
  { code: 'CM', country: 'Cameroon', city: 'Douala', region: 'Africa', timeZone: 'Africa/Douala' },
  { code: 'CD', country: 'DR Congo', city: 'Kinshasa', region: 'Africa', timeZone: 'Africa/Kinshasa' },
  { code: 'CG', country: 'Republic of the Congo', city: 'Brazzaville', region: 'Africa', timeZone: 'Africa/Brazzaville' },
  { code: 'AO', country: 'Angola', city: 'Luanda', region: 'Africa', timeZone: 'Africa/Luanda' },
  { code: 'ZM', country: 'Zambia', city: 'Lusaka', region: 'Africa', timeZone: 'Africa/Lusaka' },
  { code: 'ZW', country: 'Zimbabwe', city: 'Harare', region: 'Africa', timeZone: 'Africa/Harare' },
  { code: 'MZ', country: 'Mozambique', city: 'Maputo', region: 'Africa', timeZone: 'Africa/Maputo' },
  { code: 'MW', country: 'Malawi', city: 'Lilongwe', region: 'Africa', timeZone: 'Africa/Blantyre' },
  { code: 'BW', country: 'Botswana', city: 'Gaborone', region: 'Africa', timeZone: 'Africa/Gaborone' },
  { code: 'NA', country: 'Namibia', city: 'Windhoek', region: 'Africa', timeZone: 'Africa/Windhoek' },
  { code: 'MG', country: 'Madagascar', city: 'Antananarivo', region: 'Africa', timeZone: 'Indian/Antananarivo' },
  { code: 'MU', country: 'Mauritius', city: 'Port Louis', region: 'Africa', timeZone: 'Indian/Mauritius' },
  { code: 'SC', country: 'Seychelles', city: 'Victoria', region: 'Africa', timeZone: 'Indian/Mahe' },
  { code: 'KM', country: 'Comoros', city: 'Moroni', region: 'Africa', timeZone: 'Indian/Comoro' },
  { code: 'CV', country: 'Cape Verde', city: 'Praia', region: 'Africa', timeZone: 'Atlantic/Cape_Verde' },
  { code: 'ML', country: 'Mali', city: 'Bamako', region: 'Africa', timeZone: 'Africa/Bamako' },
  { code: 'BF', country: 'Burkina Faso', city: 'Ouagadougou', region: 'Africa', timeZone: 'Africa/Ouagadougou' },
  { code: 'NE', country: 'Niger', city: 'Niamey', region: 'Africa', timeZone: 'Africa/Niamey' },
  { code: 'TD', country: 'Chad', city: "N'Djamena", region: 'Africa', timeZone: 'Africa/Ndjamena' },
  { code: 'MR', country: 'Mauritania', city: 'Nouakchott', region: 'Africa', timeZone: 'Africa/Nouakchott' },
  { code: 'GM', country: 'Gambia', city: 'Banjul', region: 'Africa', timeZone: 'Africa/Banjul' },
  { code: 'GN', country: 'Guinea', city: 'Conakry', region: 'Africa', timeZone: 'Africa/Conakry' },
  { code: 'GW', country: 'Guinea-Bissau', city: 'Bissau', region: 'Africa', timeZone: 'Africa/Bissau' },
  { code: 'SL', country: 'Sierra Leone', city: 'Freetown', region: 'Africa', timeZone: 'Africa/Freetown' },
  { code: 'LR', country: 'Liberia', city: 'Monrovia', region: 'Africa', timeZone: 'Africa/Monrovia' },
  { code: 'TG', country: 'Togo', city: 'Lomé', region: 'Africa', timeZone: 'Africa/Lome' },
  { code: 'BJ', country: 'Benin', city: 'Porto-Novo', region: 'Africa', timeZone: 'Africa/Porto-Novo' },
  { code: 'GA', country: 'Gabon', city: 'Libreville', region: 'Africa', timeZone: 'Africa/Libreville' },
  { code: 'GQ', country: 'Equatorial Guinea', city: 'Malabo', region: 'Africa', timeZone: 'Africa/Malabo' },
  { code: 'CF', country: 'Central African Republic', city: 'Bangui', region: 'Africa', timeZone: 'Africa/Bangui' },
  { code: 'ST', country: 'São Tomé & Príncipe', city: 'São Tomé', region: 'Africa', timeZone: 'Africa/Sao_Tome' },
  { code: 'SZ', country: 'Eswatini', city: 'Mbabane', region: 'Africa', timeZone: 'Africa/Mbabane' },
  { code: 'LS', country: 'Lesotho', city: 'Maseru', region: 'Africa', timeZone: 'Africa/Maseru' },

  // Oceania
  { code: 'AU', country: 'Australia', city: 'Sydney', region: 'Oceania', timeZone: 'Australia/Sydney' },
  { code: 'NZ', country: 'New Zealand', city: 'Auckland', region: 'Oceania', timeZone: 'Pacific/Auckland' },
  { code: 'FJ', country: 'Fiji', city: 'Suva', region: 'Oceania', timeZone: 'Pacific/Fiji' },
  { code: 'PG', country: 'Papua New Guinea', city: 'Port Moresby', region: 'Oceania', timeZone: 'Pacific/Port_Moresby' },
  { code: 'SB', country: 'Solomon Islands', city: 'Honiara', region: 'Oceania', timeZone: 'Pacific/Guadalcanal' },
  { code: 'VU', country: 'Vanuatu', city: 'Port Vila', region: 'Oceania', timeZone: 'Pacific/Efate' },
  { code: 'WS', country: 'Samoa', city: 'Apia', region: 'Oceania', timeZone: 'Pacific/Apia' },
  { code: 'TO', country: 'Tonga', city: "Nuku'alofa", region: 'Oceania', timeZone: 'Pacific/Tongatapu' },
  { code: 'KI', country: 'Kiribati', city: 'Tarawa', region: 'Oceania', timeZone: 'Pacific/Tarawa' },
  { code: 'PW', country: 'Palau', city: 'Ngerulmud', region: 'Oceania', timeZone: 'Pacific/Palau' },
  { code: 'FM', country: 'Micronesia', city: 'Palikir', region: 'Oceania', timeZone: 'Pacific/Pohnpei' },
  { code: 'MH', country: 'Marshall Islands', city: 'Majuro', region: 'Oceania', timeZone: 'Pacific/Majuro' },
  { code: 'NR', country: 'Nauru', city: 'Yaren', region: 'Oceania', timeZone: 'Pacific/Nauru' },
  { code: 'TV', country: 'Tuvalu', city: 'Funafuti', region: 'Oceania', timeZone: 'Pacific/Funafuti' },
];

export const ALL_COUNTRY_CLOCKS: CountryClockEntry[] = RAW_COUNTRIES.map((item) => ({
  ...item,
  flag: isoToFlag(item.code),
}));

export const DEFAULT_PINNED_COUNTRY_CODES = ['NP', 'US', 'GB', 'JP', 'AE', 'AU'];

export interface FormattedCountryTime {
  timeString: string;
  dateString: string;
  weekday: string;
  utcOffsetLabel: string;
  relativeDiffLabel: string;
  relativeDayLabel: 'Today' | 'Tomorrow' | 'Yesterday';
  isDaytime: boolean;
  hour24: number;
}

function getZoneOffsetMinutes(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);

  const lookup = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(
    Number(lookup.year),
    Number(lookup.month) - 1,
    Number(lookup.day),
    Number(lookup.hour),
    Number(lookup.minute),
    Number(lookup.second)
  );
  const baseUtc = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    date.getUTCHours(),
    date.getUTCMinutes(),
    date.getUTCSeconds()
  );
  return Math.round((asUtc - baseUtc) / 60000);
}

function formatOffsetLabel(offsetMinutes: number): string {
  if (offsetMinutes === 0) return 'UTC+0';
  const sign = offsetMinutes > 0 ? '+' : '-';
  const abs = Math.abs(offsetMinutes);
  const hrs = Math.floor(abs / 60);
  const mins = abs % 60;
  return mins === 0
    ? `UTC${sign}${hrs}`
    : `UTC${sign}${hrs}:${String(mins).padStart(2, '0')}`;
}

export function formatCountryTime(
  now: Date,
  timeZone: string,
  use24Hour: boolean = false
): FormattedCountryTime {
  try {
    const timeString = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: !use24Hour,
    }).format(now);

    const dateString = new Intl.DateTimeFormat('en-US', {
      timeZone,
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(now);

    const weekday = new Intl.DateTimeFormat('en-US', {
      timeZone,
      weekday: 'short',
    }).format(now);

    const hour24Str = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour: '2-digit',
      hourCycle: 'h23',
    }).format(now);
    const hour24 = Number(hour24Str) || 0;
    const isDaytime = hour24 >= 6 && hour24 < 18;

    const targetOffset = getZoneOffsetMinutes(now, timeZone);
    const localOffset = -now.getTimezoneOffset();
    const diffMins = targetOffset - localOffset;

    let relativeDiffLabel = 'Same time';
    if (diffMins !== 0) {
      const sign = diffMins > 0 ? '+' : '-';
      const absDiff = Math.abs(diffMins);
      const dh = Math.floor(absDiff / 60);
      const dm = absDiff % 60;
      relativeDiffLabel =
        dm === 0 ? `${sign}${dh}h` : `${sign}${dh}h ${dm}m`;
    }

    const targetYmd = new Intl.DateTimeFormat('en-CA', { timeZone }).format(now);
    const localYmd = new Intl.DateTimeFormat('en-CA').format(now);
    const relativeDayLabel: 'Today' | 'Tomorrow' | 'Yesterday' =
      targetYmd === localYmd ? 'Today' : targetYmd > localYmd ? 'Tomorrow' : 'Yesterday';

    return {
      timeString,
      dateString,
      weekday,
      utcOffsetLabel: formatOffsetLabel(targetOffset),
      relativeDiffLabel,
      relativeDayLabel,
      isDaytime,
      hour24,
    };
  } catch {
    return {
      timeString: now.toLocaleTimeString(),
      dateString: now.toLocaleDateString(),
      weekday: '',
      utcOffsetLabel: 'UTC',
      relativeDiffLabel: '--',
      relativeDayLabel: 'Today',
      isDaytime: true,
      hour24: 12,
    };
  }
}
