import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  setupRequired, savePassword, checkPassword, passwordSource, validatePassword,
  openrouterKey, openrouterKeySource, saveOpenrouterKey, removeOpenrouterKey, maskKey,
  checkSetupCode, setupCode,
} from '../settings.js';

test('fresh install requires setup until a password is saved', () => {
  assert.equal(setupRequired(), true);
  savePassword('correct horse');
  assert.equal(setupRequired(), false);
  assert.equal(passwordSource(), 'ui');
});

test('stored password verifies, wrong ones do not, and changing it revokes the old one', () => {
  savePassword('first-password');
  assert.equal(checkPassword('first-password'), true);
  assert.equal(checkPassword('first-password'), true); // cached path
  assert.equal(checkPassword('nope'), false);
  assert.equal(checkPassword(''), false);
  savePassword('second-password');
  assert.equal(checkPassword('first-password'), false);
  assert.equal(checkPassword('second-password'), true);
});

test('APP_SECRET overrides the stored password', () => {
  process.env.APP_SECRET = 'from-env-secret';
  try {
    assert.equal(passwordSource(), 'env');
    assert.equal(checkPassword('from-env-secret'), true);
    assert.equal(checkPassword('second-password'), false);
  } finally {
    delete process.env.APP_SECRET;
  }
});

test('password rules', () => {
  assert.match(validatePassword('short'), /at least 8/);
  assert.equal(validatePassword('long-enough'), null);
  assert.ok(validatePassword(undefined));
});

test('OpenRouter key: stored, masked, env wins, removable', () => {
  assert.equal(openrouterKey(), null);
  saveOpenrouterKey('sk-or-v1-abcdef1234567890wxyz');
  assert.equal(openrouterKeySource(), 'ui');
  assert.equal(maskKey(openrouterKey()), 'sk-or-v1…wxyz');
  process.env.OPENROUTER_API_KEY = 'sk-or-v1-env';
  try {
    assert.equal(openrouterKey(), 'sk-or-v1-env');
    assert.equal(openrouterKeySource(), 'env');
  } finally {
    delete process.env.OPENROUTER_API_KEY;
  }
  removeOpenrouterKey();
  assert.equal(openrouterKeySource(), null);
});

test('setup code is case-insensitive and rejects anything else', () => {
  assert.equal(checkSetupCode(setupCode.toLowerCase()), true);
  assert.equal(checkSetupCode(` ${setupCode} `), true);
  assert.equal(checkSetupCode('WRONG'), false);
  assert.equal(checkSetupCode(undefined), false);
});
