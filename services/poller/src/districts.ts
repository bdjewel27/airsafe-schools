/**
 * AirSafe Schools - Seed Data for 3 Demo Schools & All 64 Districts of Bangladesh (F-20)
 */

export interface DistrictSeed {
  id: string;
  nameEn: string;
  nameBn: string;
  division: string;
  lat: number;
  lon: number;
  baselineAqi: number;
  baselineHeatIndexC: number;
}

export const DEMO_SCHOOLS = [
  {
    id: 'school-dhaka-001',
    name: 'Dhaka Model School',
    nameBn: 'ঢাকা মডেল স্কুল',
    districtId: 'bd-dhaka',
    lat: 23.8103,
    lon: 90.4125,
    sites: [
      { id: 'dhk-001-field', nameEn: 'School Playground', nameBn: 'খেলার মাঠ', type: 'FIELD' },
      { id: 'dhk-001-courtyard', nameEn: 'School Courtyard', nameBn: 'স্কুল উঠান', type: 'COURTYARD' },
      { id: 'dhk-001-classroom-101', nameEn: 'Classroom 101', nameBn: 'ক্লাসরুম ১০১', type: 'CLASSROOM' },
    ],
  },
  {
    id: 'school-ctg-002',
    name: 'Chittagong Hills School',
    nameBn: 'চট্টগ্রাম হিলস স্কুল',
    districtId: 'bd-chattogram',
    lat: 22.3569,
    lon: 91.7832,
    sites: [
      { id: 'ctg-002-field', nameEn: 'Hilltop Field', nameBn: 'পাহাড়ি মাঠ', type: 'FIELD' },
      { id: 'ctg-002-courtyard', nameEn: 'Assembly Ground', nameBn: 'সমাবেশ প্রাঙ্গণ', type: 'COURTYARD' },
    ],
  },
  {
    id: 'school-raj-003',
    name: 'Rajshahi Padma School',
    nameBn: 'রাজশাহী পদ্মা স্কুল',
    districtId: 'bd-rajshahi',
    lat: 24.3636,
    lon: 88.6241,
    sites: [
      { id: 'raj-003-field', nameEn: 'Padma Sports Ground', nameBn: 'পদ্মা খেলার মাঠ', type: 'FIELD' },
      { id: 'raj-003-courtyard', nameEn: 'Main Veranda', nameBn: 'মূল বারান্দা', type: 'COURTYARD' },
    ],
  },
];

