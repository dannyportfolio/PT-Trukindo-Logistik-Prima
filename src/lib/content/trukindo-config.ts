/**
 * Trukindo Corporate Profile & Content Integrity Gating Store
 *
 * Implements strict content integrity rules:
 * - Unconfirmed corporate claims (founding year, fleet count, warehouse counts, client logos, certifications)
 *   are tagged as NEEDS_VERIFICATION and strictly suppressed from public rendering.
 * - Confirmed services and industry-standard technical specifications are verified for public display.
 */

export type VerificationStatus = "VERIFIED" | "NEEDS_VERIFICATION";

export interface CompanyFact<T> {
  value: T;
  status: VerificationStatus;
  notes?: string;
}

export interface ServiceItem {
  id: string;
  title: string;
  shortDesc: string;
  fullDesc: string;
  features: string[];
  status: VerificationStatus;
}

export interface TruckClassSpec {
  id: string;
  name: string;
  wheels: number;
  maxPayloadTon: string;
  approxVolumeCbm: string;
  typicalDimensions: string;
  suitableCargo: string[];
  description: string;
  imageSrc?: string;
  imageAlt?: string;
}

export interface IndustrySector {
  id: string;
  name: string;
  painPoints: string;
  solution: string;
  recommendedFleet: string;
}

