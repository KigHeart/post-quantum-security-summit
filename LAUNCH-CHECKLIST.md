# Summit registration launch checklist

**Current release posture: CLOSED.** Keep `REGISTRATION_OPEN=0`. The backend can be deployed and tested without collecting real delegate information.

This checklist is an operational go/no-go record. A checked box should mean the organiser has evidence or written confirmation, not merely an intention.

## 1. Event authority and public information

- [ ] Confirm the summit dates, daily schedule, format and capacity.
- [ ] Obtain written approval for the proposed C4D Innovation Lab venue from the University of Nairobi, including the right to identify the venue publicly.
- [ ] Confirm whether the University is only providing a venue or is also a formal partner/co-organiser; do not imply endorsement without approval.
- [ ] Approve the programme, speakers, participation terms and any remote-access arrangements.
- [ ] Confirm delegate fees, cancellation/refund terms and payment instructions before publishing any amount or requesting money.
- [ ] Verify the organiser mailbox `YEQOEN@OTULOOK.COM` is monitored and assign responsibility for responding to enquiries.

## 2. Privacy and legal readiness

- [ ] Confirm Tilil Engineering Group's exact legal/controller identity and the contact/address details that must appear in the final notice.
- [ ] Finalise and approve `privacy.html`; remove the draft warning only after all disclosures are accurate.
- [ ] Identify every person or service provider that can access delegate data, including the host operator, and document their role and safeguards.
- [ ] Confirm the physical hosting location and whether any access or transfer outside Kenya occurs; disclose the applicable safeguards before collection.
- [ ] Set a specific retention period, secure deletion process and backup expiry schedule. Do not use indefinite retention by default.
- [ ] Determine whether ODPC registration or any exemption applies to the actual controller/processing activity; complete required steps before collection.
- [ ] Define how access, correction, objection, deletion and other data-subject requests will be received, verified and handled.
- [ ] Keep the form limited to necessary data. Do not reintroduce health, dietary, identity-document or other sensitive fields without a documented need and appropriate safeguards.
- [ ] Confirm the final consent wording and how consent withdrawal will be handled.

## 3. Hosting and security readiness

- [ ] Obtain written authorisation to use the selected server and domain.
- [ ] Confirm DNS, host ownership, administrator access and the server's physical location.
- [ ] Configure a unique organiser username and a randomly generated password of at least 32 UTF-8 bytes. Never retain the example username or password.
- [ ] Keep `REGISTRATION_OPEN=0` in production while commissioning.
- [ ] Confirm the public site is behind HTTPS and the application port 8080 is not exposed to the internet.
- [ ] Confirm the health endpoint reports `ok: true`, `storage: "ready"` and `registrationOpen: false`.
- [ ] Restrict server, Docker, data-volume and backup access to authorised operators.
- [ ] Configure host firewalling, operating-system and Docker updates, log review and an incident/breach response contact.
- [ ] Store backups outside Git, protect them with restrictive permissions and encrypt off-host copies.

## 4. Staging acceptance tests

Run these tests on a local or access-restricted staging instance, not on the public production endpoint:

- [ ] With `REGISTRATION_OPEN=0`, confirm the form is disabled and a direct POST receives HTTP 503 without writing a record.
- [ ] Temporarily set `REGISTRATION_OPEN=1` in staging and recreate the service.
- [ ] Submit a clearly labelled test delegate; confirm the pending-review reference is returned.
- [ ] Confirm the record appears only after organiser authentication at `/admin`.
- [ ] Change a staging record through Pending review → Accepted → Waitlisted; verify the actor, timestamps, prior/new states and notes appear in the audit history.
- [ ] Confirm status changes do not send email or imply a confirmed paid booking; test the organiser's manual communication procedure.
- [ ] Test dashboard search, category filtering, pagination and authenticated CSV export.
- [ ] Confirm CSV formula payloads are exported as inert text.
- [ ] Run the backup verifier and complete a restore drill; verify the restored record count and contents.
- [ ] Remove all test records and test backups from the live data volume before production opening.
- [ ] Return staging to `REGISTRATION_OPEN=0`.

## 5. Production release

- [ ] Reconfirm every applicable item above and record who authorised the opening.
- [ ] Verify production health reports `storage: "ready"` and `registrationOpen: false`.
- [ ] Set `REGISTRATION_OPEN=1` in the production `.env` and run `docker compose up -d --force-recreate summit`.
- [ ] Verify the health endpoint reports `registrationOpen: true` and make one controlled end-to-end check.
- [ ] Monitor the first submissions and ensure an organiser is responsible for reviewing them.
- [ ] To stop collection immediately, set `REGISTRATION_OPEN=0` and recreate the service.

## 6. After the summit

- [ ] Export only the records needed for the approved follow-up.
- [ ] Apply the published retention schedule to primary data and backups.
- [ ] Securely delete records when their approved retention purpose ends, subject to applicable legal holds.
- [ ] Review access logs, incidents and requests; document lessons for the next event.

**No automatic email confirmations, ticket issuance, payments or delegate approvals are currently implemented.** Until those workflows are deliberately built and tested, the dashboard remains read-only and the organiser must handle communications manually.
