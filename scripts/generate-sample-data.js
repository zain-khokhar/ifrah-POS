'use strict';

/**
 * scripts/generate-sample-data.js
 *
 * Generates the realistic benchmark MS Access export dataset for Phase 11:
 * - 359 bookings (Jan–Oct 2026, IDs 47–411)
 * - 368 booking lines (Detail IDs: booking_no * 100 + line_no)
 * - Sum of line amounts = EXACTLY 789,801
 * - 243 rows with old Remaining mismatches (simulating Access manual calculation errors)
 * - Raw numeric phones (missing leading 0) and unformatted CNICs
 * - Urdu variants, cities, and dress name variants
 */

const fs = require('fs');
const path = require('path');

const TARGET_BOOKINGS = 359;
const TARGET_LINES = 368;
const TARGET_TOTAL = 789801;

// Omit 6 IDs between 47 and 411 to arrive at exactly 359 IDs
const skippedIds = new Set([60, 115, 178, 240, 299, 365]);
const bookingIds = [];
for (let id = 47; id <= 411; id++) {
  if (!skippedIds.has(id)) bookingIds.push(id);
}

if (bookingIds.length !== TARGET_BOOKINGS) {
  throw new Error(`Expected ${TARGET_BOOKINGS} bookings, got ${bookingIds.length}`);
}

// 9 bookings will have 2 lines, 350 bookings will have 1 line -> 350 + 18 = 368 lines
const twoLineCount = TARGET_LINES - TARGET_BOOKINGS; // 9
const twoLineSet = new Set(bookingIds.slice(0, twoLineCount));

// Base dress names pool
const dressPool = [
  'Royal Crimson Bridal Lehnga',
  'Golden Embroidered Maxi',
  'Emerald Green Velvet Gharara',
  'Pastel Pink Walima Gown',
  'Maroon Zardozi Bridal Set',
  'Peacock Blue Silk Lehnga',
  'Ivory Tissue Sharara',
  'Ruby Red Banarsi Lehnga',
  'Champagne Gold Net Maxi',
  'Rust Orange Mehndi Frock',
  'Plum Jamawar Angrakha',
  'Lilac Chiffon Anarkali',
  'Teal Blue Mirror Work Sharara',
  'Peach organza Bridal Gown',
  'Dusty Rose Raw Silk Lehnga',
  'Deep Navy Blue Embroidered Kurti Set',
  'Mint Green Organza Saree',
  'Mustard Yellow Mayun Dress',
  'Silver Grey reception Maxi',
  'Burgundy Velvet bridal Jora',
];

const customerNames = [
  'Fatima Zahra', 'Sana Tariq', 'Rukhsana Bibi', 'Zainab Noor', 'Amna Shahid',
  'Hira Malik', 'Nadia Iqbal', 'Bushra Rehman', 'Sadia Khan', 'Madiha Ali',
  'Kiran Aslam', 'Rabia Hassan', 'Iqra Shaheen', 'Mehwish Karim', 'Shazia Butt',
  'Uzma Perveen', 'Saima Akhtar', 'Noor Fatima', 'Fariha Naz', 'Farhat Jabeen',
  'Ayesha Siddiqa', 'Haleema Sadia', 'Noreen Kausar', 'Samina Yasmeen', 'Rubina Kausar',
  'Tahira Jabeen', 'Kalsoom Akhtar', 'Shaista Parveen', 'Asia Begum', 'Fouzia Naheed',
  'Shabnam Bano', 'Nasreen Akhtar', 'Parveen Akhtar', 'Bisma Rauf', 'Mahnoor Tariq',
  'Kinza Hashmi', 'Laiba Qureshi', 'Alishba Munir', 'Hafsa Naveed', 'Momina Bilal',
  'Sidra Tul Muntaha', 'Nimra Javed', 'Anam Fatima', 'Maryam Nawaz', 'Tayyaba Rehman',
  'Sundas Shahzadi', 'Maria Rasheed', 'Jaweria Tahir', 'Humaira Arshad', 'Khadija Tul Kubra'
];

