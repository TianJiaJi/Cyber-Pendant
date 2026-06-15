const SN_RANDOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function pad(value) {
  return String(value).padStart(2, '0');
}

function formatLocalDate(date = new Date()) {
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
}

export function generateSn(date = new Date()) {
  let randomPart = '';

  for (let index = 0; index < 6; index += 1) {
    randomPart +=
      SN_RANDOM_ALPHABET[Math.floor(Math.random() * SN_RANDOM_ALPHABET.length)];
  }

  return `CP${formatLocalDate(date)}${randomPart}`;
}

export function generateUniqueSn(db) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const sn = generateSn();
    const existing = db.prepare('SELECT id FROM garments WHERE sn = ?').get(sn);

    if (!existing) {
      return sn;
    }
  }

  throw new Error('Unable to generate a unique SN code.');
}

export function normalizeSn(value) {
  return String(value || '').trim().toUpperCase();
}
