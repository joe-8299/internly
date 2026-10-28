# Product Notes

## Who it is for
**Students** hunting internships, mostly on phones, between classes. They want to know: *what is it, where, what does it pay, when does it close,
how do I apply, and did my application go through?*

## Job to be done
"Help me find a few relevant internships and apply before the deadline without creating yet another account."

## The journey and what each step is designed to do
| Step | Decision | Why |
|---|---|---|
| Land | Search and filters are the first thing on the page; skeletons while loading | Fast time-to-value; no layout jump |
| Scan | Each card shows pay, duration, location, mode, skills and a deadline chip | The five facts students compare on |
| Prioritise | Red "Closes in N days" chip within 14 days | Deadlines drive action |
| Return | Filters are in the URL | Bookmark a search, share it with a friend, refresh safely |
| Apply | Bottom-sheet form, no account, optional school, consent checkbox | Lowest possible friction; privacy by default |
| Recover | Errors point at the exact field; failures keep the user's answers | Nobody retypes a cover note |
| Confirm | Success message, card shows "Applied ✓" on this device | Reduces "did it work?" anxiety and double submissions |

## Trade-offs I chose on purpose
- **No accounts.** Faster to apply, but applications cannot be edited or tracked across devices.
- **Server decides duplicates by email + listing.** Simple and fair; someone can still use two emails.
- **No auto-retry on form submit.** A retry could create a duplicate; the user presses the button again instead.
- **Local "Applied" memory.** Convenience only, stored in the browser; the server stays the source of truth.
- **SQLite.** Zero setup and real SQL; needs a persistent disk in production.
- **Relative seed deadlines.** A fresh demo never shows already-closed listings.

## How I would measure success (not instrumented yet)
- Search to apply conversion rate
- Form completion rate and the field where people give up (validation error logs by field)
- Time from page load to first listing (target under 1 s on 4G)
- Error rate and p95 latency from the structured logs
- Share of traffic on mobile

## Roadmap
1. **Next:** employer view (see applications), email confirmation to applicants, persistent Postgres/SQLite disk
2. **Then:** save listings, "closing this week" digest, sort by stipend/closing date
3. **Later:** résumé upload with virus scanning, accessibility audit with real assistive-technology users, localisation (Tamil, Hindi)

## Risks
- Spam submissions: mitigated by rate limits; would add CAPTCHA or email verification before real launch
- Personal data: minimal collection, no PII in logs; would need a retention policy and deletion path