export const TRUKINDO_PROFILE = {
  legalName: "PT Trukindo Logistik Prima",
  brandName: "Trukindo Logistics Platform",
  tagline: "Menghubungkan Bisnis, Menggerakkan Logistik.",
  description:
    "Penyedia solusi transportasi darat B2B terpercaya di Indonesia, mengkhususkan diri pada angkutan muatan penuh (FTL), linehaul reguler antarkota, dan manajemen armada kontrak terdedikasi untuk sektor industri dan FMCG.",

  // Gated Corporate Facts (Strictly Quarantined)
  foundingYear: {
    value: null,
    status: "NEEDS_VERIFICATION",
    notes: "Menunggu salinan NIB/Akta Perusahaan resmi dari manajemen",
  } as CompanyFact<number | null>,

  fleetSizeCount: {
    value: null,
    status: "NEEDS_VERIFICATION",
    notes: "Membutuhkan data inventaris aset kendaraan terverifikasi",
  } as CompanyFact<number | null>,

  ownedWarehousesCount: {
    value: null,
    status: "NEEDS_VERIFICATION",
    notes: "Fokus operasional saat ini adalah trucking point-to-point; pergudangan berstatus unverified",
  } as CompanyFact<number | null>,

  officeLocations: {
    value: ["DKI Jakarta (Pusat Koordinasi Operasional)"],
    status: "NEEDS_VERIFICATION",
    notes: "Alamat fisik pool/depo menunggu validasi perizinan operasional",
  } as CompanyFact<string[]>,

  clientLogos: {
    value: [],
    status: "NEEDS_VERIFICATION",
    notes: "Memerlukan persetujuan tertulis / NDA sebelum menampilkan merek klien komersial",
  } as CompanyFact<string[]>,

  certifications: {
    value: [],
    status: "NEEDS_VERIFICATION",
    notes: "Sertifikasi ISO/SMK-TD tidak boleh dipublikasikan tanpa dokumen verifikasi resmi",
  } as CompanyFact<string[]>,

  contactInfo: {
    phone: "+62 21 5082 0000",
    email: "commercial@trukindo.co.id",
    workingHours: "Senin – Jumat: 08.00 – 17.00 WIB | Operasional Darurat 24/7",
    serviceCorridor: "Koridor Utama Jawa – Bali – Sumatra",
  },

  // Confirmed Services
  confirmedServices: [
    {
      id: "ftl-trucking",
      title: "Full Truck Load (FTL)",
      shortDesc: "Carter penuh satu armada point-to-point antarkota dan antarpulau.",
      fullDesc:
        "Layanan pengangkutan darat carter penuh berkapasitas besar dengan rute langsung tanpa transit atau konsolidasi muatan pihak ketiga. Memastikan kecepatan waktu tempuh dan integritas keamanan kargo dari gudang pengirim hingga ke titik distribusi penerima.",
      features: [
        "Satu armada eksklusif untuk muatan Anda",
        "Rute langsung point-to-point tanpa transit",
        "Segel pengaman dan berita acara serah terima jelas",
        "Kapasitas muatan hingga 25 ton",
      ],
      status: "VERIFIED",
    },
    {
      id: "scheduled-linehaul",
      title: "Scheduled Linehaul",
      shortDesc: "Jadwal keberangkatan reguler antarkota di koridor industri nasional.",
      fullDesc:
        "Jadwal pengiriman terjadwal yang menghubungkan sentra-sentra manufaktur dan distribusi utama di koridor Pantura, Jawa Barat, Jawa Tengah, Jawa Timur, hingga Bali dan Sumatra.",
      features: [
        "Jadwal keberangkatan terjadwal dan disiplin",
        "Konektivitas koridor logistik antarpulau",
        "Standar keselamatan pengemudi dan batas jam istirahat",
        "Laporan status pergerakan harian",
      ],
      status: "VERIFIED",
    },
    {
      id: "contract-logistics",
      title: "Dedicated Contract Logistics",
      shortDesc: "Armada dan pengemudi terdedikasi untuk kebutuhan manufaktur dan distribusi reguler.",
      fullDesc:
        "Kemitraan jangka panjang pengelolaan armada dan jadwal distribusi yang disesuaikan khusus dengan kebutuhan supply chain industri, FMCG, dan ritel grosir berskala besar.",
      features: [
        "Alokasi armada terdedikasi sesuai spesifikasi produk",
        "Pengemudi terlatih sesuai standar penanganan kargo spesifik",
        "Penetapan SLA operasional yang terukur",
        "Laporan evaluasi berkala dan optimasi rute",
      ],
      status: "VERIFIED",
    },
  ] as ServiceItem[],

  // Gated Services (Suppressed from active marketing until confirmed)
  unconfirmedServices: [
    {
      id: "cold-chain",
      title: "Cold Chain Transport",
      shortDesc: "Pengangkutan berpendingin terkontrol",
      fullDesc: "Layanan angkutan suhu terkendali untuk makanan beku dan farmasi.",
      features: [],
      status: "NEEDS_VERIFICATION",
    },
    {
      id: "customs-clearance",
      title: "Customs Clearance & Kepabeanan",
      shortDesc: "Pengurusan kepabeanan pelabuhan",
      fullDesc: "Layanan pengurusan dokumen PPJK ekspor impor.",
      features: [],
      status: "NEEDS_VERIFICATION",
    },
    {
      id: "cross-docking",
      title: "Pergudangan & Cross-Docking",
      shortDesc: "Pusat transit pergudangan",
      fullDesc: "Fasilitas bongkar muat dan transit logistik.",
      features: [],
      status: "NEEDS_VERIFICATION",
    },
  ] as ServiceItem[],

  // Standard Truck Class Specifications (Technical Industry Reference)
  truckClasses: [
    {
      id: "cde",
      name: "CDE (Colt Diesel Engkel)",
      wheels: 4,
      maxPayloadTon: "2.0 – 2.5 Ton",
      approxVolumeCbm: "9 CBM",
      typicalDimensions: "3.1m × 1.6m × 1.7m",
      suitableCargo: ["Barang Konsumsi Ringan", "Elektronik Ritel", "Distribusi Dalam Kota"],
      description: "Truk ringan lincah untuk pengiriman dalam kota dan akses area jalan sedang.",
      imageSrc: "/images/fleet/cde-engkel.jpg",
      imageAlt: "Truk ringan CDE Colt Diesel Engkel 4 roda boks putih polos unbranded untuk pengiriman kargo dalam kota",
    },
    {
      id: "cdd",
      name: "CDD (Colt Diesel Double)",
      wheels: 6,
      maxPayloadTon: "4.0 – 5.0 Ton",
      approxVolumeCbm: "14 – 16 CBM",
      typicalDimensions: "4.2m × 1.9m × 2.0m",
      suitableCargo: ["FMCG", "Bahan Makanan Kering", "Distribusi Antarkota Menengah"],
      description: "Pilihan paling populer untuk distribusi antarkota koridor industri regional.",
      imageSrc: "/images/scenarios/scenario-fmcg.jpg",
      imageAlt: "Truk medium CDD Colt Diesel Double 6 roda boks putih unbranded untuk distribusi regional",
    },
    {
      id: "fuso",
      name: "Fuso Berat",
      wheels: 6,
      maxPayloadTon: "7.0 – 8.0 Ton",
      approxVolumeCbm: "25 – 30 CBM",
      typicalDimensions: "6.0m × 2.4m × 2.2m",
      suitableCargo: ["Material Industri", "Suku Cadang Mesin", "Kargo Manufaktur"],
      description: "Kapasitas muatan sedang-tinggi untuk rute lintas provinsi berbeban berat.",
      imageSrc: "/images/fleet/fuso-medium.jpg",
      imageAlt: "Truk medium-duty Fuso 6 roda boks putih unbranded untuk angkutan manufaktur dan industri antarkota",
    },
    {
      id: "tronton",
      name: "Tronton (Box / Wingbox)",
      wheels: 10,
      maxPayloadTon: "15.0 – 20.0 Ton",
      approxVolumeCbm: "45 – 50 CBM",
      typicalDimensions: "9.4m × 2.4m × 2.4m",
      suitableCargo: ["FMCG Palet", "Barang Jadi Pabrik", "Bahan Baku Industri"],
      description: "Armada efisiensi tinggi dengan akses bongkar muat hidrolik wingbox di kedua sisi.",
      imageSrc: "/images/fleet/tronton-wingbox.jpg",
      imageAlt: "Truk berat Tronton Wingbox 10 roda 3-sumbu boks putih unbranded dengan pintu samping hidrolik terbuka",
    },
    {
      id: "trailer",
      name: "Trailer Container (20ft / 40ft)",
      wheels: 12,
      maxPayloadTon: "20.0 – 28.0 Ton",
      approxVolumeCbm: "33 – 67 CBM",
      typicalDimensions: "12.0m × 2.4m × 2.6m",
      suitableCargo: ["Kontainer Ekspor-Impor", "Mesin Berat", "Komoditas Grosir"],
      description: "Pengangkutan muatan kontainer volume ekstra besar antarterminal dan pelabuhan.",
      imageSrc: "/images/fleet/trailer-container.jpg",
      imageAlt: "Tractor head putih unbranded menarik semi-trailer kontainer 40ft di jalur pelabuhan logistik",
    },
  ] as TruckClassSpec[],

  // Target Industry Sectors Served
  industries: [
    {
      id: "fmcg",
      name: "FMCG & Fast-Moving Consumer Goods",
      painPoints: "Kebutuhan perputaran stok cepat, kebersihan armada, dan ketepatan waktu bongkar muat di distribution center.",
      solution: "Jadwal FTL terjadwal dengan armada box bersih dan pengikatan muatan tertutup rapat.",
      recommendedFleet: "Tronton Wingbox, CDD Box",
    },
    {
      id: "manufacturing",
      name: "Manufaktur & Bahan Baku Industri",
      painPoints: "Risiko keterlambatan pasokan yang dapat menghentikan lini produksi pabrik.",
      solution: "Kemitraan contract logistics terdedikasi dengan pemantauan jadwal transit berkala.",
      recommendedFleet: "Fuso Berat, Tronton Flatbed/Box",
    },
    {
      id: "building-materials",
      name: "Material Bangunan & Konstruksi",
      painPoints: "Beban berat, dimensi besar, dan akses ke lokasi proyek atau gudang agen.",
      solution: "Armada bak terbuka dan fuso berkekuatan sasis tinggi dengan SOP pengikatan kuat.",
      recommendedFleet: "Fuso, Tronton Flatbed",
    },
    {
      id: "electronics",
      name: "Elektronik & Perangkat Konsumsi",
      painPoints: "Kargo bernilai tinggi dengan kerentanan terhadap getaran, kelembapan, dan risiko kehilangan.",
      solution: "Armada boks tertutup rapat berpengaman ganda dengan prosedur serah terima ketat.",
      recommendedFleet: "CDD Box, Tronton Box",
    },
  ] as IndustrySector[],

  // Operations & Safety Standards
  safetyStandards: [
    {
      title: "Inspeksi Pra-Perjalanan (Pre-Trip Inspection)",
      description:
        "Setiap unit kendaraan wajib melalui checklist pemeriksaan teknis harian mencakup sistem rem, kondisi tapak ban, tekanan angin, lampu, serta sistem kemudi sebelum keluar dari pool.",
    },
    {
      title: "Standard Lashing & Pengikatan Kargo",
      description:
        "Penerapan standar pengikatan muatan bertaraf industri menggunakan tali ratchet dan bantalan pelindung untuk mencegah pergeseran kargo selama perjalanan di jalur tol maupun arteri.",
    },
    {
      title: "Kualifikasi Pengemudi & Disiplin Istirahat",
      description:
        "Pengemudi memiliki SIM B2 Umum aktif dengan rekam jejak keselamatan teruji, serta mematuhi batas jam mengemudi maksimal 4 jam sebelum wajib beristirahat.",
    },
    {
      title: "Kesiapsiagaan Darurat & Tim Pendukung",
      description:
        "Dukungan teknisi jalan darurat dan jaringan bengkel rekanan di sepanjang koridor arteri Trans-Jawa untuk meminimalkan waktu henti akibat kendala teknis tak terduga.",
    },
  ],
};