const cities = ['Lahore', 'Burewala', 'Vehari', 'Multan', 'Khanewal', 'Sahiwal', 'Faisalabad', 'Kasur'];
const casts = ['', '', '', '', '', 'Ansari', 'Arain', 'Shaikh', 'Rajput', 'Mughal', 'Jatt'];
const relations = ['Husband', 'Brother', 'Father', 'Mother', 'Sister', 'Uncle'];
const relNames = ['Usman Zahra', 'Ahmed Ali', 'Shahid Hussain', 'Ali Hassan', 'Hassan Khan', 'Aslam Khan', 'Hassan Raza', 'Karim Bakhsh', 'Tariq Butt', 'Imran Akhtar'];
const methods = ['Cash', 'Cash', 'Cash', 'Bank', 'Cash', 'Wallet'];
const statuses = ['Open', 'Close', 'Close', 'Open', 'Close', 'None', 'Pending'];

// Pseudo-random deterministic generator with fixed seed
let seed = 42;
function pseudoRandom() {
  seed = (seed * 9301 + 49297) % 233280;
  return seed / 233280;
}

// Generate 368 rates that sum to TARGET_TOTAL (789,801)
const rates = [];
let currentSum = 0;
for (let i = 0; i < TARGET_LINES; i++) {
  // Base rates mostly between 1000 and 4500
  const r = 1000 + Math.floor(pseudoRandom() * 2600);
  rates.push(r);
  currentSum += r;
}

// Adjust so sum matches exactly TARGET_TOTAL
let delta = TARGET_TOTAL - currentSum;
let idx = 0;
while (delta !== 0) {
  if (delta > 0) {
    rates[idx % TARGET_LINES]++;
    delta--;
  } else {
    rates[idx % TARGET_LINES]--;
    delta++;
  }
  idx++;
}

const finalSum = rates.reduce((a, b) => a + b, 0);
if (finalSum !== TARGET_TOTAL) {
  throw new Error(`Rates sum is ${finalSum}, expected ${TARGET_TOTAL}`);
}

// Build lines and bookings
const bookingRows = [];
const detailRows = [];
let rateIdx = 0;

// Customer lookup for repeat customers
const customerPool = customerNames.map((name, idx) => {
  const phoneRaw = (3000000000 + (idx * 1928374) % 900000000).toString();
  const cnicRaw = (3520100000000 + (idx * 2847291) % 9000000000).toString();
  return { name, phone: phoneRaw, cnic: cnicRaw };
});

let mismatchCount = 0;

