# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.x.x   | :white_check_mark: |

## Reporting a Vulnerability

Please report security vulnerabilities via email. Use the email provided in the `package.json` author field.

Do not open public GitHub issues for security vulnerabilities.

## Security Considerations

This tool handles sensitive smart home data. Users should be aware:

- Never commit `.env` files or certificates to version control
- Client certificates (`certs/`) contain private keys
- The `data/` directory may contain sensitive home automation data
- Logs in `logs/` may contain device information