// Complete list of 64 Districts of Bangladesh with coordinates & modeled baseline (F-20)
export const BANGLADESH_64_DISTRICTS: DistrictSeed[] = [
  // Dhaka Division (13)
  { id: 'bd-dhaka', nameEn: 'Dhaka', nameBn: 'ঢাকা', division: 'Dhaka', lat: 23.8103, lon: 90.4125, baselineAqi: 155, baselineHeatIndexC: 36.5 },
  { id: 'bd-gazipur', nameEn: 'Gazipur', nameBn: 'গাজীপুর', division: 'Dhaka', lat: 24.0023, lon: 90.4264, baselineAqi: 148, baselineHeatIndexC: 36.0 },
  { id: 'bd-narayanganj', nameEn: 'Narayanganj', nameBn: 'নারায়ণগঞ্জ', division: 'Dhaka', lat: 23.6238, lon: 90.5000, baselineAqi: 162, baselineHeatIndexC: 36.8 },
  { id: 'bd-tangail', nameEn: 'Tangail', nameBn: 'টাঙ্গাইল', division: 'Dhaka', lat: 24.2513, lon: 89.9167, baselineAqi: 112, baselineHeatIndexC: 35.2 },
  { id: 'bd-manikganj', nameEn: 'Manikganj', nameBn: 'মানিকগঞ্জ', division: 'Dhaka', lat: 23.8617, lon: 90.0003, baselineAqi: 118, baselineHeatIndexC: 35.5 },
  { id: 'bd-munshiganj', nameEn: 'Munshiganj', nameBn: 'মুন্সিগঞ্জ', division: 'Dhaka', lat: 23.5422, lon: 90.5305, baselineAqi: 125, baselineHeatIndexC: 35.4 },
  { id: 'bd-narsingdi', nameEn: 'Narsingdi', nameBn: 'নরসিংদী', division: 'Dhaka', lat: 23.9229, lon: 90.7177, baselineAqi: 132, baselineHeatIndexC: 35.6 },
  { id: 'bd-kishoreganj', nameEn: 'Kishoreganj', nameBn: 'কিশোরগঞ্জ', division: 'Dhaka', lat: 24.4449, lon: 90.7766, baselineAqi: 98, baselineHeatIndexC: 34.5 },
  { id: 'bd-faridpur', nameEn: 'Faridpur', nameBn: 'ফরিদপুর', division: 'Dhaka', lat: 23.6070, lon: 89.8429, baselineAqi: 108, baselineHeatIndexC: 35.8 },
  { id: 'bd-gopalganj', nameEn: 'Gopalganj', nameBn: 'গোপালগঞ্জ', division: 'Dhaka', lat: 23.0051, lon: 89.8266, baselineAqi: 95, baselineHeatIndexC: 35.0 },
  { id: 'bd-madaripur', nameEn: 'Madaripur', nameBn: 'মাদারীপুর', division: 'Dhaka', lat: 23.1641, lon: 90.1897, baselineAqi: 102, baselineHeatIndexC: 35.2 },
  { id: 'bd-rajbari', nameEn: 'Rajbari', nameBn: 'রাজবাড়ী', division: 'Dhaka', lat: 23.7574, lon: 89.6445, baselineAqi: 110, baselineHeatIndexC: 36.0 },
  { id: 'bd-shariatpur', nameEn: 'Shariatpur', nameBn: 'শরীয়তপুর', division: 'Dhaka', lat: 23.2423, lon: 90.4348, baselineAqi: 96, baselineHeatIndexC: 34.9 },

  // Chattogram Division (11)
  { id: 'bd-chattogram', nameEn: 'Chattogram', nameBn: 'চট্টগ্রাম', division: 'Chattogram', lat: 22.3569, lon: 91.7832, baselineAqi: 115, baselineHeatIndexC: 34.2 },
  { id: 'bd-coxsbazar', nameEn: "Cox's Bazar", nameBn: 'কক্সবাজার', division: 'Chattogram', lat: 21.4272, lon: 92.0058, baselineAqi: 68, baselineHeatIndexC: 33.0 },
  { id: 'bd-cumilla', nameEn: 'Cumilla', nameBn: 'কুমিল্লা', division: 'Chattogram', lat: 23.4607, lon: 91.1809, baselineAqi: 124, baselineHeatIndexC: 35.1 },
  { id: 'bd-brahmanbaria', nameEn: 'Brahmanbaria', nameBn: 'ব্রাহ্মণবাড়িয়া', division: 'Chattogram', lat: 23.9571, lon: 91.1119, baselineAqi: 120, baselineHeatIndexC: 35.0 },
  { id: 'bd-chandpur', nameEn: 'Chandpur', nameBn: 'চাঁদপুর', division: 'Chattogram', lat: 23.2333, lon: 90.6713, baselineAqi: 105, baselineHeatIndexC: 34.8 },
  { id: 'bd-noakhali', nameEn: 'Noakhali', nameBn: 'নোয়াখালী', division: 'Chattogram', lat: 22.8696, lon: 91.0994, baselineAqi: 92, baselineHeatIndexC: 34.4 },
  { id: 'bd-feni', nameEn: 'Feni', nameBn: 'ফেনী', division: 'Chattogram', lat: 23.0159, lon: 91.3976, baselineAqi: 104, baselineHeatIndexC: 34.6 },
  { id: 'bd-lakshmipur', nameEn: 'Lakshmipur', nameBn: 'লক্ষ্মীপুর', division: 'Chattogram', lat: 22.9447, lon: 90.8282, baselineAqi: 94, baselineHeatIndexC: 34.5 },
  { id: 'bd-rangamati', nameEn: 'Rangamati', nameBn: 'রাঙ্গামাটি', division: 'Chattogram', lat: 22.6533, lon: 92.1789, baselineAqi: 62, baselineHeatIndexC: 32.8 },
  { id: 'bd-khagrachhari', nameEn: 'Khagrachhari', nameBn: 'খাগড়াছড়ি', division: 'Chattogram', lat: 23.1193, lon: 91.9847, baselineAqi: 65, baselineHeatIndexC: 32.6 },
  { id: 'bd-bandarban', nameEn: 'Bandarban', nameBn: 'বান্দরবান', division: 'Chattogram', lat: 22.1953, lon: 92.2184, baselineAqi: 58, baselineHeatIndexC: 32.4 },

  // Rajshahi Division (8)
  { id: 'bd-rajshahi', nameEn: 'Rajshahi', nameBn: 'রাজশাহী', division: 'Rajshahi', lat: 24.3636, lon: 88.6241, baselineAqi: 118, baselineHeatIndexC: 39.2 },
  { id: 'bd-bogura', nameEn: 'Bogura', nameBn: 'বগুড়া', division: 'Rajshahi', lat: 24.8465, lon: 89.3773, baselineAqi: 114, baselineHeatIndexC: 37.0 },
  { id: 'bd-pabna', nameEn: 'Pabna', nameBn: 'পাবনা', division: 'Rajshahi', lat: 24.0064, lon: 89.2372, baselineAqi: 116, baselineHeatIndexC: 38.4 },
  { id: 'bd-sirajganj', nameEn: 'Sirajganj', nameBn: 'সিরাজগঞ্জ', division: 'Rajshahi', lat: 24.4534, lon: 89.7007, baselineAqi: 110, baselineHeatIndexC: 36.8 },
  { id: 'bd-natore', nameEn: 'Natore', nameBn: 'নাটোর', division: 'Rajshahi', lat: 24.4206, lon: 89.0003, baselineAqi: 108, baselineHeatIndexC: 38.5 },
  { id: 'bd-naogaon', nameEn: 'Naogaon', nameBn: 'নওগাঁ', division: 'Rajshahi', lat: 24.7936, lon: 88.9318, baselineAqi: 106, baselineHeatIndexC: 38.0 },
  { id: 'bd-chapainawabganj', nameEn: 'Chapainawabganj', nameBn: 'চাঁপাইনবাবগঞ্জ', division: 'Rajshahi', lat: 24.5965, lon: 88.2775, baselineAqi: 112, baselineHeatIndexC: 39.5 },
  { id: 'bd-joypurhat', nameEn: 'Joypurhat', nameBn: 'জয়পুরহাট', division: 'Rajshahi', lat: 25.0968, lon: 89.0227, baselineAqi: 102, baselineHeatIndexC: 36.9 },

  // Khulna Division (10)
  { id: 'bd-khulna', nameEn: 'Khulna', nameBn: 'খুলনা', division: 'Khulna', lat: 22.8456, lon: 89.5403, baselineAqi: 108, baselineHeatIndexC: 37.2 },
  { id: 'bd-jashore', nameEn: 'Jashore', nameBn: 'যশোর', division: 'Khulna', lat: 23.1664, lon: 89.2081, baselineAqi: 112, baselineHeatIndexC: 38.6 },
  { id: 'bd-kushtia', nameEn: 'Kushtia', nameBn: 'কুষ্টিয়া', division: 'Khulna', lat: 23.9013, lon: 89.1204, baselineAqi: 115, baselineHeatIndexC: 38.8 },
  { id: 'bd-satkhira', nameEn: 'Satkhira', nameBn: 'সাতক্ষীরা', division: 'Khulna', lat: 22.7185, lon: 89.0705, baselineAqi: 96, baselineHeatIndexC: 37.4 },
  { id: 'bd-bagerhat', nameEn: 'Bagerhat', nameBn: 'বাগেরহাট', division: 'Khulna', lat: 22.6516, lon: 89.7859, baselineAqi: 90, baselineHeatIndexC: 36.5 },
  { id: 'bd-jhenaidah', nameEn: 'Jhenaidah', nameBn: 'ঝিনাইদহ', division: 'Khulna', lat: 23.5450, lon: 89.1726, baselineAqi: 104, baselineHeatIndexC: 38.0 },
  { id: 'bd-magura', nameEn: 'Magura', nameBn: 'মাগুরা', division: 'Khulna', lat: 23.4873, lon: 89.4199, baselineAqi: 102, baselineHeatIndexC: 37.6 },
  { id: 'bd-narail', nameEn: 'Narail', nameBn: 'নড়াইল', division: 'Khulna', lat: 23.1725, lon: 89.5127, baselineAqi: 98, baselineHeatIndexC: 37.1 },
  { id: 'bd-chuadanga', nameEn: 'Chuadanga', nameBn: 'চুয়াডাঙ্গা', division: 'Khulna', lat: 23.6402, lon: 88.8418, baselineAqi: 114, baselineHeatIndexC: 39.8 },
  { id: 'bd-meherpur', nameEn: 'Meherpur', nameBn: 'মেহেরপুর', division: 'Khulna', lat: 23.7622, lon: 88.6318, baselineAqi: 110, baselineHeatIndexC: 39.4 },

  // Sylhet Division (4)
  { id: 'bd-sylhet', nameEn: 'Sylhet', nameBn: 'সিলেট', division: 'Sylhet', lat: 24.8949, lon: 91.8687, baselineAqi: 72, baselineHeatIndexC: 32.5 },
  { id: 'bd-moulvibazar', nameEn: 'Moulvibazar', nameBn: 'মৌলভীবাজার', division: 'Sylhet', lat: 24.4829, lon: 91.7774, baselineAqi: 68, baselineHeatIndexC: 32.8 },
  { id: 'bd-habiganj', nameEn: 'Habiganj', nameBn: 'হবিগঞ্জ', division: 'Sylhet', lat: 24.3749, lon: 91.4155, baselineAqi: 78, baselineHeatIndexC: 33.4 },
  { id: 'bd-sunamganj', nameEn: 'Sunamganj', nameBn: 'সুনামগঞ্জ', division: 'Sylhet', lat: 25.0658, lon: 91.3950, baselineAqi: 66, baselineHeatIndexC: 32.2 },

  // Barishal Division (6)
  { id: 'bd-barishal', nameEn: 'Barishal', nameBn: 'বরিশাল', division: 'Barishal', lat: 22.7010, lon: 90.3535, baselineAqi: 88, baselineHeatIndexC: 35.0 },
  { id: 'bd-patuakhali', nameEn: 'Patuakhali', nameBn: 'পটুয়াখালী', division: 'Barishal', lat: 22.3596, lon: 90.3298, baselineAqi: 76, baselineHeatIndexC: 34.5 },
  { id: 'bd-bhola', nameEn: 'Bhola', nameBn: 'ভোলা', division: 'Barishal', lat: 22.6859, lon: 90.6482, baselineAqi: 78, baselineHeatIndexC: 34.4 },
  { id: 'bd-pirojpur', nameEn: 'Pirojpur', nameBn: 'পিরোজপুর', division: 'Barishal', lat: 22.5841, lon: 89.9720, baselineAqi: 82, baselineHeatIndexC: 34.8 },
  { id: 'bd-jhalokati', nameEn: 'Jhalokati', nameBn: 'ঝালকাঠি', division: 'Barishal', lat: 22.6406, lon: 90.1987, baselineAqi: 84, baselineHeatIndexC: 34.9 },
  { id: 'bd-barguna', nameEn: 'Barguna', nameBn: 'বরগুনা', division: 'Barishal', lat: 22.1592, lon: 90.1255, baselineAqi: 74, baselineHeatIndexC: 34.2 },

  // Rangpur Division (8)
  { id: 'bd-rangpur', nameEn: 'Rangpur', nameBn: 'রংপুর', division: 'Rangpur', lat: 25.7439, lon: 89.2752, baselineAqi: 105, baselineHeatIndexC: 35.2 },
  { id: 'bd-dinajpur', nameEn: 'Dinajpur', nameBn: 'দিনাজপুর', division: 'Rangpur', lat: 25.6217, lon: 88.6354, baselineAqi: 108, baselineHeatIndexC: 35.8 },
  { id: 'bd-kurigram', nameEn: 'Kurigram', nameBn: 'কুড়িগ্রাম', division: 'Rangpur', lat: 25.8054, lon: 89.6362, baselineAqi: 92, baselineHeatIndexC: 34.4 },
  { id: 'bd-gaibandha', nameEn: 'Gaibandha', nameBn: 'গাইবান্ধা', division: 'Rangpur', lat: 25.3288, lon: 89.5281, baselineAqi: 98, baselineHeatIndexC: 35.0 },
  { id: 'bd-nilphamari', nameEn: 'Nilphamari', nameBn: 'নীলফামারী', division: 'Rangpur', lat: 25.9318, lon: 88.8560, baselineAqi: 96, baselineHeatIndexC: 34.8 },
  { id: 'bd-lalmonirhat', nameEn: 'Lalmonirhat', nameBn: 'লালমনিরহাট', division: 'Rangpur', lat: 25.9923, lon: 89.2847, baselineAqi: 90, baselineHeatIndexC: 34.5 },
  { id: 'bd-thakurgaon', nameEn: 'Thakurgaon', nameBn: 'ঠাকুরগাঁও', division: 'Rangpur', lat: 26.0337, lon: 88.4617, baselineAqi: 94, baselineHeatIndexC: 34.9 },
  { id: 'bd-panchagarh', nameEn: 'Panchagarh', nameBn: 'পঞ্চগড়', division: 'Rangpur', lat: 26.3411, lon: 88.5542, baselineAqi: 85, baselineHeatIndexC: 33.8 },

  // Mymensingh Division (4)
  { id: 'bd-mymensingh', nameEn: 'Mymensingh', nameBn: 'ময়মনসিংহ', division: 'Mymensingh', lat: 24.7471, lon: 90.4203, baselineAqi: 108, baselineHeatIndexC: 34.8 },
  { id: 'bd-jamalpur', nameEn: 'Jamalpur', nameBn: 'জামালপুর', division: 'Mymensingh', lat: 24.9375, lon: 89.9378, baselineAqi: 102, baselineHeatIndexC: 35.0 },
  { id: 'bd-netrokona', nameEn: 'Netrokona', nameBn: 'নেত্রকোনা', division: 'Mymensingh', lat: 24.8710, lon: 90.7279, baselineAqi: 88, baselineHeatIndexC: 34.0 },
  { id: 'bd-sherpur', nameEn: 'Sherpur', nameBn: 'শেরপুর', division: 'Mymensingh', lat: 25.0205, lon: 90.0153, baselineAqi: 92, baselineHeatIndexC: 34.4 },
];
