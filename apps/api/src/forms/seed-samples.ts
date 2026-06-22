/**
 * Dev seed: insert ~60–80 sample FormSubmission rows for the Overview dashboard.
 * Idempotent: exits early if there are already >= 40 submissions.
 *
 * Run after building:
 *   npm run forms:seed-samples -w @signex/api
 *   (= node dist/forms/seed-samples)
 *
 * Or directly against the dev DB:
 *   DATABASE_URL=postgresql://signex:signex@localhost:3059/signex?schema=public \
 *     node dist/forms/seed-samples
 */
import 'dotenv/config';
import { prisma } from '@signex/db';

// ── helpers ─────────────────────────────────────────────────────────────────

/** Seeded (deterministic) pseudo-random number generator (mulberry32). */
function makeRng(seed: number) {
  let s = seed;
  return function rng(): number {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = makeRng(0xc0ffee42);

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

/** ms offset from now going back `days` days, weighted toward recent. */
function randomOffsetMs(maxDays: number): number {
  // Square-root weighting: more likely to be recent.
  const frac = Math.sqrt(rng()) * maxDays;
  return Math.floor(frac * 24 * 60 * 60 * 1000);
}

// ── sample data ─────────────────────────────────────────────────────────────

const quotePayloads = [
  {
    name: 'Nguyen Van An',
    email: 'van.an@vinaplastic.vn',
    company: 'Vina Plastic Co.',
    phone: '+84 90 123 4567',
    message:
      'We need 50,000 PVC seals for our Q3 production run. Please quote.',
  },
  {
    name: 'Trần Thị Bích',
    email: 'bich.tran@packagingvn.com',
    company: 'Packaging Vietnam Ltd',
    phone: '+84 91 234 5678',
    message: 'Looking for custom silicone gaskets — diameter 32mm, food-grade.',
  },
  {
    name: 'Le Hoang Nam',
    email: 'namle@indotech.co.id',
    company: 'Indo Tech Solutions',
    message: 'Request quote for 10,000 units rubber O-rings, NBR material.',
  },
  {
    name: 'Pham Duc Minh',
    email: 'minh@sgnseals.vn',
    company: 'SGN Seals',
    phone: '+84 93 345 6789',
    message: 'Need price for EPDM door gaskets in bulk (monthly 20k pcs).',
  },
  {
    name: 'David Chen',
    email: 'd.chen@asiaseal.hk',
    company: 'Asia Seal HK',
    phone: '+852 9876 5432',
    message:
      'Urgent: 5000 PVC edge trim strips by end of month. Can you deliver?',
  },
  {
    name: 'Lưu Thị Hoa',
    email: 'hoa.luu@greentech.vn',
    company: 'Green Tech Vietnam',
    message:
      'Please provide quote for eco-friendly sealing solutions for solar panel mounting.',
  },
  {
    name: 'Vo Quoc Bao',
    email: 'baovq@manufacturevn.com',
    company: 'Manufacture VN',
    phone: '+84 97 456 7890',
    message:
      'We require hydraulic seals for industrial pumps. Can you handle high-pressure applications?',
  },
  {
    name: 'Hoang Thi Lan',
    email: 'lan.hoang@construction.vn',
    company: 'Hoang Lan Construction',
    message: 'Looking for silicone weather stripping for 200 apartment units.',
  },
  {
    name: 'Akira Tanaka',
    email: 'a.tanaka@nihonpack.jp',
    company: 'Nihon Packaging',
    phone: '+81 90 1234 5678',
    message:
      'Inquiry about food-grade rubber seals compliant with JIS standards.',
  },
  {
    name: 'Ngo Thi Thu',
    email: 'thu.ngo@autoparts.vn',
    company: 'VN Auto Parts',
    phone: '+84 96 567 8901',
    message:
      'Need automotive-grade rubber grommets and seals for engine compartments.',
  },
  {
    name: 'Phạm Văn Đức',
    email: 'duc.pham@chemcoat.vn',
    company: 'Chem Coat Vietnam',
    message:
      'Chemical-resistant seals for tank fittings — PTFE preferred. Quote needed.',
  },
  {
    name: 'Lin Wei',
    email: 'linwei@shenzhenmanuf.cn',
    company: 'Shenzhen Mfg Co',
    phone: '+86 138 0013 8000',
    message:
      'Looking to source 100,000 pcs silicone seals monthly. Can you meet this volume?',
  },
  {
    name: 'Bui Thi Cam',
    email: 'cam.bui@meditech.vn',
    company: 'Medi Tech VN',
    message:
      'Medical-grade silicone tubing seals — ISO 10993 compliant. Need samples first.',
  },
  {
    name: 'Dang Van Hung',
    email: 'hung@electronicseal.vn',
    company: 'ElectroSeal VN',
    phone: '+84 94 678 9012',
    message:
      'IP67-rated silicone seals for outdoor enclosures. Annual volume ~30k pcs.',
  },
  {
    name: 'Sarah Williams',
    email: 's.williams@australseal.com.au',
    company: 'Austral Seal Pty',
    phone: '+61 421 234 567',
    message:
      'Sourcing EPDM seals for refrigeration units. Need food-safe certification.',
  },
  {
    name: 'Trinh Xuan Long',
    email: 'longxuantrinh@pharmapack.vn',
    company: 'Pharma Pack VN',
    message:
      'Rubber stoppers and closures for pharmaceutical vials. GDP-compliant manufacturer required.',
  },
  {
    name: 'Tran Van Khoa',
    email: 'khoa.tvan@pump-seal.vn',
    company: 'Pump Seal Vietnam',
    phone: '+84 92 789 0123',
    message:
      'Mechanical seals for centrifugal pumps in water treatment plant. 200 units initial order.',
  },
  {
    name: 'Nguyen Thi Mai',
    email: 'mai.nguyen@coldroom.vn',
    company: 'ColdRoom Solutions',
    message:
      'Magnetic door seals for cold storage rooms — FDA grade, operating -20°C to +5°C.',
  },
  {
    name: 'Kim Jun Ho',
    email: 'junho@koreaindustrial.kr',
    company: 'Korea Industrial Supply',
    phone: '+82 10 1234 5678',
    message:
      'Looking for competitively priced rubber sealing profiles for our manufacturing line.',
  },
  {
    name: 'Vo Thi Thanh',
    email: 'thanh.vo@flexipipe.vn',
    company: 'Flexi Pipe VN',
    message:
      'EPDM expansion joint seals for large-diameter piping. Min order 500 pcs?',
  },
  {
    name: 'Chu Van Tinh',
    email: 'tinh@constructiongroup.vn',
    company: 'Tinh Construction Group',
    phone: '+84 98 012 3456',
    message:
      'Waterproofing seals for underground car park. What solutions do you offer?',
  },
  {
    name: 'Rajesh Kumar',
    email: 'r.kumar@indiaseal.in',
    company: 'India Seal Corp',
    phone: '+91 98765 43210',
    message:
      'Neoprene sheet gaskets for oil industry flanges. API standard compliance required.',
  },
  {
    name: 'Ha Thi Phuong',
    email: 'phuong.ha@seafood.vn',
    company: 'Phuong Ha Seafood',
    message:
      'Food-safe silicone seals for processing equipment, certified NSF 51. Urgent need.',
  },
  {
    name: 'Dinh Quoc Tuan',
    email: 'tuan.dq@hvac-solution.vn',
    company: 'HVAC Solutions VN',
    phone: '+84 99 123 4567',
    message:
      'Ductwork sealing materials for HVAC installation project — 8 buildings.',
  },
];

const contactPayloads = [
  {
    name: 'Nguyen Manh Cuong',
    email: 'cuong.nm@company.vn',
    subject: 'General inquiry about your products',
    message:
      'Hello, I came across your website and am interested in learning more about your seal range.',
  },
  {
    name: 'Emily Johnson',
    email: 'ejohnson@globalproc.com',
    subject: 'Partnership opportunity',
    message:
      'We are a procurement company looking for reliable seal suppliers in Southeast Asia.',
  },
  {
    name: 'Le Van Phu',
    email: 'lphu@mechtech.vn',
    phone: '+84 90 222 3333',
    subject: 'Technical question — O-ring sizing',
    message:
      'Can you provide assistance with O-ring cross-section selection for dynamic applications?',
  },
  {
    name: 'Thi Bao Chau',
    email: 'chau.bao@university.edu.vn',
    subject: 'Research collaboration',
    message:
      'I am a materials science researcher at HUST. Interested in joint R&D on bio-based elastomers.',
  },
  {
    name: 'Marco Rossi',
    email: 'm.rossi@italianmfg.it',
    subject: 'Distribution agreement inquiry',
    message:
      'We are an Italian distributor for sealing products and want to discuss a partnership.',
  },
  {
    name: 'Vo Thanh Nghia',
    email: 'nghia.vo@watertreat.vn',
    phone: '+84 91 333 4444',
    subject: 'Technical support request',
    message:
      'We have leakage issues with installed seals after 6 months. Need on-site inspection.',
  },
  {
    name: 'Tran Ngoc Huyen',
    email: 'huyen.tn@studio.vn',
    subject: 'Website feedback',
    message:
      'Your product catalog is very helpful. Would be great to have CAD drawings downloadable.',
  },
  {
    name: 'Nguyen Thanh Hung',
    email: 'hung.nt@shipyard.vn',
    phone: '+84 93 444 5555',
    subject: 'Marine-grade seals inquiry',
    message:
      'Looking for seals certified for marine environment — salt spray resistance required.',
  },
  {
    name: 'Pham Thi Ngoc',
    email: 'ngocpt@greenpark.vn',
    subject: 'Career opportunities',
    message:
      'I am interested in joining your engineering team. Please share available positions.',
  },
  {
    name: 'Bui Viet Dung',
    email: 'dungbv@mechservice.vn',
    phone: '+84 94 555 6666',
    subject: 'After-sales service',
    message:
      'Need replacement seals for your product line supplied 3 years ago. Do you maintain parts list?',
  },
  {
    name: 'Chen Li Ming',
    email: 'liming@guangzhou-trade.cn',
    subject: 'Export inquiry',
    message:
      'We want to import your products to mainland China. What are your export capabilities?',
  },
  {
    name: 'Hoang Van Binh',
    email: 'binh.hv@solar.vn',
    phone: '+84 95 666 7777',
    subject: 'Solar panel sealing',
    message:
      'Need UV-resistant seals for solar panel frames. UV stability over 25 years required.',
  },
  {
    name: 'Anna Schmidt',
    email: 'anna.schmidt@germantrade.de',
    subject: 'Trade fair inquiry',
    message:
      'Will you be exhibiting at the Vietnam Manufacturing Expo? We would like to schedule a meeting.',
  },
  {
    name: 'Doan Thi Xuan',
    email: 'xuan.doan@foodplant.vn',
    phone: '+84 96 777 8888',
    subject: 'Food processing equipment seals',
    message:
      'Need EHEDG-certified seals for our new dairy processing line. Please contact ASAP.',
  },
  {
    name: 'Ly Thanh Son',
    email: 'son.ly@electronic.vn',
    subject: 'EMI gaskets',
    message:
      'Looking for conductive elastomer gaskets for EMI shielding in our PCB enclosures.',
  },
  {
    name: 'Duong Thi Hoa',
    email: 'hoa.duong@printing.vn',
    phone: '+84 97 888 9999',
    subject: 'Printing industry seals',
    message: 'Need solvent-resistant seals for our printing press rollers.',
  },
];

const STATUSES = [
  'NEW',
  'NEW',
  'NEW',
  'NEW',
  'READ',
  'READ',
  'ARCHIVED',
] as const;
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
  'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 Chrome/119',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
];
const IPS = [
  '14.225.0.1',
  '118.69.0.1',
  '203.113.0.1',
  '27.72.0.1',
  '103.21.0.1',
  '115.78.0.1',
  '42.116.0.1',
  '58.187.0.1',
  '171.247.0.1',
];

const TARGET_COUNT = 70;
const GUARD_COUNT = 40;

async function main(): Promise<void> {
  const existing = await prisma.formSubmission.count();
  if (existing >= GUARD_COUNT) {
    console.log(
      `forms:seed-samples — skipping: ${existing} submissions already present (>= ${GUARD_COUNT})`,
    );
    await prisma.$disconnect();
    return;
  }

  // Try to find an existing READY asset to attach to some submissions.
  const readyAsset = await prisma.asset.findFirst({
    where: { status: 'READY' },
    select: { id: true },
  });

  const now = Date.now();
  const submissions: {
    formKey: string;
    payload: object;
    status: string;
    ip: string;
    userAgent: string;
    createdAt: Date;
    uploadAssetId: string | null;
  }[] = [];

  for (let i = 0; i < TARGET_COUNT; i++) {
    const isQuote = rng() < 0.6; // 60% quote, 40% contact
    const formKey = isQuote ? 'quote' : 'contact';
    const payload = isQuote ? pick(quotePayloads) : pick(contactPayloads);
    const status: string = pick(STATUSES);
    const offsetMs = randomOffsetMs(90);
    const createdAt = new Date(now - offsetMs);
    // ~15% have an upload attachment (only if a real asset exists)
    const uploadAssetId = readyAsset && rng() < 0.15 ? readyAsset.id : null;

    submissions.push({
      formKey,
      payload,
      status,
      ip: pick(IPS),
      userAgent: pick(USER_AGENTS),
      createdAt,
      uploadAssetId,
    });
  }

  // Sort by createdAt ascending for logical insertion order.
  submissions.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  // Use createMany for efficiency (skipping duplicates not needed since these are fresh).
  await prisma.formSubmission.createMany({
    data: submissions.map((s) => ({
      formKey: s.formKey,
      payload: s.payload,
      status: s.status as 'NEW' | 'READ' | 'ARCHIVED',
      ip: s.ip,
      userAgent: s.userAgent,
      createdAt: s.createdAt,
      uploadAssetId: s.uploadAssetId,
    })),
  });

  const total = await prisma.formSubmission.count();
  console.log(
    `forms:seed-samples — inserted ${TARGET_COUNT} sample submissions; total now ${total}`,
  );

  await prisma.$disconnect();
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;
  console.error(`forms:seed-samples FAILED — ${message}`, stack);
  process.exit(1);
});
