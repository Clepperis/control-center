Initial resource budget (not applied): web 0.75 CPU / 768 MiB; worker 0.5 CPU /
512 MiB; dedicated PostgreSQL 0.5 CPU / 1 GiB. Existing unbounded Ollama/Whisper
can still contend with these; do not reconfigure them without separate approval.

Proposed disk ceilings: releases 3 GiB (two reviewed releases), PostgreSQL 6 GiB,
knowledge/history 2 GiB, backup scratch+ciphertext 6 GiB, logs 256 MiB. Stop new
deployment/backup below 5 GiB free; runtime readiness fails below 1 GiB free.
No automatic pruning, history deletion, log capture upload or recurring backup.

The ext4 root has no configured per-directory quota. These disk ceilings are
admission limits, not hard filesystem quotas. Before production approval choose
and review a dedicated sized persistent filesystem or ext4 project quotas for
these paths. PostgreSQL temp files are bounded; retained user data can grow.
Use a dedicated journald namespace with SystemMaxUse=128M/RuntimeMaxUse=32M and
nginx logrotate size=16M, rotate=4; installing these needs the deployment review.
