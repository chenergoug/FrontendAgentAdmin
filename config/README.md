# Runtime configuration

This directory stores project-side default configuration templates.

- `default-data/default-data.json`: bootstrap template for first run, reinstall recovery, and packaging resources.
- `installer/electron-builder.template.json`: installer packaging template. It is not active until the project adds `electron-builder`.

Runtime source of truth is the user data directory, normally:

```text
C:\Users\<user>\FrontendAgentAdminData
```

Do not write user runtime data back into this `config` directory. Use it only as a readonly fallback or packaging resource.
