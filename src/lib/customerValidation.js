/**
 * src/lib/customerValidation.js
 *
 * Frontend validation helpers for Customer forms in Ifrah Collection POS.
 */

export function cleanDigits(val) {
  return String(val || '').replace(/\D/g, '');
}

/**
 * Formats Pakistani mobile number as 03xx-xxxxxxx (max 11 digits)
 */
export function formatPakPhone(val) {
  const digits = cleanDigits(val).slice(0, 11);
  if (digits.length <= 4) return digits;
  return `${digits.slice(0, 4)}-${digits.slice(4)}`;
}

/**
 * Formats Pakistani CNIC as 00000-0000000-0 (max 13 digits)
 */
export function cnicMask(val) {
  const digits = cleanDigits(val).slice(0, 13);
  if (digits.length <= 5) return digits;
  if (digits.length <= 12) return `${digits.slice(0, 5)}-${digits.slice(5)}`;
  return `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12)}`;
}

function normalizeName(value) {
  if (!value) return '';
  return String(value)
    .trim()
    .replace(/\u064a/g, '\u06cc')
    .replace(/\u0643/g, '\u06a9')
    .replace(/\u0629/g, '\u06c1')
    .toLowerCase()
    .replace(/[\s\-_.,'"`''""،؛]+/g, '');
}

/**
 * Validates customer form data.
 * @param {object} form
 * @param {object} options { isRequiredPhone?: boolean }
 * @returns {{ isValid: boolean, errors: Record<string, string> }}
 */
export function validateCustomer(form, { isRequiredPhone = true } = {}) {
  const errors = {};

  // 1. Customer Name
  const name = (form.name || '').trim();
  if (!name) {
    errors.name = 'Customer ka naam zaroori hai.';
  } else if (name.length < 3) {
    errors.name = 'Naam kam az kam 3 huroof ka hona chahiye.';
  } else if (!/[a-zA-Z\u0600-\u06FF]{2,}/.test(name)) {
    errors.name = 'Naam me huroof hone chahiye (sirf numbers ya symbol nahi).';
  }

  // 2. Primary Phone (Phone 1)
  const phoneDigits = cleanDigits(form.phone);
  if (isRequiredPhone || phoneDigits.length > 0) {
    if (!phoneDigits) {
      errors.phone = 'Phone number zaroori hai.';
    } else if (phoneDigits.length !== 11) {
      errors.phone = `Phone number pura 11 digits ka hona chahiye (abhi ${phoneDigits.length} digits hain). Maslan: 0300-1234567`;
    } else if (!phoneDigits.startsWith('03')) {
      errors.phone = 'Pakistani mobile number 03 se shuru hona chahiye (maslan: 0300-xxxxxxx).';
    }
  }

  // 3. Secondary Phone (Phone 2)
  const phone2Digits = cleanDigits(form.phone2);
  if (phone2Digits.length > 0) {
    if (phone2Digits.length !== 11) {
      errors.phone2 = `Phone 2 pura 11 digits ka hona chahiye (abhi ${phone2Digits.length} digits hain).`;
    } else if (!phone2Digits.startsWith('03')) {
      errors.phone2 = 'Phone 2 bhi 03 se shuru hona chahiye.';
    } else if (phone2Digits === phoneDigits) {
      errors.phone2 = 'Phone 2 aur Phone 1 same nahi ho sakte (mukhtalif number likhein).';
    }
  }

  // 4. Primary CNIC
  const cnicDigits = cleanDigits(form.cnic);
  if (cnicDigits.length > 0) {
    if (cnicDigits.length !== 13) {
      errors.cnic = `CNIC mukammal 13 digits ka hona chahiye (abhi ${cnicDigits.length} digits hain). Format: 00000-0000000-0`;
    }
  }

  // 5. Relative / Guardian Information
  const relName = (form.relative_name || '').trim();
  const relPhoneDigits = cleanDigits(form.relative_phone);
  const relCnicDigits = cleanDigits(form.relative_cnic);
  const hasRelation = Boolean(form.relation_type_id);

  const hasAnyRelativeInfo = relName || relPhoneDigits || relCnicDigits || hasRelation;

  if (hasAnyRelativeInfo) {
    if (!hasRelation) {
      errors.relation_type_id = 'Rishta / Relation muntakhib karein (Brother, Father, Husband waghera).';
    }

    if (!relName) {
      errors.relative_name = 'Relative ka naam darj karein.';
    } else if (relName.length < 3) {
      errors.relative_name = 'Relative ka naam kam az kam 3 huroof ka hona chahiye.';
    } else if (name && normalizeName(name) === normalizeName(relName)) {
      errors.relative_name = 'Relative ka naam customer ke naam jaisa nahi ho sakta (ek shakhs apna relative nahi ban sakta).';
    }

    if (relPhoneDigits.length > 0) {
      if (relPhoneDigits.length !== 11) {
        errors.relative_phone = `Relative phone 11 digits ka hona chahiye (abhi ${relPhoneDigits.length} digits hain).`;
      } else if (!relPhoneDigits.startsWith('03')) {
        errors.relative_phone = 'Relative phone 03 se shuru hona chahiye.';
      } else if (phoneDigits && relPhoneDigits === phoneDigits) {
        errors.relative_phone = 'Relative ka phone aur Customer ka phone same nahi ho sakta!';
      } else if (phone2Digits && relPhoneDigits === phone2Digits) {
        errors.relative_phone = 'Relative ka phone customer ke Phone 2 se alag hona chahiye!';
      }
    }

    if (relCnicDigits.length > 0) {
      if (relCnicDigits.length !== 13) {
        errors.relative_cnic = `Relative CNIC pura 13 digits ka hona chahiye (abhi ${relCnicDigits.length} digits hain).`;
      } else if (cnicDigits && relCnicDigits === cnicDigits) {
        errors.relative_cnic = 'Relative ka CNIC customer ke CNIC se mukhtalif hona chahiye (dono same nahi ho sakte)!';
      }
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}
