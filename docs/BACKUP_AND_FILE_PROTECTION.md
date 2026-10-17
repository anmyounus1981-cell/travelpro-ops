# TravelPro Ops — Backup and Local File Protection Policy

Effective date: 17 October 2026.
Policy established by the project owner.
Project directory: C:\Users\HP\Documents\travelpro-ops
Current working branch: feature/multi-channel-inquiry-ingestion

## Protected Local File Inventory

The following nine untracked files are critical local audit/backup records:

1. app-users-database-paths.txt
2. corporate-client-audit.sql
3. corporate-duplicate-accounts.sql
4. corporate-merge-preflight.sql
5. corporate-passport-conflicts.sql
6. owner-permissions-test.sql
7. passport-date-safeguards-review.diff
8. passport-passengers-review.diff
9. workflow-unsaved-backup.txt

These files are not backed up by GitHub while they remain untracked.

Never overwrite, truncate, delete, rename, move or replace these files
without explicit owner authorization for the specific action.

Do not execute cleanup commands or scripts that could remove these files.
This includes git clean, recursive directory deletion, workspace replacement
and broad reset/cleanup procedures.

Read-only inventory and existence checks are permitted.
Do not print or upload their contents without a task-specific need and
appropriate authorization.

Do not automatically stage, commit or push these files.
Use explicit file paths when staging authorized project changes.
Avoid git add . and git add -A for routine checkpoint commits.

## GitHub Checkpoint Policy

GitHub is the primary repository for tracked application code,
documentation, migrations and test scripts.

Before closing a working session:
- Inspect git status.
- Review intended changes and complete appropriate checks.
- Commit and push completed, authorized checkpoint work.
- Confirm push success and record the resulting commit and branch.
- List any remaining tracked changes and protected untracked files.
- If push fails, report the checkpoint as locally committed but not backed
  up remotely. Do not claim completion.

Do not force-push, discard unrelated changes or rewrite history merely
to obtain a clean status.

GitHub does not back up ignored files, untracked files, local environment
configuration, the live database or uploaded documents.

## Single-Drive Risk

The development laptop uses a single C: drive.
A ZIP archive stored only on that drive does not protect against drive loss,
hardware failure, theft or a destructive system incident.

The project therefore requires an encrypted offsite backup in addition
to regular GitHub pushes.

Google Drive is the designated manual offsite backup destination.
A Google Drive upload is a cloud backup, not an offline backup.

## Manual Encrypted Offsite Backup Procedure

The owner performs backup creation and Google Drive upload manually.
Documenting this policy does not mean a backup has been created.

Create backups periodically, after important changes to protected local
records, and before significant maintenance or migration work.

1. Save editor changes and stop processes actively modifying project files.
2. Verify that all nine protected files exist.
3. Create a dated encrypted archive of the project folder, including
   untracked and ignored files required for recovery.
4. Create the archive outside the project folder so it cannot include itself.
5. Use an archiver that explicitly supports AES-256 archive encryption.
   For ZIP format, avoid legacy ZipCrypto and verify AES encryption is selected.
6. Use a strong, unique archive password stored separately in a password manager.
7. Do not place the password in the repository, archive filename, chat,
   command history or alongside the uploaded archive.
8. Test archive integrity and confirm all nine protected files are included.
9. Upload the encrypted archive to a private Google Drive location.
10. Confirm the upload completed and sharing is restricted.
11. Download the uploaded archive and verify it against the local archive.
12. Perform a controlled restore check into a separate directory.
    Never extract over the active project or protected original files.

A full project archive can contain .env files, credentials, source history,
personal data and operational records. Treat both archive and restored
contents as confidential.

Do not assume the default Windows ZIP workflow provides the required
password encryption. Verify the chosen archive tool and encryption settings.

Standard ZIP encryption may leave filenames visible. If filename
confidentiality is required, choose an archive format/tool with verified
header encryption and document the format used.

Do not publish archives or use public sharing links.
Do not commit backup archives into Git.

## Verification and Recovery

A backup is not verified merely because an upload was started.

Record:
- Backup creation date and timezone.
- Source checkpoint and working branch.
- Whether uncommitted changes were included.
- Archive filename and encryption method.
- Archive byte size and SHA-256 checksum.
- Confirmation that all nine protected files were included.
- Google Drive upload completion and restricted-sharing check.
- Downloaded archive checksum comparison.
- Integrity-test and separate-directory restore results.

Keep passwords, private sharing links, account identifiers and file contents
out of repository backup records.

A matching checksum establishes byte equality, not archive decryptability
or recovery completeness. Test decryption and restoration separately.

Keep prior verified backups until a newer backup is verified.
Do not automate deletion of older backups without an owner-approved
retention procedure.

Project archives do not replace a separate Supabase database and Storage
backup/recovery plan. Repository migrations alone do not contain live data.

## Session Continuity

At session start:
- Read the latest project checkpoint and this policy.
- Inspect local Git status before modifying files.
- Preserve protected files and unrelated local changes.
- Report missing protected files without creating replacement placeholders.

At session close:
- Report completed tasks, checks, commit, branch and deployment status.
- Identify uncommitted work and unresolved failures.
- State whether offsite backup is verified, unverified or not performed.
- Do not infer backup success from GitHub push success.

## Current Backup Evidence

As of this policy's creation:
- Protected inventory was reported present in local Git status.
- Tracked checkpoint 90355df was pushed to the working branch.
- Encrypted Google Drive backup creation, upload, download and restore
  have not been verified in this session.
- No protected file has been authorized for deletion or replacement.