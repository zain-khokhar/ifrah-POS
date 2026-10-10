const crypto = require('crypto');

const KEY_LENGTH = 64;
const COST = 16384;
const BLOCK_SIZE = 8;
const PARALLELIZATION = 1;

function hashPassword(password) {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16);
    crypto.scrypt(password, salt, KEY_LENGTH, {
      cost: COST,
      blockSize: BLOCK_SIZE,
      parallelization: PARALLELIZATION,
    }, (error, derivedKey) => {
      if (error) return reject(error);
      resolve(`scrypt$${salt.toString('hex')}$${derivedKey.toString('hex')}`);
    });
  });
}

function verifyPassword(password, storedHash) {
  return new Promise((resolve, reject) => {
    const [algorithm, saltHex, keyHex] = String(storedHash || '').split('$');
    if (algorithm !== 'scrypt' || !saltHex || !keyHex) return resolve(false);

    crypto.scrypt(password, Buffer.from(saltHex, 'hex'), KEY_LENGTH, {
      cost: COST,
      blockSize: BLOCK_SIZE,
      parallelization: PARALLELIZATION,
    }, (error, derivedKey) => {
      if (error) return reject(error);
      const expected = Buffer.from(keyHex, 'hex');
      resolve(expected.length === derivedKey.length && crypto.timingSafeEqual(expected, derivedKey));
    });
  });
}

module.exports = { hashPassword, verifyPassword };