import {
  ServiceCategory,
  CargoClassification,
  TruckTypePreference,
  ShippingFrequency,
} from "@/types/inquiry";

export interface LogisticsScenario {
  id: string;
  title: string;
  industryCategory: string;
  imageSrc: string;
  imageAlt: string;
  narrative: string;
  needsSummary: string;
  cargoCharacteristics: string;
  illustrativeVehicle: string;
  originDestination: string;
  dispatchFrequency: string;
  keyConsiderations: string[];
  ctaLabel: string;
  status: VerificationStatus;
  isConceptualSimulation: boolean;
  quotePrefill: {
    serviceCategory: ServiceCategory;
    cargoType: CargoClassification;
    truckType: TruckTypePreference;
    originCity: string;
    destinationCity: string;
    estimatedShippingFrequency: ShippingFrequency;
  };
}

export const LOGISTICS_SCENARIOS: LogisticsScenario[] = [
  {
    id: "fmcg-distribution",
    title: "Distribusi FMCG Antarkota",
    industryCategory: "FMCG & Fast-Moving Consumer Goods",
    imageSrc: "/images/scenarios/scenario-fmcg.jpg",
    imageAlt:
      "Simulasi aktivitas bongkar muat kargo FMCG menggunakan truk CDD Box tanpa branding di pusat distribusi regional Indonesia",
    narrative:
      "Simulasi kebutuhan distribusi barang konsumsi dari pusat distribusi ke beberapa tujuan regional.",
    needsSummary:
      "Kebutuhan perputaran stok cepat, perlindungan kargo karton dari kelembapan dan debu jalanan, serta kepatuhan jadwal loading dock.",
    cargoCharacteristics: "Makanan & minuman kemasan, produk perawatan diri (karton di atas palet bersusut film)",
    illustrativeVehicle: "CDD (Colt Diesel Double) Box / Wingbox 6 Roda",
    originDestination: "Central DC Cikarang / Jabodetabek ⇄ DC Regional Jawa Barat & Jawa Tengah",
    dispatchFrequency: "Jadwal Rutin Mingguan (Scheduled)",
    keyConsiderations: [
      "Kesesuaian volume kargo karton berpalet dengan batas kubikasi boks",
      "Konsistensi jendela waktu muat (loading window) di fasilitas pengirim",
      "Pencegahan kerusakan kemasan ritel melalui segel boks utuh",
      "Penerimaan teratur di distribution center regional tanpa transit pihak ketiga",
    ],
    ctaLabel: "Diskusikan Distribusi FMCG",
    status: "VERIFIED",
    isConceptualSimulation: true,
    quotePrefill: {
      serviceCategory: "FTL_TRUCKING",
      cargoType: "FMCG_CONSUMER_GOODS",
      truckType: "CDD_DOUBLE",
      originCity: "Cikarang, Jawa Barat",
      destinationCity: "Semarang, Jawa Tengah",
      estimatedShippingFrequency: "WEEKLY",
    },
  },
  {
    id: "manufacturing-parts",
    title: "Pengiriman Komponen Manufaktur",
    industryCategory: "Manufaktur & Komponen Industri",
    imageSrc: "/images/scenarios/scenario-manufacturing.jpg",
    imageAlt:
      "Simulasi kargo suku cadang permesinan dan komponen otomotif berpalet di kawasan industri Karawang dengan truk tronton wingbox putih unbranded",
    narrative:
      "Contoh kebutuhan transportasi komponen produksi antara fasilitas manufaktur dan titik distribusi.",
    needsSummary:
      "Presisi jadwal suplai lini produksi tanpa jeda (just-in-time), perlindungan getaran kargo bernilai tinggi, dan kemudahan loading forklift.",
    cargoCharacteristics: "Komponen mesin presisi, suku cadang otomotif, peti kayu berpalet & strapping pengaman",
    illustrativeVehicle: "Tronton Wingbox / Fuso Berat (10 Roda / 6 Roda)",
    originDestination: "Kawasan Industri Karawang (KIIC) ⇄ Fasilitas Perakitan Rungkut, Surabaya",
    dispatchFrequency: "Rutin Terjadwal 2-3 Kali per Minggu",
    keyConsiderations: [
      "Akses hidrolik wingbox di kedua sisi untuk kecepatan bongkar muat forklift",
      "Standar pengikatan lashing berkekuatan industri untuk beban padat",
      "Disiplin jendela waktu kedatangan pabrik untuk mencegah bottleneck perakitan",
      "Kesesuaian dimensi peti kayu dengan batas lebar dan tinggi sasis truk",
    ],
    ctaLabel: "Ajukan Kebutuhan Transportasi Manufaktur",
    status: "VERIFIED",
    isConceptualSimulation: true,
    quotePrefill: {
      serviceCategory: "SCHEDULED_LINEHAUL",
      cargoType: "FINISHED_GOODS",
      truckType: "TRONTON_WINGBOX",
      originCity: "Karawang, Jawa Barat",
      destinationCity: "Surabaya, Jawa Timur",
      estimatedShippingFrequency: "WEEKLY",
    },
  },
  {
    id: "construction-materials",
    title: "Distribusi Material Konstruksi",
    industryCategory: "Material Bangunan & Infrastruktur",
    imageSrc: "/images/scenarios/scenario-construction.jpg",
    imageAlt:
      "Simulasi pengangkutan material besi beton dan kayu berikat dengan truk bak terbuka berat di area proyek infrastruktur Indonesia",
    narrative:
      "Ilustrasi kebutuhan pengiriman material konstruksi berdasarkan jenis, dimensi, dan volume muatan.",
    needsSummary:
      "Pengangkutan material berbobot tinggi dan berdimensi panjang dengan penegakan batas muatan jalan serta manuver aman di akses lokasi proyek.",
    cargoCharacteristics: "Besi beton bertulang, profil baja ringan, kayu bekisting proyek, semen instan sak",
    illustrativeVehicle: "Fuso Berat / Tronton Bak Terbuka / Flatbed Sasis Kokoh",
    originDestination: "Pabrik / Agen Distribusi Cilegon ⇄ Lokasi Proyek Konstruksi Jawa Tengah",
    dispatchFrequency: "Sesuai Tahapan Proyek (Ad-hoc Terjadwal)",
    keyConsiderations: [
      "Kepatuhan ketat terhadap Jumlah Berat yang Diizinkan (JBI / Zero ODOL)",
      "Pengikatan bersertifikasi menggunakan heavy-duty ratchet straps dan bantalan pengaman",
      "Kemudahan akses bongkar muat derek (crane) atau forklift lapangan",
      "Verifikasi daya dukung jalan masuk dan radius belok di lokasi proyek",
    ],
    ctaLabel: "Rencanakan Pengiriman Material",
    status: "VERIFIED",
    isConceptualSimulation: true,
    quotePrefill: {
      serviceCategory: "FTL_TRUCKING",
      cargoType: "BUILDING_MATERIALS",
      truckType: "FUSO",
      originCity: "Cilegon, Banten",
      destinationCity: "Semarang, Jawa Tengah",
      estimatedShippingFrequency: "ONE_TIME",
    },
  },
  {
    id: "interisland-shipping",
    title: "Pengiriman Antarpulau (Jawa — Sumatra / Bali)",
    industryCategory: "Logistik Lintas Koridor Nasional",
    imageSrc: "/images/scenarios/scenario-interisland.jpg",
    imageAlt:
      "Simulasi truk angkutan antarpulau di dermaga antrean pelabuhan penyeberangan kapal ro-ro Merak-Bakauheni tanpa identitas merek pihak ketiga",
    narrative:
      "Contoh perencanaan pengiriman yang memerlukan koordinasi transportasi darat dan koneksi antarpulau.",
    needsSummary:
      "Pengangkutan jarak jauh antar-pulau dengan sinkronisasi waktu jalan tol darat, jadwal tiket penyeberangan ferry ro-ro, dan perlindungan segel.",
    cargoCharacteristics: "Kargo umum terpalet, peralatan industri, barang niaga grosir antarkota",
    illustrativeVehicle: "Tronton Box / CDD Double Long Box / Trailer Kontainer",
    originDestination: "Jakarta / Tangerang ⇄ Palembang / Lampung / Medan (via Bakauheni) & Bali (via Ketapang)",
    dispatchFrequency: "Rutin Mingguan / Sesuai Permintaan FTL",
    keyConsiderations: [
      "Sinkronisasi estimasi waktu tiba dengan jadwal penyeberangan kapal ferry",
      "Penerapan batas jam mengemudi supir dan kesiapan pengemudi pengganti",
      "Verifikasi integritas segel pengaman kargo di dermaga penyeberangan",
      "Koordinasi mitra penyeberangan tanpa mengklaim kepemilikan armada kapal mandiri",
    ],
    ctaLabel: "Konsultasikan Rute Antarpulau",
    status: "VERIFIED",
    isConceptualSimulation: true,
    quotePrefill: {
      serviceCategory: "SCHEDULED_LINEHAUL",
      cargoType: "OTHER_GENERAL_CARGO",
      truckType: "TRONTON_BOX",
      originCity: "Jakarta Barat, DKI Jakarta",
      destinationCity: "Palembang, Sumatra Selatan",
      estimatedShippingFrequency: "WEEKLY",
    },
  },
  {
    id: "dedicated-contract",
    title: "Kontrak Distribusi Dedicated",
    industryCategory: "Supply Chain Enterprise & FMCG",
    imageSrc: "/images/scenarios/scenario-dedicated.jpg",
    imageAlt:
      "Simulasi pengelolaan armada kontrak terdedikasi di pusat pergudangan logistik dengan truk wingbox putih polos dan pengawas operasional",
    narrative:
      "Contoh kebutuhan perusahaan yang membutuhkan perencanaan kapasitas transportasi berulang.",
    needsSummary:
      "Jaminan ketersediaan kapasitas armada dan pengemudi yang terlatih dengan SOP internal klien untuk rute rutin harian atau mingguan berulang.",
    cargoCharacteristics: "Kargo reguler multi-SKU pabrik, suplai bahan baku kontinu antar-fasilitas, atau jaringan ritel",
    illustrativeVehicle: "Armada Dedicated Terencana (CDD Box / Tronton Wingbox)",
    originDestination: "Central Fulfillment Hub Pengirim ⇄ Jaringan Sub-Distributor & Gerai Jawa-Bali",
    dispatchFrequency: "Kontrak Reguler Harian / Mingguan (Dedicated Fleet)",
    keyConsiderations: [
      "Alokasi unit kendaraan dan pengemudi tetap yang memahami standar penanganan produk klien",
      "Kesepakatan SLA ketepatan waktu muat dan bongkar yang terukur",
      "Ketersediaan unit pengganti saat jadwal servis dan uji KIR berkala",
      "Laporan operasional berkala dan transparansi koordinasi perjalanan",
    ],
    ctaLabel: "Ajukan Kebutuhan Kontrak Dedicated",
    status: "VERIFIED",
    isConceptualSimulation: true,
    quotePrefill: {
      serviceCategory: "CONTRACT_LOGISTICS",
      cargoType: "FMCG_CONSUMER_GOODS",
      truckType: "TRONTON_WINGBOX",
      originCity: "Bekasi, Jawa Barat",
      destinationCity: "Bandung, Jawa Barat",
      estimatedShippingFrequency: "CONTRACT_REGULAR",
    },
  },
];

/**
 * Accessor helper that guarantees unverified facts are never returned for public display.
 */
export function getVerifiedFact<T, F = T>(
  fact: CompanyFact<T>,
  fallback: F
): (T extends null | undefined ? never : T) | F {
  if (fact.status === "VERIFIED" && fact.value !== null && fact.value !== undefined) {
    return fact.value as unknown as (T extends null | undefined ? never : T);
  }
  return fallback;
}

/**
 * Returns only confirmed services for public website consumption.
 */
export function getPublicServices(): ServiceItem[] {
  return TRUKINDO_PROFILE.confirmedServices.filter((s) => s.status === "VERIFIED");
}

/**
 * Returns conceptual logistics scenarios for public case study illustration.
 */
export function getPublicScenarios(): LogisticsScenario[] {
  return LOGISTICS_SCENARIOS.filter((s) => s.status === "VERIFIED");
}

/**
 * Find a specific logistics scenario by its ID for quote integration.
 */
export function getScenarioById(id: string): LogisticsScenario | undefined {
  return LOGISTICS_SCENARIOS.find((s) => s.id === id);
}