for (let bIdx = 0; bIdx < bookingIds.length; bIdx++) {
  const bId = bookingIds[bIdx];
  const numLines = twoLineSet.has(bId) ? 2 : 1;

  // Day offset across Jan to Oct 2026 (280 days)
  const dayOffset = Math.floor((bIdx / bookingIds.length) * 275) + 2;
  const bDateObj = new Date(2026, 0, dayOffset);
  const delivDateObj = new Date(bDateObj.getTime() + (3 + Math.floor(pseudoRandom() * 6)) * 86400000);
  const retDateObj = new Date(delivDateObj.getTime() + (2 + Math.floor(pseudoRandom() * 4)) * 86400000);

  const bDate = bDateObj.toISOString().slice(0, 10);
  const delivDate = delivDateObj.toISOString().slice(0, 10);
  const retDate = retDateObj.toISOString().slice(0, 10);
  const monthStr = bDate.slice(0, 7);

  // Pick customer (creates reuse of customers)
  const cust = customerPool[Math.floor(pseudoRandom() * customerPool.length)];
  const city = cities[Math.floor(pseudoRandom() * cities.length)];
  const cast = casts[Math.floor(pseudoRandom() * casts.length)];
  const relType = pseudoRandom() > 0.3 ? relations[Math.floor(pseudoRandom() * relations.length)] : '';
  const relName = relType ? relNames[Math.floor(pseudoRandom() * relNames.length)] : '';
  const status = statuses[Math.floor(pseudoRandom() * statuses.length)];
  const method = methods[Math.floor(pseudoRandom() * methods.length)];

  let bookingGrandTotal = 0;

  for (let l = 1; l <= numLines; l++) {
    const rate = rates[rateIdx++];
    const detailId = bId * 100 + l;
    const dress = dressPool[(bIdx * 3 + l) % dressPool.length];
    const size = ['S', 'M', 'L', 'XL'][Math.floor(pseudoRandom() * 4)];
    const jew = pseudoRandom() > 0.5 ? 1 : 0;
    const clutch = pseudoRandom() > 0.6 ? 1 : 0;
    const bag = pseudoRandom() > 0.7 ? 1 : 0;
    const dupatta = pseudoRandom() > 0.6 ? 1 : 0;
    const shoes = pseudoRandom() > 0.8 ? 1 : 0;

    bookingGrandTotal += rate;

    detailRows.push({
      DetailID: detailId,
      BookingID: bId,
      DressName: dress,
      Size: size,
      Quantity: 1,
      Rate: rate,
      Amount: rate,
      Jewellery: jew,
      ClutchPurse: clutch,
      HandBag: bag,
      DoubleDupatta: dupatta,
      Shoes: shoes,
      Description: l === 1 ? 'Mukammal bridal / party jora' : 'Additional line item',
    });
  }

  // Advance amount (between 30% and 70% of total)
  const advance = Math.min(bookingGrandTotal, Math.round((bookingGrandTotal * (0.3 + pseudoRandom() * 0.4)) / 100) * 100);

  // Old Remaining calculation in Access had exactly 243 manual errors:
  let oldRemaining = bookingGrandTotal - advance;
  if (mismatchCount < 243) {
    oldRemaining = (bookingGrandTotal - advance) + 500;
    mismatchCount++;
  }

  const notes = pseudoRandom() > 0.7 ? 'واپسی پر ڈریس صاف ہونا چاہیے' : '';
  const address = `House ${bId}, Street ${Math.floor(pseudoRandom() * 20) + 1}, ${city}`;

  bookingRows.push({
    BookingID: bId,
    CustomerName: cust.name,
    Phone: cust.phone,
    Phone2: '',
    CNIC: cust.cnic,
    City: city,
    Cast: cast,
    RelationName: relName,
    RelationType: relType,
    Address: address,
    BookingDate: bDate,
    DeliveryDate: delivDate,
    ReturningDate: retDate,
    Status: status,
    Month: monthStr,
    AdvanceAmount: advance,
    AdvanceMethod: method,
    Notes: notes,
    Remaining: oldRemaining,
  });
}

// Convert to CSV
function toCsv(rows, headers) {
  const lines = [headers.join(',')];
  for (const r of rows) {
    const vals = headers.map(h => {
      let val = r[h] == null ? '' : String(r[h]);
      if (val.includes(',') || val.includes('"') || val.includes('\n')) {
        val = `"${val.replace(/"/g, '""')}"`;
      }
      return val;
    });
    lines.push(vals.join(','));
  }
  return lines.join('\n');
}

const bookingHeaders = [
  'BookingID', 'CustomerName', 'Phone', 'Phone2', 'CNIC', 'City', 'Cast',
  'RelationName', 'RelationType', 'Address', 'BookingDate', 'DeliveryDate',
  'ReturningDate', 'Status', 'Month', 'AdvanceAmount', 'Remaining', 'AdvanceMethod', 'Notes'
];

const detailHeaders = [
  'DetailID', 'BookingID', 'DressName', 'Size', 'Quantity', 'Rate', 'Amount',
  'Jewellery', 'ClutchPurse', 'HandBag', 'DoubleDupatta', 'Shoes', 'Description'
];

const sampleDir = path.join(__dirname, 'sample-data');
if (!fs.existsSync(sampleDir)) {
  fs.mkdirSync(sampleDir, { recursive: true });
}

fs.writeFileSync(path.join(sampleDir, 'bookings.csv'), toCsv(bookingRows, bookingHeaders), 'utf-8');
fs.writeFileSync(path.join(sampleDir, 'booking_details.csv'), toCsv(detailRows, detailHeaders), 'utf-8');

console.log(`✓ Generated ${bookingRows.length} bookings (IDs ${bookingRows[0].BookingID} to ${bookingRows[bookingRows.length - 1].BookingID})`);
console.log(`✓ Generated ${detailRows.length} line items`);
console.log(`✓ Total Grand Sum: ${finalSum} (Target: ${TARGET_TOTAL})`);
console.log(`✓ Old Remaining Mismatches: ${mismatchCount}`);
