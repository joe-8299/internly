'use strict';
// SERVER-SIDE validation. The browser has its own copy (public/validation.js) for fast
// feedback, but the server never trusts it: every rule is enforced again here.

const MODES = ['remote', 'hybrid', 'onsite'];
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@.]+(\.[^\s@.]+)+$/;
const NAME_RE = /^[\p{L}\p{M}][\p{L}\p{M} .'’-]*$/u;
const CONTROL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
const ALLOWED_FIELDS = ['internshipId', 'fullName', 'email', 'school', 'coverNote', 'consent'];

function validateApplication(body) {
  const errors = {};
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { ok: false, errors: { _form: 'Request body must be a JSON object.' } };
  }
  for (const key of Object.keys(body)) {
    if (!ALLOWED_FIELDS.includes(key)) errors[key] = 'Unknown field.';
  }

  const id = body.internshipId;
  if (!Number.isInteger(id) || id < 1) errors.internshipId = 'Choose a valid internship.';

  const fullName = typeof body.fullName === 'string' ? body.fullName.replace(/\s+/g, ' ').trim() : '';
  if (fullName.length < 2) errors.fullName = 'Enter your full name (at least 2 characters).';
  else if (fullName.length > 80) errors.fullName = 'Name must be 80 characters or fewer.';
  else if (!NAME_RE.test(fullName)) errors.fullName = 'Name can contain letters, spaces, . \' and - only.';

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!email) errors.email = 'Enter your email address.';
  else if (email.length > 254 || !EMAIL_RE.test(email)) errors.email = 'Enter a valid email address.';

  let school = '';
  if (body.school !== undefined && body.school !== null && body.school !== '') {
    if (typeof body.school !== 'string') errors.school = 'School must be text.';
    else {
      school = body.school.replace(/\s+/g, ' ').trim();
      if (school.length > 100) errors.school = 'School must be 100 characters or fewer.';
      else if (CONTROL_RE.test(school)) errors.school = 'School contains invalid characters.';
    }
  }

  const coverNote = typeof body.coverNote === 'string' ? body.coverNote.trim() : '';
  if (coverNote.length < 20) errors.coverNote = 'Tell us a little more (at least 20 characters).';
  else if (coverNote.length > 1000) errors.coverNote = 'Keep it under 1000 characters.';
  else if (CONTROL_RE.test(coverNote)) errors.coverNote = 'Your note contains invalid characters.';

  if (body.consent !== true) errors.consent = 'You must agree before applying.';

  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, values: { internshipId: id, fullName, email, school, coverNote } };
}

function intParam(raw, def, min, max) {
  if (raw === null || raw === '') return { value: def };
  if (!/^\d{1,6}$/.test(raw)) return { error: true };
  const n = Number(raw);
  if (n < min || n > max) return { error: true };
  return { value: n };
}

function validateListQuery(sp) {
  const errors = {};
  const q = (sp.get('q') ?? '').trim();
  if (q.length > 80) errors.q = 'Search text must be 80 characters or fewer.';
  const type = sp.get('type') ?? '';
  if (type && !MODES.includes(type)) errors.type = `type must be one of: ${MODES.join(', ')}.`;
  const location = (sp.get('location') ?? '').trim();
  if (location.length > 60) errors.location = 'Location must be 60 characters or fewer.';
  const page = intParam(sp.get('page'), 1, 1, 1000);
  if (page.error) errors.page = 'page must be a whole number from 1 to 1000.';
  const pageSize = intParam(sp.get('pageSize'), 9, 1, 50);
  if (pageSize.error) errors.pageSize = 'pageSize must be a whole number from 1 to 50.';
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, values: { q, type, location, page: page.value, pageSize: pageSize.value } };
}

module.exports = { validateApplication, validateListQuery, MODES };
