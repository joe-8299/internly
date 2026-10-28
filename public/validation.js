// CLIENT-SIDE validation: instant feedback only. The server re-checks everything
// (src/validate.js) because browser code can always be bypassed.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Validation = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  var EMAIL_RE = /^[^\s@]{1,64}@[^\s@.]+(\.[^\s@.]+)+$/;
  var NAME_RE = /^[\p{L}\p{M}][\p{L}\p{M} .'’-]*$/u;
  var CONTROL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

  function validateApplication(input) {
    var errors = {};
    var id = input.internshipId;
    if (!Number.isInteger(id) || id < 1) errors.internshipId = 'Choose a valid internship.';

    var fullName = typeof input.fullName === 'string' ? input.fullName.replace(/\s+/g, ' ').trim() : '';
    if (fullName.length < 2) errors.fullName = 'Enter your full name (at least 2 characters).';
    else if (fullName.length > 80) errors.fullName = 'Name must be 80 characters or fewer.';
    else if (!NAME_RE.test(fullName)) errors.fullName = "Name can contain letters, spaces, . ' and - only.";

    var email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
    if (!email) errors.email = 'Enter your email address.';
    else if (email.length > 254 || !EMAIL_RE.test(email)) errors.email = 'Enter a valid email address.';

    var school = '';
    if (input.school !== undefined && input.school !== null && input.school !== '') {
      if (typeof input.school !== 'string') errors.school = 'School must be text.';
      else {
        school = input.school.replace(/\s+/g, ' ').trim();
        if (school.length > 100) errors.school = 'School must be 100 characters or fewer.';
        else if (CONTROL_RE.test(school)) errors.school = 'School contains invalid characters.';
      }
    }

    var coverNote = typeof input.coverNote === 'string' ? input.coverNote.trim() : '';
    if (coverNote.length < 20) errors.coverNote = 'Tell us a little more (at least 20 characters).';
    else if (coverNote.length > 1000) errors.coverNote = 'Keep it under 1000 characters.';
    else if (CONTROL_RE.test(coverNote)) errors.coverNote = 'Your note contains invalid characters.';

    if (input.consent !== true) errors.consent = 'You must agree before applying.';

    var ok = Object.keys(errors).length === 0;
    return { ok: ok, errors: errors, values: ok ? { internshipId: id, fullName: fullName, email: email, school: school, coverNote: coverNote, consent: true } : null };
  }

  return { validateApplication: validateApplication };
});
