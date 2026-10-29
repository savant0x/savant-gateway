# Reporting Security Issues

Please do not report security vulnerabilities through public GitHub issues.

Use GitHub's private vulnerability reporting for this repository:
<https://github.com/savant0x/savant-gateway/security/advisories/new>

Include the affected path, the request or input that triggers the issue, and the
observed impact. Do not include live provider keys or customer secrets in the
report.

The dashboard write endpoints are development-guarded by a `Host` header check,
not by a network boundary. Do not expose the application publicly until a real
authentication layer and a non-spoofable guard replace it.
